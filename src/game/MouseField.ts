import Phaser from 'phaser';
import { BALANCE } from './settings';
import { COLORS, ANIMATION, CELL_SIZE, HOLE_RADIUS } from './theme';
import { panel } from './ui/widgets';
import { makeMouse } from './visuals';

export interface Hole {
  x: number;
  y: number;
  mouse: Phaser.GameObjects.Container | null;
  hideTimer?: Phaser.Time.TimerEvent;
}

/** Поле, мыши и их таймеры. Счёт и жизни меняет только GameState. */
export class MouseField {
  readonly holes: Hole[] = [];
  private ground?: Phaser.GameObjects.Container;
  private holeDecor?: Phaser.GameObjects.Container;
  private layoutWidth = 960;
  private layoutHeight = 640;
  private spawnTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene) {}

  resize(width: number, height: number): void {
    this.layoutWidth = width;
    this.layoutHeight = height;
    this.ground?.destroy();
    this.holeDecor?.destroy();
    this.createGround();
    this.createHoles();
  }

  scheduleSpawns(intervalMs: number, spawn: () => void): void {
    this.stopSpawns();
    this.spawnTimer = this.scene.time.addEvent({ delay: intervalMs, loop: true, callback: spawn });
  }

  stopSpawns(): void {
    this.spawnTimer?.remove();
    this.spawnTimer = undefined;
  }

  spawnMouse(visibleMs: number, miss: (hole: Hole) => void): void {
    const freeHoles = this.holes.filter(hole => hole.mouse === null);
    if (freeHoles.length === 0) return;
    const hole = Phaser.Utils.Array.GetRandom(freeHoles);
    const mouse = makeMouse(this.scene, hole.x, hole.y);
    mouse.setScale(0.2).setAlpha(0);
    this.scene.tweens.add({ targets: mouse, scale: 1, alpha: 1, duration: ANIMATION.appear, ease: 'Back.out' });
    hole.mouse = mouse;
    hole.hideTimer = this.scene.time.delayedCall(visibleMs, () => {
      if (hole.mouse === mouse) miss(hole);
    });
  }

  findMouse(x: number, y: number): Hole | undefined {
    return this.holes.find(hole => hole.mouse !== null &&
      Phaser.Math.Distance.Between(x, y, hole.x, hole.y) <= BALANCE.mouseHitRadius);
  }

  clearMouse(hole: Hole, hit = false): void {
    hole.hideTimer?.remove();
    hole.hideTimer = undefined;
    const mouse = hole.mouse;
    hole.mouse = null; // сразу помечаем нору свободной — повторное попадание не засчитается
    if (!mouse) return;
    this.scene.tweens.killTweensOf(mouse);

    this.scene.tweens.add({
      targets: mouse,
      scale: hit ? 1.18 : 0.2,
      alpha: 0,
      angle: hit ? 12 : 0,
      duration: ANIMATION.hide,
      onComplete: () => mouse.destroy(),
    });
  }

  clearAll(): void {
    this.stopSpawns();
    for (const hole of this.holes) this.clearMouse(hole);
  }

  dispose(): void {
    this.stopSpawns();
    for (const hole of this.holes) {
      hole.hideTimer?.remove();
      if (hole.mouse) {
        this.scene.tweens.killTweensOf(hole.mouse);
        hole.mouse.destroy();
      }
      hole.hideTimer = undefined;
      hole.mouse = null;
    }
    this.ground?.destroy();
    this.holeDecor?.destroy();
  }

  private createGround(): void {
    const w = this.layoutWidth, h = this.layoutHeight;
    this.ground = this.scene.add.container(0, 0).setDepth(-10);
    this.ground.add(this.scene.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground));
    this.ground.add(panel(this.scene, 14, 128, w - 28, h - 150, 36, COLORS.grass));
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
          this.scene.add.ellipse(x, y + 13, HOLE_RADIUS * 2 + 8, 66, COLORS.soil),
          this.scene.add.ellipse(x, y + 9, HOLE_RADIUS * 2, 58, COLORS.holeRim),
          this.scene.add.ellipse(x, y + 7, HOLE_RADIUS * 2 - 12, 43, COLORS.holeInner),
        ]);
        const index = row * BALANCE.gridCols + col;
        if (this.holes[index]) {
          const hole = this.holes[index];
          hole.x = x; hole.y = y;
          if (hole.mouse) hole.mouse.setPosition(x, y);
        } else this.holes.push({ x, y, mouse: null });
      }
    }
  }
}
