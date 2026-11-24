import Phaser from 'phaser';
import type { GardenEventType } from './GardenEvents';
import type { Hole, MouseField } from './MouseField';
import { GARDEN_EVENT_EFFECTS as SETTINGS } from './settings';

const TEXTURES = {
  star: 'garden-event-star', spark: 'garden-event-spark', glow: 'garden-event-glow',
  dust: 'garden-event-dust', paw: 'garden-event-paw',
} as const;

type Particle = {
  sprite: Phaser.GameObjects.Sprite;
  age?: number;
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  scale: number;
  grow?: number;
  alpha: number;
  angle?: number;
  spin?: number;
  delay?: number;
  duration: number;
};
type FieldBounds = MouseField['gardenBounds'];

/** Спрайты ниже целей и панели. Их время идёт только в игровых кадрах. */
export class GardenEventEffects {
  private readonly particles: Particle[] = [];
  private readonly random = new Phaser.Math.RandomDataGenerator([String(performance.now())]);
  private edgeWait: number = SETTINGS.goldRush.edge.minIntervalMs;
  private bounds!: FieldBounds;
  private suspended = false;
  private skipDelta = false;

  constructor(private readonly scene: Phaser.Scene) {
    createTextures(scene);
  }

  resize(bounds: FieldBounds): void {
    this.bounds = bounds;
    this.clear();
  }

  start(event: GardenEventType, label: { x: number; y: number }, holes: readonly Hole[]): void {
    this.skipDelta = true;
    if (event === 'goldRush') {
      this.edgeWait = this.nextEdgeWait();
      const { count, durationMs, spreadX, spreadY } = SETTINGS.goldRush.intro;
      for (let index = 0; index < count; index++) {
        const angle = index / count * Math.PI * 2;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        this.emit(index % 3 === 0 ? 'star' : 'spark', {
          x: label.x + dx * spreadX * 0.44, y: label.y + dy * 7,
          dx: dx * spreadX * 0.56, dy: dy * spreadY,
          scale: this.random.realInRange(0.46, 0.8), alpha: 0.95,
          spin: this.random.between(-115, 115), duration: durationMs, delay: index % 3 * 35,
        });
      }
      return;
    }

    holes.forEach((hole, index) => this.dust(hole, SETTINGS.invasion.dust.perHole, index * 13));
    const { bounds } = this;
    const { perSide, inset, spacing, stepDelayMs, durationMs } = SETTINGS.invasion.tracks;
    for (let index = 0; index < perSide; index++) {
      const y = bounds.y + bounds.radius + index * spacing;
      const sway = index % 2 === 0 ? -4 : 4;
      for (const direction of [-1, 1]) {
        this.emit('paw', {
          x: direction < 0 ? bounds.x + inset + sway : bounds.x + bounds.width - inset - sway,
          y: direction < 0 ? y : bounds.y + bounds.height - (y - bounds.y),
          angle: direction < 0 ? 180 + sway * 4 : sway * 4,
          scale: 0.83, alpha: 0.72, duration: durationMs, delay: index * stepDelayMs,
        });
      }
    }
  }

  onMouseAppeared(event: GardenEventType, hole: Hole): void {
    if (event === 'invasion') {
      this.dust(hole, SETTINGS.invasion.dust.onMouse);
    } else if (hole.mouseType === 'golden') {
      const { durationMs, sideOffset } = SETTINGS.goldRush.mouse;
      for (const direction of [-1, 1]) {
        const x = hole.x + direction * sideOffset;
        this.emit('glow', { x, y: hole.y - 8, scale: 0.66, grow: 0.4, alpha: 0.84, duration: durationMs });
        this.emit('spark', {
          x, y: hole.y - 8, dx: direction * 8, dy: -11,
          scale: 0.52, spin: direction * 42, alpha: 0.98, duration: durationMs,
        });
      }
    }
  }

  update(delta: number, event?: GardenEventType): void {
    if (this.suspended) return;
    const elapsed = this.skipDelta ? 0 : delta;
    this.skipDelta = false;
    if (event === 'goldRush') {
      this.edgeWait -= elapsed;
      if (this.edgeWait <= 0) {
        this.edgeWait = this.nextEdgeWait();
        this.edgeGlint();
      }
    }
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      // Новая частица может быть создана таймером в этом кадре.
      particle.age = particle.age === undefined ? -(particle.delay ?? 0) : particle.age + elapsed;
      if (particle.age >= particle.duration) {
        particle.sprite.destroy();
        this.particles.splice(index, 1);
      } else if (particle.age >= 0) {
        const progress = particle.age / particle.duration;
        const travel = 1 - (1 - progress) ** 2;
        particle.sprite.setVisible(true)
          .setPosition(particle.x + (particle.dx ?? 0) * travel, particle.y + (particle.dy ?? 0) * travel)
          .setScale(particle.scale + (particle.grow ?? 0) * progress)
          .setAngle((particle.angle ?? 0) + (particle.spin ?? 0) * progress)
          .setAlpha(particle.alpha * (1 - progress) ** 1.4);
      }
    }
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.skipDelta = !suspended;
    for (const particle of this.particles) particle.sprite.setVisible(!suspended && (particle.age ?? -1) >= 0);
  }

  clear(): void {
    for (const particle of this.particles) particle.sprite.destroy();
    this.particles.length = 0;
  }

  private nextEdgeWait(): number {
    const { minIntervalMs, maxIntervalMs } = SETTINGS.goldRush.edge;
    return this.random.between(minIntervalMs, maxIntervalMs);
  }

  private edgeGlint(): void {
    const { bounds } = this;
    const { inset, durationMs } = SETTINGS.goldRush.edge;
    const left = this.random.between(0, 1) === 0;
    const x = left ? bounds.x + inset : bounds.x + bounds.width - inset;
    const y = this.random.between(bounds.y + bounds.radius, bounds.y + bounds.height - bounds.radius);
    this.emit('spark', { x, y, dy: -7, scale: 0.7, spin: 45, alpha: 0.86, duration: durationMs });
  }

  private dust(hole: Hole, count: number, delay = 0): void {
    const { durationMs, offsetX, offsetY } = SETTINGS.invasion.dust;
    for (let index = 0; index < count; index++) {
      const direction = index % 2 === 0 ? -1 : 1;
      this.emit('dust', {
        x: hole.x + direction * offsetX, y: hole.y + offsetY,
        dx: direction * this.random.between(13, 23), dy: -this.random.between(4, 10),
        scale: this.random.realInRange(0.61, 0.84), grow: 0.48, alpha: 0.74,
        spin: direction * 19, duration: durationMs, delay,
      });
    }
  }

  private emit(texture: keyof typeof TEXTURES, motion: Omit<Particle, 'sprite' | 'age'>): void {
    if (this.particles.length >= SETTINGS.maxSprites) return;
    const sprite = this.scene.add.sprite(motion.x, motion.y, TEXTURES[texture]).setDepth(-4).setVisible(false);
    this.particles.push({ sprite, ...motion });
  }
}

function createTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURES.star)) return;
  const brush = scene.make.graphics({}, false);
  const drawStar = (points: number, outer: number, inner: number, color: number) => {
    const path = Array.from({ length: points * 2 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / points;
      const radius = index % 2 === 0 ? outer : inner;
      return new Phaser.Math.Vector2(16 + Math.cos(angle) * radius, 16 + Math.sin(angle) * radius);
    });
    brush.fillStyle(color).fillPoints(path, true);
  };
  drawStar(5, 15, 7, 0xf0ad2e);
  drawStar(5, 12, 5, 0xffdd73);
  brush.generateTexture(TEXTURES.star, 32, 32).clear();
  drawStar(4, 13, 3, 0xffd054);
  drawStar(4, 8, 2, 0xfff6ca);
  brush.generateTexture(TEXTURES.spark, 32, 32).clear();
  brush.fillStyle(0xffcf4f, 0.16).fillCircle(16, 16, 15)
    .fillStyle(0xffd864, 0.22).fillCircle(16, 16, 11)
    .fillStyle(0xffeb9b, 0.39).fillCircle(16, 16, 7)
    .fillStyle(0xfff7d4, 0.67).fillCircle(16, 16, 4);
  brush.generateTexture(TEXTURES.glow, 32, 32).clear();
  brush.fillStyle(0xc29e73, 0.46).fillEllipse(16, 18, 29, 15)
    .fillStyle(0xe0bc88, 0.78).fillCircle(10, 16, 6).fillCircle(18, 13, 8).fillCircle(24, 17, 5)
    .fillStyle(0xf4daaa, 0.64).fillEllipse(16, 17, 19, 8);
  brush.generateTexture(TEXTURES.dust, 32, 32).clear();
  brush.fillStyle(0x9b6a4d, 0.86).fillEllipse(16, 21, 12, 10)
    .fillCircle(9, 14, 2.8).fillCircle(14, 10, 3).fillCircle(20, 11, 2.8).fillCircle(24, 15, 2.5);
  brush.generateTexture(TEXTURES.paw, 32, 32);
  brush.destroy();
}
