import Phaser from 'phaser';
import { COLORS } from './theme';

export type MouseType = 'normal' | 'decoy' | 'golden' | 'helmet';
export type UsefulItemType = 'cheese' | 'heart';

export interface MouseAppearance {
  object: Phaser.GameObjects.Container;
  helmet?: Phaser.GameObjects.Container;
}

export function makeMouse(scene: Phaser.Scene, x: number, y: number,
  type: MouseType = 'normal'): MouseAppearance {
  const mouse = scene.add.container(x, y);
  const isGolden = type === 'golden';
  const bodyColor = isGolden ? 0xe9bd4c : COLORS.mouseBody;
  const earColor = isGolden ? 0xffe18a : COLORS.mouseEar;
  mouse.add(scene.add.ellipse(0, 18, 90, 27, COLORS.holeInner).setAlpha(0.18));
  mouse.add(scene.add.circle(-29, -30, 22, bodyColor).setStrokeStyle(2, 0xa59585));
  mouse.add(scene.add.circle(29, -30, 22, bodyColor).setStrokeStyle(2, 0xa59585));
  mouse.add(scene.add.circle(-29, -30, 14, earColor));
  mouse.add(scene.add.circle(29, -30, 14, earColor));
  mouse.add(scene.add.ellipse(0, -4, 80, 76, bodyColor).setStrokeStyle(2, 0xa59585));
  mouse.add(scene.add.ellipse(0, 12, 52, 32, COLORS.cream));
  mouse.add(scene.add.circle(-14, -12, 6, COLORS.mouseEye));
  mouse.add(scene.add.circle(14, -12, 6, COLORS.mouseEye));
  mouse.add(scene.add.circle(-16, -14, 2, 0xffffff));
  mouse.add(scene.add.circle(12, -14, 2, 0xffffff));
  mouse.add(scene.add.ellipse(-25, 4, 13, 7, COLORS.mouseEar));
  mouse.add(scene.add.ellipse(25, 4, 13, 7, COLORS.mouseEar));
  mouse.add(scene.add.ellipse(0, 5, 13, 10, COLORS.pink));
  const whiskers = scene.add.graphics().lineStyle(2, COLORS.muted, 0.7);
  whiskers.lineBetween(-18, 8, -42, 3).lineBetween(-18, 13, -43, 16);
  whiskers.lineBetween(18, 8, 42, 3).lineBetween(18, 13, 43, 16);
  whiskers.lineBetween(0, 10, 0, 17).lineBetween(-5, 17, 5, 17);
  mouse.add(whiskers);
  mouse.add(scene.add.ellipse(-24, 28, 20, 12, COLORS.cream));
  mouse.add(scene.add.ellipse(24, 28, 20, 12, COLORS.cream));
  if (type === 'decoy') addFlower(mouse, scene);
  if (type === 'golden') addStar(mouse, scene);
  const helmet = type === 'helmet' ? addHelmet(mouse, scene) : undefined;
  return { object: mouse, helmet };
}

export function makeUsefulItem(scene: Phaser.Scene, x: number, y: number,
  type: UsefulItemType): Phaser.GameObjects.Container {
  const item = scene.add.container(x, y).setDepth(2);
  if (type === 'cheese') {
    const wedge = scene.add.graphics().fillStyle(0xf2c84b).lineStyle(3, 0xb77b2a);
    const points = [
      new Phaser.Math.Vector2(-34, 20),
      new Phaser.Math.Vector2(-28, -18),
      new Phaser.Math.Vector2(34, 8),
      new Phaser.Math.Vector2(30, 21),
    ];
    wedge.fillPoints(points, true).strokePoints(points, true);
    item.add(wedge);
    item.add([
      scene.add.circle(-14, 4, 5, 0xc98e32),
      scene.add.circle(8, 10, 4, 0xc98e32),
      scene.add.circle(3, -8, 3, 0xc98e32),
    ]);
  } else {
    const heart = scene.add.graphics().fillStyle(0xe35469).lineStyle(3, 0x9f3447);
    heart.fillCircle(-11, -8, 13).fillCircle(11, -8, 13);
    heart.fillTriangle(-23, -5, 23, -5, 0, 22);
    heart.lineBetween(-23, -7, 0, 22).lineBetween(23, -7, 0, 22);
    item.add(heart);
    item.add(scene.add.circle(-11, -9, 3, 0xffc7cf).setAlpha(0.9));
  }
  return item;
}

function addFlower(mouse: Phaser.GameObjects.Container, scene: Phaser.Scene): void {
  const stem = scene.add.graphics().lineStyle(5, 0x4e9b46, 1)
    .lineBetween(30, -35, 44, -62);
  stem.fillStyle(0x64b84f, 1)
    .fillEllipse(35, -45, 16, 8);
  mouse.add(stem);

  const centerX = 46, centerY = -69;
  for (let petal = 0; petal < 6; petal++) {
    const angle = petal * Math.PI / 3;
    mouse.add(scene.add.circle(
      centerX + Math.cos(angle) * 11,
      centerY + Math.sin(angle) * 11,
      11,
      petal % 2 === 0 ? 0xffc928 : 0xff8a35,
    ).setStrokeStyle(2, 0xfff8e9));
  }
  mouse.add(scene.add.circle(centerX, centerY, 8, 0xe84f79).setStrokeStyle(2, 0xfff8e9));
}

function addStar(mouse: Phaser.GameObjects.Container, scene: Phaser.Scene): void {
  mouse.add(scene.add.star(44, -68, 5, 8, 18, 0xffdd45)
    .setStrokeStyle(3, 0xfff8e9));
}

function addHelmet(mouse: Phaser.GameObjects.Container, scene: Phaser.Scene): Phaser.GameObjects.Container {
  const helmet = scene.add.container(0, -53);
  helmet.add(scene.add.ellipse(0, 0, 74, 30, 0x3479b7).setStrokeStyle(3, 0xeaf5ff));
  helmet.add(scene.add.rectangle(0, 8, 86, 7, 0x235887).setStrokeStyle(2, 0xeaf5ff));
  helmet.add(scene.add.rectangle(-25, 4, 5, 14, 0xeaf5ff));
  mouse.add(helmet);
  return helmet;
}
