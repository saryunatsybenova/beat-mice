import Phaser from 'phaser';
import { BALANCE, GARDEN_EVENTS } from './settings';
import { COLORS, EVENT_ACCENTS, ANIMATION, CELL_SIZE, HOLE_RADIUS } from './theme';
import { makeText, panel } from './ui/widgets';
import { makeMouse, makePredictionMarker, makeUsefulItem, type MouseType, type UsefulItemType } from './visuals';
import type { GameStage } from './GameState';
import type { GardenEventType } from './GardenEvents';

export interface Hole {
  x: number;
  y: number;
  mouse: Phaser.GameObjects.Container | null;
  mouseType: MouseType | null;
  item: Phaser.GameObjects.Container | null;
  itemType: UsefulItemType | null;
  helmet: Phaser.GameObjects.Container | null;
  helmetTween?: Phaser.Tweens.Tween;
  helmetRemoved: boolean;
  hideTimer?: Phaser.Time.TimerEvent;
  itemCounter?: Phaser.GameObjects.Text;
  cover?: Phaser.GameObjects.Container;
  coverCounter?: Phaser.GameObjects.Text;
  fadingObjects: Set<Phaser.GameObjects.Container>;
}

interface MousePlan {
  type: MouseType;
  convertedByClover: boolean;
}

interface SpawnSchedule {
  intervalMs: number;
  spawn: () => void;
  warn?: () => void;
}

const specialSlot = (type: MouseType): MouseType => type === 'friendly' ? 'decoy' : type;

const HOLE_SOIL_Y = 13;
const HOLE_SOIL_WIDTH = HOLE_RADIUS * 2 + 8;
const HOLE_SOIL_HEIGHT = 66;
const FIELD_INSET = 14;
const FIELD_TOP = 128;
const FIELD_BOTTOM = 22;
const FIELD_RADIUS = 36;
const PREDICTION_MARKER_OFFSET_Y = 45;
const COMPACT_PREDICTION_MARKER_OFFSET_Y = 33;
const PREDICTION_MARKER_RADIUS = 22;

/** Поле, мыши и их таймеры. Счёт и жизни меняет только GameState. */
export class MouseField {
  readonly holes: Hole[] = [];
  private ground?: Phaser.GameObjects.Container;
  private holeDecor?: Phaser.GameObjects.Container;
  private phaseTint?: Phaser.GameObjects.Graphics;
  private eventRim?: Phaser.GameObjects.Graphics;
  private eventAccent?: GardenEventType;
  private gameStage: GameStage = 1;
  private shakeTween?: Phaser.Tweens.Tween;
  private readonly fadingSpecialTypes = new Map<MouseType, number>();
  private layoutWidth = 960;
  private layoutHeight = 640;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private warningTimer?: Phaser.Time.TimerEvent;
  private spawnSchedule?: SpawnSchedule;
  private prediction?: MousePlan & { hole: Hole; marker: Phaser.GameObjects.Container };

  constructor(private readonly scene: Phaser.Scene, private readonly onHoleFreed: (hole: Hole) => void,
    private readonly onMouseAppeared: (hole: Hole, predicted: boolean, convertedByClover: boolean) => void) {}

  get gardenBounds() {
    return {
      x: FIELD_INSET, y: FIELD_TOP, width: this.layoutWidth - 2 * FIELD_INSET,
      height: this.layoutHeight - FIELD_TOP - FIELD_BOTTOM, radius: FIELD_RADIUS,
    };
  }

  resize(width: number, height: number): void {
    this.cancelShake();
    this.layoutWidth = width;
    this.layoutHeight = height;
    this.ground?.destroy();
    this.holeDecor?.destroy();
    this.createGround();
    this.createHoles();
    if (this.prediction) {
      const { hole, marker } = this.prediction;
      marker.setPosition(hole.x, this.predictionMarkerY(hole));
    }
    this.applyStageTint();
    this.drawEventAccent();
  }

  setStage(stage: GameStage): void {
    this.gameStage = stage;
    this.applyStageTint();
  }

  setEventAccent(event?: GardenEventType): void {
    if (this.eventAccent === event) return;
    this.eventAccent = event;
    this.drawEventAccent();
  }

  shake(durationMs: number, amplitude: number): void {
    this.cancelShake();
    const targets = [this.ground, this.holeDecor]
      .filter((object): object is Phaser.GameObjects.Container => object !== undefined);
    this.shakeTween = this.scene.tweens.add({
      targets,
      x: amplitude,
      duration: durationMs / 6,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.inOut',
      onComplete: () => { this.shakeTween = undefined; },
    });
  }

  scheduleSpawns(intervalMs: number, spawn: () => void, warn?: () => void): void {
    this.stopSpawns();
    this.spawnSchedule = { intervalMs, spawn, warn };
    this.scheduleSpawnCycle(this.spawnSchedule);
  }

  setSpawnInterval(intervalMs: number): void {
    const schedule = this.spawnSchedule;
    if (!schedule || schedule.intervalMs === intervalMs) return;
    schedule.intervalMs = intervalMs;
    // Уже обещанное очками появление завершает прежний цикл.
    if (!this.spawnTimer || this.prediction) return;
    this.cancelSpawnTimers();
    this.scheduleSpawnCycle(schedule);
  }

  private scheduleSpawnCycle(schedule: SpawnSchedule): void {
    const { intervalMs, spawn, warn } = schedule;
    const timer = this.scene.time.delayedCall(intervalMs, () => {
      this.cancelSpawnTimers();
      spawn();
      if (this.spawnSchedule === schedule) this.scheduleSpawnCycle(schedule);
    });
    this.spawnTimer = timer;
    if (!warn) return;
    const lead = intervalMs > BALANCE.glassesWarningMs ? BALANCE.glassesWarningMs : intervalMs / 2;
    this.warningTimer = this.scene.time.delayedCall(intervalMs - lead, () => {
      if (this.spawnTimer === timer) warn();
    });
  }

  private isFree(hole: Hole): boolean {
    return hole.mouse === null && hole.item === null && !hole.cover && this.prediction?.hole !== hole;
  }

  private randomFreeHole(allowFading = true): Hole | undefined {
    const freeHoles = this.holes.filter(hole => this.isFree(hole) && (allowFading || hole.fadingObjects.size === 0));
    return freeHoles.length > 0 ? Phaser.Utils.Array.GetRandom(freeHoles) : undefined;
  }

  blockHole(hole = this.randomFreeHole()): Hole | undefined {
    if (!hole || !this.isFree(hole) ||
      this.holes.filter(candidate => candidate.cover).length >= BALANCE.cheeseBlockedHoles.bigCheese) return;

    const width = HOLE_RADIUS * 2 - 4;
    const wood = this.scene.add.ellipse(0, 8, width, 54, COLORS.soil)
      .setStrokeStyle(4, COLORS.holeInner);
    const details = this.scene.add.graphics().lineStyle(2, COLORS.holeRim)
      .lineBetween(-49, -2, 49, -2).lineBetween(-49, 18, 49, 18)
      .fillStyle(COLORS.holeInner);
    details.fillCircle(-37, 8, 3).fillCircle(37, 8, 3);
    hole.cover = this.scene.add.container(hole.x, hole.y, [wood, details]).setDepth(2);
    hole.coverCounter = this.addAppearanceCounter(hole.cover, 8);
    return hole;
  }

  unblockHole(hole: Hole): void {
    hole.cover?.destroy();
    hole.cover = undefined;
    hole.coverCounter = undefined;
  }

  updateBlockCount(hole: Hole, remaining: number): void {
    hole.coverCounter?.setText(String(remaining));
  }

  isBlockedAt(x: number, y: number): boolean {
    return this.holes.some(hole => hole.cover &&
      Phaser.Math.Distance.Between(x, y, hole.x, hole.y + 8) <= HOLE_RADIUS);
  }

  stopSpawns(): void {
    this.spawnSchedule = undefined;
    this.cancelSpawnTimers();
    this.cancelPrediction();
  }

  private cancelSpawnTimers(): void {
    this.spawnTimer?.remove();
    this.spawnTimer = undefined;
    this.warningTimer?.remove();
    this.warningTimer = undefined;
  }

  private countMouseType(type: MouseType): number {
    const slot = specialSlot(type);
    const reserved = this.prediction && specialSlot(this.prediction.type) === slot ? 1 : 0;
    const visible = this.holes.filter(hole => hole.mouseType !== null && specialSlot(hole.mouseType) === slot).length;
    return reserved + visible + (this.fadingSpecialTypes.get(slot) ?? 0);
  }

  get predictedType(): MouseType | undefined { return this.prediction?.type; }

  reserveMouse(requested: MouseType, cloverRemaining = 0, flowerActive = false,
    goldenLimit: number = GARDEN_EVENTS.normalGoldenLimit): void {
    if (this.prediction) return;
    const hole = this.randomFreeHole(false);
    if (!hole) return;
    const plan = this.planMouse(requested, cloverRemaining, flowerActive, goldenLimit);
    const marker = makePredictionMarker(this.scene, hole.x, this.predictionMarkerY(hole),
      PREDICTION_MARKER_RADIUS, plan.type);
    this.prediction = { hole, marker, ...plan };
  }

  private predictionMarkerY(hole: Hole): number {
    return hole.y - (this.layoutHeight === 500 ? COMPACT_PREDICTION_MARKER_OFFSET_Y : PREDICTION_MARKER_OFFSET_Y);
  }

  isPredictionAt(x: number, y: number): boolean {
    const marker = this.prediction?.marker;
    return marker !== undefined && Phaser.Math.Distance.Between(x, y, marker.x, marker.y) <= PREDICTION_MARKER_RADIUS;
  }

  cancelPrediction(): void {
    this.prediction?.marker.destroy();
    this.prediction = undefined;
  }

  spawnPredictedMouse(baseVisibleMs: number, miss: (hole: Hole) => void): void {
    if (!this.prediction) return;
    const { hole, type, convertedByClover } = this.prediction;
    this.cancelPrediction();
    if (this.isFree(hole)) {
      this.placeMouse(hole, this.visibleTime(baseVisibleMs, type), miss, { type, convertedByClover }, true);
    }
  }

  spawnMouse(baseVisibleMs: number, miss: (hole: Hole) => void, requested: MouseType = 'normal',
    cloverRemaining = 0, flowerActive = false, goldenLimit: number = GARDEN_EVENTS.normalGoldenLimit): void {
    const hole = this.randomFreeHole();
    if (!hole) return;
    const plan = this.planMouse(requested, cloverRemaining, flowerActive, goldenLimit);
    // Обычный запасной выбор сохраняет прежний таймер, превращение использует время показа золотой.
    const visibleType = plan.convertedByClover ? plan.type : requested;
    this.placeMouse(hole, this.visibleTime(baseVisibleMs, visibleType), miss, plan, false);
  }

  private planMouse(requested: MouseType, cloverRemaining: number, flowerActive: boolean, goldenLimit: number): MousePlan {
    const limit = requested === 'golden' ? goldenLimit : 1;
    const type = requested !== 'normal' && this.countMouseType(requested) >= limit ? 'normal' : requested;
    if (type === 'decoy' && flowerActive) return { type: 'friendly', convertedByClover: false };
    const reserved = this.prediction?.convertedByClover ? 1 : 0;
    const convertedByClover = type === 'normal' && cloverRemaining > reserved && this.countMouseType('golden') < goldenLimit;
    return { type: convertedByClover ? 'golden' : type, convertedByClover };
  }

  private visibleTime(baseVisibleMs: number, type: MouseType): number {
    return baseVisibleMs * (type === 'helmet' ? BALANCE.helmetVisibleTimeMultiplier : 1);
  }

  private placeMouse(hole: Hole, visibleMs: number, miss: (hole: Hole) => void, { type, convertedByClover }: MousePlan,
    predicted: boolean): void {
    const appearance = makeMouse(this.scene, hole.x, hole.y, type);
    const mouse = appearance.object;
    mouse.setScale(0.2).setAlpha(0);
    this.scene.tweens.add({ targets: mouse, scale: 1, alpha: 1, duration: ANIMATION.appear, ease: 'Back.out' });
    hole.mouse = mouse;
    hole.mouseType = type;
    hole.helmet = appearance.helmet ?? null;
    hole.helmetRemoved = false;
    hole.hideTimer = this.scene.time.delayedCall(visibleMs, () => {
      if (hole.mouse !== mouse) return;
      if (type === 'decoy' || type === 'friendly' || type === 'golden') this.clearMouse(hole);
      else miss(hole);
    });
    this.onMouseAppeared(hole, predicted, convertedByClover);
  }

  spawnUsefulItem(choose: () => UsefulItemType | undefined, hole = this.randomFreeHole()): Hole | undefined {
    if (!hole || !this.isFree(hole) || this.holes.some(candidate => candidate.item !== null)) return;
    const type = choose();
    if (!type) return;
    const item = makeUsefulItem(this.scene, hole.x, hole.y - 8, type).setScale(0.65).setAlpha(0);
    this.scene.tweens.add({ targets: item, scale: 1, alpha: 1, duration: ANIMATION.appear, ease: 'Back.out' });
    hole.item = item;
    hole.itemType = type;
    hole.itemCounter = this.addAppearanceCounter(item, 35);
    return hole;
  }

  updateItemCount(hole: Hole, remaining: number): void {
    hole.itemCounter?.setText(String(remaining));
  }

  private addAppearanceCounter(parent: Phaser.GameObjects.Container, y: number): Phaser.GameObjects.Text {
    const badge = this.scene.add.container(0, y);
    const background = this.scene.add.graphics().fillStyle(COLORS.cream)
      .fillRoundedRect(-22, -11, 44, 22, 10);
    const mouse = makeMouse(this.scene, -10, 2).object.setScale(0.16);
    const text = makeText(this.scene, 9, 0, '', 15, COLORS.ink, 0.5, 0.5).setFontStyle('bold');
    badge.add([background, mouse, text]);
    parent.add(badge);
    return text;
  }

  findItem(x: number, y: number): Hole | undefined {
    return this.holes.find(hole => hole.item?.visible &&
      Phaser.Math.Distance.Between(x, y, hole.x, hole.y) <= BALANCE.usefulItemHitRadius);
  }

  setItemsVisible(visible: boolean): void {
    for (const hole of this.holes) hole.item?.setVisible(visible);
  }

  clearItem(hole: Hole, { animate = true, notify = true } = {}): void {
    const item = hole.item;
    hole.item = null;
    hole.itemType = null;
    hole.itemCounter = undefined;
    if (!item) return;
    this.scene.tweens.killTweensOf(item);
    if (notify) this.onHoleFreed(hole);
    if (!animate) {
      item.destroy();
      return;
    }
    hole.fadingObjects.add(item);
    this.scene.tweens.add({
      targets: item, scale: 0.6, alpha: 0, duration: ANIMATION.hide,
      onComplete: () => {
        hole.fadingObjects.delete(item);
        item.destroy();
      },
    });
  }

  findMouse(x: number, y: number): Hole | undefined {
    return this.holes.find(hole => hole.mouse !== null &&
      Phaser.Math.Distance.Between(x, y, hole.x, hole.y) <=
      (hole.mouseType === 'decoy' || hole.mouseType === 'friendly' ? BALANCE.falseMouseHitRadius :
        hole.mouseType === 'golden' ? BALANCE.goldenMouseHitRadius :
          hole.mouseType === 'helmet' && !hole.helmetRemoved ? BALANCE.helmetHitRadius :
            BALANCE.mouseHitRadius));
  }

  findEmptyHole(x: number, y: number): Hole | undefined {
    return this.holes.find(hole => this.isFree(hole) && hole.fadingObjects.size === 0 &&
      ((x - hole.x) / (HOLE_SOIL_WIDTH / 2)) ** 2 +
      ((y - hole.y - HOLE_SOIL_Y) / (HOLE_SOIL_HEIGHT / 2)) ** 2 <= 1);
  }

  removeHelmet(hole: Hole): void {
    const helmet = hole.helmet;
    if (!helmet) return;
    hole.helmet = null;
    hole.helmetRemoved = true;
    hole.helmetTween = this.scene.tweens.add({
      targets: helmet,
      x: -18,
      y: -92,
      angle: -35,
      alpha: 0,
      duration: ANIMATION.hide * 2,
      onComplete: () => {
        helmet.destroy();
        hole.helmetTween = undefined;
      },
    });
  }

  clearMouse(hole: Hole, hit = false): void {
    hole.hideTimer?.remove();
    hole.hideTimer = undefined;
    const mouse = hole.mouse;
    const mouseType = hole.mouseType;
    hole.helmetTween?.stop();
    hole.helmetTween = undefined;
    hole.mouse = null; // сразу помечаем нору свободной — повторное попадание не засчитается
    hole.mouseType = null;
    hole.helmet = null;
    hole.helmetRemoved = false;
    if (!mouse) return;
    const slot = mouseType === null || mouseType === 'normal' ? undefined : specialSlot(mouseType);
    if (slot) this.fadingSpecialTypes.set(slot, (this.fadingSpecialTypes.get(slot) ?? 0) + 1);
    this.scene.tweens.killTweensOf(mouse);

    hole.fadingObjects.add(mouse);
    this.scene.tweens.add({
      targets: mouse,
      scale: hit ? 1.18 : 0.2,
      alpha: 0,
      angle: hit ? 12 : 0,
      duration: ANIMATION.hide,
      onComplete: () => {
        hole.fadingObjects.delete(mouse);
        mouse.destroy();
        if (slot) {
          const remaining = (this.fadingSpecialTypes.get(slot) ?? 1) - 1;
          if (remaining > 0) this.fadingSpecialTypes.set(slot, remaining);
          else this.fadingSpecialTypes.delete(slot);
        }
      },
    });
    this.onHoleFreed(hole);
  }

  clearMice(): void {
    this.stopSpawns();
    for (const hole of this.holes) this.clearMouse(hole);
  }

  clearAll(): void {
    this.clearMice();
    for (const hole of this.holes) {
      this.clearItem(hole, { animate: false });
      this.unblockHole(hole);
    }
  }

  dispose(): void {
    this.cancelShake();
    this.stopSpawns();
    for (const hole of this.holes) {
      hole.hideTimer?.remove();
      hole.helmetTween?.stop();
      hole.item?.destroy();
      this.unblockHole(hole);
      if (hole.mouse) {
        this.scene.tweens.killTweensOf(hole.mouse);
        hole.mouse.destroy();
      }
      hole.hideTimer = undefined;
      hole.mouse = null;
      hole.mouseType = null;
      hole.item = null;
      hole.itemType = null;
      hole.itemCounter = undefined;
      hole.helmet = null;
      hole.helmetTween = undefined;
      hole.helmetRemoved = false;
      hole.fadingObjects.clear();
    }
    this.fadingSpecialTypes.clear();
    this.ground?.destroy();
    this.holeDecor?.destroy();
    this.phaseTint = undefined;
    this.eventRim = undefined;
  }

  private createGround(): void {
    const w = this.layoutWidth, h = this.layoutHeight;
    const { x, y, width, height, radius } = this.gardenBounds;
    this.ground = this.scene.add.container(0, 0).setDepth(-10);
    this.ground.add(this.scene.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground));
    this.ground.add(panel(this.scene, x, y, width, height, radius, COLORS.grass));
    this.phaseTint = this.scene.add.graphics();
    this.ground.add(this.phaseTint);
    this.eventRim = this.scene.add.graphics();
    this.ground.add(this.eventRim);
    const grass = this.scene.add.graphics().lineStyle(2, COLORS.leaf, 0.3);
    for (let i = 0; i < 42; i++) {
      const x = 28 + ((i * 137) % (w - 56));
      const y = 150 + ((i * 97) % (h - 185));
      grass.lineBetween(x - 4, y, x - 7, y - 7);
      grass.lineBetween(x, y, x + 2, y - 9);
      grass.lineBetween(x + 4, y, x + 8, y - 5);
    }
    this.ground.add(grass);
    for (let i = 0; i < 8; i++) {
      const x = i % 2 ? w - 27 : 27;
      const y = 173 + Math.floor(i / 2) * (h - 210) / 4;
      const flower = this.scene.add.container(x, y);
      for (let p = 0; p < 5; p++) {
        const angle = p * Math.PI * 2 / 5;
        flower.add(this.scene.add.circle(Math.cos(angle) * 6, Math.sin(angle) * 6, 4, COLORS.cream));
      }
      flower.add(this.scene.add.circle(0, 0, 3, COLORS.accent));
      this.ground.add(flower);
    }
  }

  private createHoles(): void {
    const portrait = this.layoutWidth === 480;
    const spacingX = portrait ? 144 : CELL_SIZE;
    const spacingY = portrait ? 184 : this.layoutHeight === 500 ? 120 : 164;
    const startX = (this.layoutWidth - (BALANCE.gridCols - 1) * spacingX) / 2;
    const startY = portrait ? 237 : this.layoutHeight === 500 ? 181 : 236;
    this.holeDecor = this.scene.add.container(0, 0).setDepth(-5);
    for (let row = 0; row < BALANCE.gridRows; row++) {
      for (let col = 0; col < BALANCE.gridCols; col++) {
        const x = startX + col * spacingX, y = startY + row * spacingY;
        this.holeDecor.add([
          this.scene.add.ellipse(x, y + 22, HOLE_RADIUS * 2 + 16, 65, COLORS.leaf).setAlpha(0.25),
          this.scene.add.ellipse(x, y + HOLE_SOIL_Y, HOLE_SOIL_WIDTH, HOLE_SOIL_HEIGHT, COLORS.soil),
          this.scene.add.ellipse(x, y + 9, HOLE_RADIUS * 2, 58, COLORS.holeRim),
          this.scene.add.ellipse(x, y + 7, HOLE_RADIUS * 2 - 12, 43, COLORS.holeInner),
        ]);
        const index = row * BALANCE.gridCols + col;
        if (this.holes[index]) {
          const hole = this.holes[index];
          for (const object of hole.fadingObjects) object.setPosition(x, y + object.y - hole.y);
          hole.x = x; hole.y = y;
          if (hole.mouse) hole.mouse.setPosition(x, y);
          if (hole.item) hole.item.setPosition(x, y - 8);
          if (hole.cover) hole.cover.setPosition(x, y);
        } else this.holes.push({
          x, y, mouse: null, mouseType: null, item: null, itemType: null,
          helmet: null, helmetRemoved: false, fadingObjects: new Set(),
        });
      }
    }
  }

  private applyStageTint(): void {
    const { x, y, width, height, radius } = this.gardenBounds;
    this.phaseTint?.clear().fillStyle(this.gameStage === 4 ? COLORS.phase4Tint : COLORS.phase2Tint)
      .fillRoundedRect(x, y, width, height, radius)
      .setAlpha(this.gameStage >= 2 ? BALANCE.phase2TintAlpha : 0);
  }

  private drawEventAccent(): void {
    this.eventRim?.clear();
    if (!this.eventRim || !this.eventAccent) return;
    const { x, y, width, height, radius } = this.gardenBounds;
    const { rimColor } = EVENT_ACCENTS[this.eventAccent];
    this.eventRim.lineStyle(10, rimColor, 0.17).strokeRoundedRect(x + 6, y + 6, width - 12, height - 12, radius - 6);
    this.eventRim.lineStyle(3, rimColor, 0.56).strokeRoundedRect(x + 3, y + 3, width - 6, height - 6, radius - 3);
  }

  private cancelShake(): void {
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.ground?.setX(0);
    this.holeDecor?.setX(0);
  }
}
