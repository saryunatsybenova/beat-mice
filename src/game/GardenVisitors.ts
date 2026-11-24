import Phaser from 'phaser';
import type { GameStage } from './GameState';
import { GARDEN_VISITORS as SETTINGS } from './settings';
import { COLORS } from './theme';

type VisitorType = typeof SETTINGS.typesByStage[3][number];
type FieldBounds = { x: number; y: number; width: number; height: number; radius: number };
type VisitorArt = {
  object: Phaser.GameObjects.Container;
  animate: (elapsed: number, progress: number) => void;
};

/** Декоративный слой между травой и норами. Движение идёт только в игровых кадрах. */
export class GardenVisitors {
  // Собственный генератор сохраняет последовательность бросков мышей и предметов.
  private readonly random = new Phaser.Math.RandomDataGenerator([String(performance.now())]);
  private dueAt?: number;
  private active?: VisitorArt & { type: VisitorType; direction: number; elapsed: number };
  private bounds!: FieldBounds;
  private flightY = 0;
  private compact = false;
  private clip?: Phaser.GameObjects.Graphics;
  private webglMask?: Phaser.Filters.Mask;

  constructor(private readonly scene: Phaser.Scene) {}

  startCounting(appearances: number): void {
    this.dueAt = appearances + SETTINGS.firstWaitAppearances;
  }

  resize(bounds: FieldBounds, firstRowY: number, secondRowY: number, compact: boolean): void {
    this.bounds = bounds;
    this.flightY = (firstRowY + secondRowY) / 2;
    this.compact = compact;
    this.updateClip();
    this.position();
  }

  update(stage: GameStage, appearances: number, delta: number, canEnter = true): void {
    const active = this.active;
    if (!active) {
      // Проверяем готовность в игровом кадре, чтобы переход фазы мог её отложить.
      const types = SETTINGS.typesByStage[stage];
      if (canEnter && types.length && this.dueAt !== undefined && appearances >= this.dueAt) {
        this.enter(types[this.random.between(0, types.length - 1)]);
      }
      return;
    }
    if (!active.object.visible) {
      active.object.setVisible(true);
      return;
    }
    active.elapsed += delta;
    if (active.elapsed >= SETTINGS[active.type].durationMs) {
      this.clear();
      const { min, max } = SETTINGS.nextWaitAppearances;
      this.dueAt = appearances + this.random.between(min, max);
    } else {
      this.position();
    }
  }

  hide(): void {
    this.active?.object.setVisible(false);
  }

  clear(): void {
    this.dueAt = undefined;
    this.active?.object.clearMask(true).destroy();
    this.active = undefined;
    this.webglMask = undefined;
    this.clip?.destroy();
    this.clip = undefined;
  }

  private enter(type: VisitorType): void {
    const art = type === 'butterfly' ? makeButterfly(this.scene)
      : type === 'hedgehog' ? makeHedgehog(this.scene) : makeCat(this.scene);
    const { object } = art;
    object.setDepth(-6).setName(type);
    this.active = { ...art, type, direction: this.random.between(0, 1) === 0 ? -1 : 1, elapsed: 0 };
    this.dueAt = undefined;

    this.clip = this.scene.make.graphics({}, false);
    if (this.scene.renderer.type === Phaser.WEBGL) {
      this.webglMask = object.enableFilters().filters!.external.addMask(this.clip);
      this.webglMask.autoUpdate = false;
    } else {
      object.setMask(this.clip.createGeometryMask());
    }
    this.updateClip();
    this.position();
  }

  private updateClip(): void {
    const { x, y, width, height, radius } = this.bounds;
    this.clip?.clear().fillStyle(0xffffff).fillRoundedRect(x, y, width, height, radius);
    if (this.webglMask) this.webglMask.needsUpdate = true;
  }

  private position(): void {
    const active = this.active;
    if (!active) return;
    const { object, type, direction, elapsed } = active;
    const { x, y, width, height } = this.bounds;
    const progress = elapsed / SETTINGS[type].durationMs;
    const travel = direction > 0 ? progress : 1 - progress;
    const centerX = x - SETTINGS.entryMargin + travel * (width + 2 * SETTINGS.entryMargin);
    const { waveHeight, waves } = SETTINGS.butterfly;
    const wave = progress * waves * Math.PI * 2;
    const centerY = type === 'butterfly' ? this.flightY + Math.sin(wave) * waveHeight
      : y + height - SETTINGS.bottomInset;
    const scale = this.compact && type !== 'butterfly' ? SETTINGS.compactWalkerScale : 1;
    object.setPosition(centerX, centerY).setScale(direction * scale, scale)
      .setRotation(type === 'butterfly' ? direction * Math.cos(wave) * 0.15 : 0);
    active.animate(elapsed, progress);
  }
}

function makeButterfly(scene: Phaser.Scene): VisitorArt {
  const object = scene.add.container();
  const wings = [1, -1].map(direction => {
    const side = scene.add.container().setScale(1, direction);
    side.add([
      scene.add.ellipse(9, -9, 13, 17, 0xbf80a9).setRotation(0.4),
      scene.add.ellipse(-1, -8, 12, 13, 0xd69abb).setRotation(-0.5),
      scene.add.ellipse(10, -11, 6, 8, 0xffd7a4).setRotation(0.4),
      scene.add.circle(-2, -8, 2, 0xffe4b9),
    ]);
    return side;
  });
  const antennae = scene.add.graphics().lineStyle(1.4, 0x695061)
    .lineBetween(6, 0, 12, -4).lineBetween(6, 0, 12, 4);
  object.add([...wings, scene.add.ellipse(0, 0, 17, 4, 0x695061), antennae]);
  return { object, animate: elapsed => {
    const flap = 0.27 + 0.73 * Math.abs(Math.cos(elapsed / SETTINGS.butterfly.flapMs * Math.PI));
    wings[0].setScale(1, flap);
    wings[1].setScale(1, -flap);
  } };
}

function makeHedgehog(scene: Phaser.Scene): VisitorArt {
  const object = scene.add.container();
  const body = scene.add.container();
  const spines = scene.add.graphics().fillStyle(0x775748);
  spines.fillEllipse(-4, -8, 44, 28);
  for (let index = 0; index < 5; index++) {
    const x = -24 + index * 7;
    const y = -15 - Math.sin(index * Math.PI / 5) * 7;
    spines.fillTriangle(x, y + 8, x - 5, y - 5, x + 10, y + 4);
  }
  const paws = [-14, 8].map(x => scene.add.ellipse(x, 4, 12, 6, 0x8c6752));
  body.add([
    ...paws, spines,
    scene.add.ellipse(11, -6, 26, 19, 0xe2bb91).setRotation(0.25),
    scene.add.circle(8, -13, 5, 0xc99176),
    scene.add.circle(16, -8, 2.2, COLORS.ink),
    scene.add.circle(25, -4, 3.3, COLORS.ink),
  ]);
  object.add([scene.add.ellipse(0, 7, 51, 10, COLORS.holeInner, 0.15), body]);
  return { object, animate: elapsed => {
    const step = Math.sin(elapsed * 2 * Math.PI / SETTINGS.hedgehog.stepMs);
    paws[0].x = -14 + 4 * step;
    paws[1].x = 8 - 4 * step;
    body.y = -Math.abs(step) * 2.5;
  } };
}

function makeCat(scene: Phaser.Scene): VisitorArt {
  const object = scene.add.container();
  const fur = 0xc88b58, stripe = 0x9b6245;
  const body = scene.add.container();
  const tail = scene.add.container(-21, -10, [
    scene.add.ellipse(-12, -6, 31, 8, fur).setRotation(0.55),
    scene.add.ellipse(-25, -13, 9, 7, stripe).setRotation(0.55),
  ]);
  const paws = [-15, -7, 12, 20].map((x, index) =>
    scene.add.ellipse(x, 1, 8, 15, index % 2 === 0 ? stripe : fur));
  const head = scene.add.container(23, -16, [
    scene.add.triangle(-9, -9, 0, 13, 3, 0, 12, 13, fur),
    scene.add.triangle(6, -8, 0, 13, 8, 0, 12, 13, fur),
    scene.add.ellipse(0, 0, 26, 21, fur),
    scene.add.ellipse(7, 4, 13, 9, COLORS.cream),
    scene.add.circle(5, -3, 2.1, COLORS.ink),
    scene.add.circle(13, 1, 2.3, stripe),
    scene.add.graphics().lineStyle(1.2, stripe).lineBetween(8, 4, 16, 6).lineBetween(8, 6, 15, 9),
  ]);
  const markings = scene.add.graphics().lineStyle(2.5, stripe)
    .lineBetween(-13, -19, -10, -12).lineBetween(-7, -20, -4, -14).lineBetween(0, -20, 3, -14);
  body.add([tail, ...paws, scene.add.ellipse(0, -8, 55, 26, fur), markings, head]);
  object.add([scene.add.ellipse(0, 8, 69, 11, COLORS.holeInner, 0.17), body]);
  return { object, animate: (elapsed, progress) => {
    const step = Math.sin(elapsed * 2 * Math.PI / SETTINGS.cat.stepMs);
    paws.forEach((paw, index) => { paw.rotation = step * (index % 2 === 0 ? 0.35 : -0.35); });
    body.y = -Math.abs(step);
    tail.rotation = Math.sin(elapsed * 2 * Math.PI / (SETTINGS.cat.stepMs * 3)) * 0.19;
    let glance = 0;
    for (const at of SETTINGS.cat.glanceAt) {
      const turn = (progress - at) / SETTINGS.cat.glanceDuration;
      if (turn > 0 && turn < 1) glance = Math.sin(turn * Math.PI);
    }
    head.setRotation(-0.46 * glance).setScale(1 - 0.15 * glance, 1);
  } };
}
