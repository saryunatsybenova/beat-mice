import Phaser from 'phaser';
import { BALANCE } from './settings';
import { COLORS, ANIMATION, CELL_SIZE, HOLE_RADIUS } from './theme';
import { panel } from './ui/widgets';
import { makeMouse, makeUsefulItem, type MouseType, type UsefulItemType } from './visuals';

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
  itemTimer?: Phaser.Time.TimerEvent;
  cover?: Phaser.GameObjects.Container;
  fadingObjects: Set<Phaser.GameObjects.Container>;
}

const HOLE_SOIL_Y = 13;
const HOLE_SOIL_WIDTH = HOLE_RADIUS * 2 + 8;
const HOLE_SOIL_HEIGHT = 66;

/** Поле, мыши и их таймеры. Счёт и жизни меняет только GameState. */
export class MouseField {
  readonly holes: Hole[] = [];
  private ground?: Phaser.GameObjects.Container;
  private holeDecor?: Phaser.GameObjects.Container;
  private phaseTint?: Phaser.GameObjects.Rectangle;
  private gameStage: 1 | 2 | 3 = 1;
  private shakeTween?: Phaser.Tweens.Tween;
  private readonly fadingSpecialTypes = new Set<MouseType>();
  private layoutWidth = 960;
  private layoutHeight = 640;
  private spawnTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene, private readonly onHoleFreed: (hole: Hole) => void) {}

  resize(width: number, height: number): void {
    this.cancelShake();
    this.layoutWidth = width;
    this.layoutHeight = height;
    this.ground?.destroy();
    this.holeDecor?.destroy();
    this.createGround();
    this.createHoles();
    this.applyStageTint();
  }

  setStage(stage: 1 | 2 | 3): void {
    this.gameStage = stage;
    this.applyStageTint();
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

  scheduleSpawns(intervalMs: number, spawn: () => void): void {
    this.stopSpawns();
    this.spawnTimer = this.scene.time.addEvent({ delay: intervalMs, loop: true, callback: spawn });
  }

  private isFree(hole: Hole): boolean {
    return hole.mouse === null && hole.item === null && !hole.cover;
  }

  private randomFreeHole(): Hole | undefined {
    const freeHoles = this.holes.filter(hole => this.isFree(hole));
    return freeHoles.length > 0 ? Phaser.Utils.Array.GetRandom(freeHoles) : undefined;
  }

  blockHole(hole = this.randomFreeHole()): Hole | undefined {
    if (!hole || !this.isFree(hole) ||
      this.holes.filter(candidate => candidate.cover).length >= BALANCE.maxBlockedHoles) return;

    const width = HOLE_RADIUS * 2 - 4;
    const wood = this.scene.add.ellipse(0, 8, width, 54, COLORS.soil)
      .setStrokeStyle(4, COLORS.holeInner);
    const details = this.scene.add.graphics().lineStyle(2, COLORS.holeRim)
      .lineBetween(-49, -2, 49, -2).lineBetween(-49, 18, 49, 18)
      .fillStyle(COLORS.holeInner);
    details.fillCircle(-37, 8, 3).fillCircle(37, 8, 3);
    hole.cover = this.scene.add.container(hole.x, hole.y, [wood, details]).setDepth(2);
    return hole;
  }

  unblockHole(hole: Hole): void {
    hole.cover?.destroy();
    hole.cover = undefined;
  }

  isBlockedAt(x: number, y: number): boolean {
    return this.holes.some(hole => hole.cover &&
      Phaser.Math.Distance.Between(x, y, hole.x, hole.y + 8) <= HOLE_RADIUS);
  }

  stopSpawns(): void {
    this.spawnTimer?.remove();
    this.spawnTimer = undefined;
  }

  hasMouseType(type: MouseType): boolean {
    return this.fadingSpecialTypes.has(type) ||
      this.holes.some(hole => hole.mouseType === type);
  }

  spawnMouse(visibleMs: number, miss: (hole: Hole) => void, type: MouseType = 'normal'): void {
    if (type !== 'normal' && this.hasMouseType(type)) type = 'normal';
    const hole = this.randomFreeHole();
    if (!hole) return;
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
      if (type === 'decoy' || type === 'golden') this.clearMouse(hole);
      else miss(hole);
    });
  }

  spawnUsefulItem(type: UsefulItemType, visibleMs: number, expire: (hole: Hole) => void): boolean {
    if (this.holes.some(hole => hole.item !== null)) return false;
    const hole = this.randomFreeHole();
    if (!hole) return false;
    const item = makeUsefulItem(this.scene, hole.x, hole.y - 8, type).setScale(0.65).setAlpha(0);
    this.scene.tweens.add({ targets: item, scale: 1, alpha: 1, duration: ANIMATION.appear, ease: 'Back.out' });
    hole.item = item;
    hole.itemType = type;
    hole.itemTimer = this.scene.time.delayedCall(visibleMs, () => {
      if (hole.item !== item) return;
      this.clearItem(hole);
      expire(hole);
    });
    return true;
  }

  findItem(x: number, y: number): Hole | undefined {
    return this.holes.find(hole => hole.item !== null &&
      Phaser.Math.Distance.Between(x, y, hole.x, hole.y) <= BALANCE.usefulItemHitRadius);
  }

  clearItem(hole: Hole, animate = true): void {
    hole.itemTimer?.remove();
    hole.itemTimer = undefined;
    const item = hole.item;
    hole.item = null;
    hole.itemType = null;
    if (!item) return;
    this.scene.tweens.killTweensOf(item);
    this.onHoleFreed(hole);
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
      (hole.mouseType === 'decoy' ? BALANCE.falseMouseHitRadius :
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
    if (mouseType !== null && mouseType !== 'normal') this.fadingSpecialTypes.add(mouseType);
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
        if (mouseType !== null) this.fadingSpecialTypes.delete(mouseType);
      },
    });
    this.onHoleFreed(hole);
  }

  clearAll(): void {
    this.stopSpawns();
    for (const hole of this.holes) {
      this.clearMouse(hole);
      this.clearItem(hole, false);
      this.unblockHole(hole);
    }
  }

  dispose(): void {
    this.cancelShake();
    this.stopSpawns();
    for (const hole of this.holes) {
      hole.hideTimer?.remove();
      hole.itemTimer?.remove();
      hole.helmetTween?.stop();
      hole.item?.destroy();
      this.unblockHole(hole);
      if (hole.mouse) {
        this.scene.tweens.killTweensOf(hole.mouse);
        hole.mouse.destroy();
      }
      hole.hideTimer = undefined;
      hole.itemTimer = undefined;
      hole.mouse = null;
      hole.mouseType = null;
      hole.item = null;
      hole.itemType = null;
      hole.helmet = null;
      hole.helmetTween = undefined;
      hole.helmetRemoved = false;
      hole.fadingObjects.clear();
    }
    this.fadingSpecialTypes.clear();
    this.ground?.destroy();
    this.holeDecor?.destroy();
    this.phaseTint = undefined;
  }

  private createGround(): void {
    const w = this.layoutWidth, h = this.layoutHeight;
    this.ground = this.scene.add.container(0, 0).setDepth(-10);
    this.ground.add(this.scene.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground));
    this.ground.add(panel(this.scene, 14, 128, w - 28, h - 150, 36, COLORS.grass));
    this.phaseTint = this.scene.add.rectangle(w / 2, h - (h - 150) / 2, w - 28, h - 150,
      COLORS.phase2Tint, this.gameStage >= 2 ? BALANCE.phase2TintAlpha : 0);
    this.ground.add(this.phaseTint);
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
    this.phaseTint?.setAlpha(this.gameStage >= 2 ? BALANCE.phase2TintAlpha : 0);
  }

  private cancelShake(): void {
    this.shakeTween?.stop();
    this.shakeTween = undefined;
    this.ground?.setX(0);
    this.holeDecor?.setX(0);
  }
}
