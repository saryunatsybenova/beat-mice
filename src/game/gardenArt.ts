import type Phaser from 'phaser';
import type { GardenRewardId } from './gardenProgress';
import type { PlayerProgress } from './ProgressStore';

type Brush = Phaser.GameObjects.Graphics;
const paint: Record<GardenRewardId, (g: Brush) => void> = {
  flowerbed(g) {
    g.fillStyle(0x75523c, 0.18).fillEllipse(64, 78, 104, 21);
    g.fillStyle(0x996448).fillEllipse(64, 70, 101, 32);
    g.fillStyle(0xc58d60).fillEllipse(64, 66, 99, 25);
    g.fillStyle(0x765442).fillEllipse(64, 67, 85, 18);
    const stems = [[31, 52, 0xf6c64f], [47, 36, 0xe995a0], [65, 47, 0xfff4cc], [80, 29, 0xc48ec0], [96, 49, 0xefaa70]];
    for (const [x, y, color] of stems) {
      g.lineStyle(3, 0x64914c).lineBetween(x, y, x + 4, 68);
      g.fillStyle(0x83a75d).fillEllipse(x - 2, y + 15, 13, 6);
      flower(g, x, y, 8, color);
    }
  },
  bench(g) {
    g.fillStyle(0x654635, 0.15).fillEllipse(64, 82, 111, 15);
    g.lineStyle(7, 0x60704d).lineBetween(24, 53, 21, 80).lineBetween(103, 53, 106, 80);
    g.lineStyle(5, 0x677c54).lineBetween(30, 32, 27, 66).lineBetween(98, 32, 101, 66);
    for (const y of [33, 45, 63]) {
      g.fillStyle(0x895a41).fillRoundedRect(17, y + 2, 95, 12, 5);
      g.fillStyle(y === 63 ? 0xe5b27b : 0xce9565).fillRoundedRect(17, y, 95, 10, 5);
      g.fillStyle(0x80533d).fillCircle(25, y + 5, 1.5).fillCircle(104, y + 5, 1.5);
    }
  },
  fountain(g) {
    g.fillStyle(0x547061, 0.19).fillEllipse(64, 82, 103, 21);
    g.fillStyle(0x8b9890).fillEllipse(64, 74, 91, 30);
    g.fillStyle(0xd6d4bd).fillEllipse(64, 69, 91, 22);
    g.fillStyle(0x77b7bc).fillEllipse(64, 68, 76, 14);
    g.fillStyle(0xa3b3a3).fillRoundedRect(59, 46, 10, 24, 4);
    g.fillStyle(0xd6dac7).fillEllipse(64, 47, 41, 12);
    g.fillStyle(0x83c7c9).fillEllipse(64, 46, 32, 6);
    g.lineStyle(2, 0xd1f1e5).lineBetween(63, 44, 63, 25).lineBetween(65, 29, 74, 39).lineBetween(62, 29, 53, 39);
    g.fillStyle(0xf3ffff).fillCircle(63, 25, 3).fillCircle(75, 41, 2).fillCircle(53, 41, 2);
    g.lineStyle(2, 0xb1e2d9).lineBetween(36, 69, 51, 70).lineBetween(77, 70, 91, 68);
  },
  hedgehogHome(g) {
    home(g);
    hedgehog(g);
  },
  sleepingCat(g) {
    g.fillStyle(0x67523c, 0.15).fillEllipse(64, 79, 108, 22);
    g.fillStyle(0x94a56a).fillEllipse(64, 74, 108, 26);
    g.fillStyle(0xbecb87).fillEllipse(64, 71, 102, 25);
    g.fillStyle(0xaa6f48).fillEllipse(75, 62, 61, 34);
    g.fillStyle(0xd99c66).fillEllipse(72, 57, 61, 30);
    g.fillStyle(0xc98a5b).fillEllipse(72, 70, 45, 11);
    g.lineStyle(2, 0xa97455).lineBetween(71, 44, 76, 51).lineBetween(80, 45, 84, 51).lineBetween(90, 48, 93, 54);
    g.fillStyle(0xd99c66).fillTriangle(27, 55, 27, 37, 43, 48).fillTriangle(41, 48, 55, 37, 57, 55);
    g.fillStyle(0xe2a183).fillTriangle(28, 49, 29, 41, 38, 48).fillTriangle(46, 48, 54, 41, 54, 51);
    g.fillStyle(0xe3aa74).fillEllipse(42, 60, 38, 29);
    g.fillStyle(0xffe6bc).fillEllipse(42, 67, 19, 10);
    g.lineStyle(2, 0x634936).lineBetween(29, 58, 35, 61).lineBetween(35, 61, 38, 59)
      .lineBetween(46, 59, 50, 61).lineBetween(50, 61, 55, 58);
    g.fillStyle(0xa86f62).fillEllipse(42, 64, 5, 3);
  },
  fireflies(g) {
    for (const [x, y, size] of [[23, 62, 9], [43, 36, 12], [70, 56, 16], [96, 34, 11], [107, 66, 8], [54, 77, 7]]) {
      g.fillStyle(0xffd45f, 0.2).fillCircle(x, y, size);
      g.fillStyle(0xffe28d, 0.37).fillCircle(x, y, size * 0.58);
      g.fillStyle(0xfff2b3).fillCircle(x, y, size * 0.26);
    }
  },
};

function home(g: Brush): void {
  g.fillStyle(0x634831, 0.16).fillEllipse(64, 80, 112, 18);
  g.fillStyle(0xa2714e).fillRoundedRect(25, 44, 78, 39, 8);
  g.fillStyle(0xcf9b67).fillRoundedRect(25, 45, 78, 31, 7);
  g.fillStyle(0x654635).fillRoundedRect(49, 57, 31, 26, { tl: 16, tr: 16, bl: 2, br: 2 });
  g.fillStyle(0x596849).fillTriangle(16, 49, 64, 18, 112, 49);
  g.fillStyle(0x849758).fillTriangle(19, 46, 63, 19, 107, 46);
  g.lineStyle(2, 0xacb879).lineBetween(32, 42, 64, 25).lineBetween(64, 25, 92, 42);
  flower(g, 35, 74, 4, 0xf7d577);
}

function hedgehog(g: Brush): void {
  g.fillStyle(0x775343).fillEllipse(66, 75, 30, 17);
  for (let i = 0; i < 4; i++) g.fillTriangle(52 + i * 5, 72, 54 + i * 5, 65, 59 + i * 5, 73);
  g.fillStyle(0xe3bb90).fillEllipse(73, 76, 14, 10);
  g.fillStyle(0x48372c).fillCircle(75, 74, 1.2).fillCircle(80, 77, 2);
}

function flower(g: Brush, x: number, y: number, size: number, color: number): void {
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    g.fillStyle(color).fillCircle(x + Math.cos(angle) * size * 0.7, y + Math.sin(angle) * size * 0.7, size * 0.53);
  }
  g.fillStyle(0xf6b954).fillCircle(x, y, size * 0.36);
}

function landscape(g: Brush): void {
  g.fillStyle(0xc7dfa3).fillRect(0, 0, 720, 410);
  g.fillStyle(0xe1ecc2).fillEllipse(362, 174, 816, 432);
  g.fillStyle(0xadc985).fillEllipse(360, 257, 644, 295);
  g.fillStyle(0xd9c196).fillEllipse(365, 278, 586, 129);
  g.fillStyle(0xead4a6).fillEllipse(365, 274, 578, 122);
  g.fillStyle(0xadc985).fillEllipse(364, 259, 483, 90);
  g.fillStyle(0xdec89e).fillEllipse(359, 388, 96, 190);
  g.fillStyle(0xeed9b4).fillEllipse(359, 386, 76, 190);
  for (const [x, y, size] of [[38, 51, 45], [107, 28, 34], [176, 52, 32], [563, 44, 42],
    [647, 26, 38], [708, 60, 58], [23, 350, 54], [700, 362, 55], [644, 399, 39], [89, 398, 32]]) {
    g.fillStyle(0x82a564).fillEllipse(x, y + 11, size * 2, size * 1.32);
    g.fillStyle(0x9fbb72).fillEllipse(x + 4, y, size * 2, size * 1.35);
    g.fillStyle(0xb6cd8b).fillEllipse(x - 4, y - 8, size, size * 0.75);
  }
  for (let i = 0; i < 48; i++) {
    const x = 35 + i * 137 % 650, y = 23 + i * 91 % 365;
    g.lineStyle(1.5, 0x91ad6c, 0.6).lineBetween(x, y, x - 4, y - 5).lineBetween(x + 1, y, x + 4, y - 7);
    if (i % 8 === 0) flower(g, x - 8, y - 5, 4, 0xfff0c4);
  }
}

function texture(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Brush) => void): string {
  if (!scene.textures.exists(key)) {
    const brush = scene.make.graphics({}, false);
    draw(brush);
    brush.generateTexture(key, width, height);
    brush.destroy();
  }
  return key;
}

export function rewardTexture(scene: Phaser.Scene, id: GardenRewardId): string {
  return texture(scene, `garden-reward-${id}`, 128, 100, paint[id]);
}

const images = new WeakMap<Phaser.Textures.Texture, string>();

export function gardenImage(scene: Phaser.Scene, id?: GardenRewardId): string {
  const key = id ? rewardTexture(scene, id) : texture(scene, 'garden-landscape', 720, 410, landscape);
  const resource = scene.textures.get(key);
  let url = images.get(resource);
  if (!url) {
    const canvas = resource.getSourceImage() as HTMLCanvasElement;
    url = canvas.toDataURL();
    images.set(resource, url);
  }
  return url;
}

export class GardenDecor {
  private readonly layer: Phaser.GameObjects.Container;
  private readonly animated: { image: Phaser.GameObjects.Image; scale: number; id: GardenRewardId }[] = [];
  private elapsed = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.layer = scene.add.container().setDepth(-8);
  }

  resize(bounds: { x: number; y: number; width: number; height: number }, progress: PlayerProgress): void {
    this.layer.removeAll(true);
    this.animated.length = 0;
    const narrow = bounds.width < 500;
    const inset = narrow ? 30 : 48;
    const x = bounds.x + inset, right = bounds.x + bounds.width - inset;
    const y = (fraction: number) => bounds.y + bounds.height * fraction;
    const positions = [
      ['flowerbed', x, y(0.9), narrow ? 0.42 : 0.61],
      ['bench', right, y(0.24), 0.65],
      ['fountain', x, y(0.48), 0.67],
      ['hedgehogHome', right, y(0.58), narrow ? 0.45 : 0.65],
      ['sleepingCat', right, y(0.87), narrow ? 0.45 : 0.63],
      ['fireflies', x, y(0.22), narrow ? 0.45 : 0.65],
    ] as const;
    for (const [id, px, py, scale] of positions) {
      if (!progress.unlockedRewards.includes(id) || progress.hiddenRewards.includes(id)) continue;
      if (narrow && (id === 'bench' || id === 'fountain')) continue;
      const key = id === 'hedgehogHome' ? texture(this.scene, 'garden-empty-home', 128, 100, home) : rewardTexture(this.scene, id);
      const image = this.scene.add.image(px, py, key).setName(id).setScale(scale);
      this.layer.add(image);
      if (id === 'hedgehogHome') {
        const animal = this.scene.add.image(px, py, texture(this.scene, 'garden-hedgehog-resting', 128, 100, hedgehog)).setScale(scale);
        this.layer.add(animal);
        this.animated.push({ image: animal, scale, id });
      } else if (id === 'sleepingCat' || id === 'fireflies') this.animated.push({ image, scale, id });
    }
    this.update(0);
  }

  update(delta: number): void {
    this.elapsed += delta;
    const sway = Math.sin(this.elapsed / 620);
    for (const { image, scale, id } of this.animated) {
      if (id === 'fireflies') image.setAlpha(0.78 + sway * 0.11);
      else image.setScale(scale, scale * (1 + sway * 0.024));
    }
  }

  destroy(): void { this.layer.destroy(); }
}
