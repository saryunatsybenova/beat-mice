import Phaser from 'phaser';
import { COLORS } from './theme';

export type MouseType = 'normal' | 'decoy' | 'golden' | 'helmet';
export type UsefulItemType = 'cheese' | 'bigCheese' | 'heart' | 'shield' | 'glasses';

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
  } else if (type === 'bigCheese') {
    item.add(scene.add.ellipse(0, 6, 86, 50, 0xe3a451).setStrokeStyle(3, 0xb77b2a));
    item.add(scene.add.ellipse(0, -5, 86, 46, 0xffd766).setStrokeStyle(3, 0xb77b2a));
    item.add(scene.add.ellipse(0, -5, 74, 35, 0xffe78a));
    item.add([
      scene.add.circle(-22, -6, 6, 0xd39438),
      scene.add.circle(2, -14, 4, 0xd39438),
      scene.add.circle(21, -2, 7, 0xd39438),
      scene.add.circle(-2, 6, 5, 0xd39438),
      scene.add.ellipse(-13, 20, 10, 5, 0xc48330),
    ]);
  } else if (type === 'shield') {
    item.add(makeShield(scene, 0, 0));
  } else if (type === 'glasses') {
    item.add(scene.add.ellipse(0, 0, 72, 50, COLORS.cream, 0.35));
    const glasses = scene.add.graphics().fillStyle(0xe2cbed, 0.92)
      .fillRoundedRect(-29, -9, 24, 20, 7).fillRoundedRect(5, -9, 24, 20, 7)
      .lineStyle(4, 0x674579)
      .strokeRoundedRect(-29, -9, 24, 20, 7).strokeRoundedRect(5, -9, 24, 20, 7)
      .lineBetween(-5, -3, 5, -3);
    item.add(glasses);
    item.add(scene.add.star(23, -18, 4, 3, 8, COLORS.accent));
    item.add(scene.add.star(-26, 17, 4, 2, 5, COLORS.cream));
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

export function makePredictionMarker(scene: Phaser.Scene, x: number, y: number, radius: number,
  type: MouseType): Phaser.GameObjects.Container {
  const marker = scene.add.container(x, y).setDepth(3);
  marker.add(scene.add.circle(0, 0, radius, COLORS.cream).setStrokeStyle(2, COLORS.phase4Tint));
  const icon = scene.add.graphics();
  marker.add(icon);
  switch (type) {
    case 'normal':
      icon.fillStyle(COLORS.holeInner).fillCircle(-5, -5, 4).fillCircle(5, -5, 4).fillEllipse(0, 2, 15, 13);
      break;
    case 'decoy':
      icon.fillStyle(COLORS.leaf).fillEllipse(3, 6, 8, 4);
      icon.fillStyle(COLORS.pink);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        icon.fillCircle(Math.cos(angle) * 4, Math.sin(angle) * 4 - 1, 3.5);
      }
      icon.fillStyle(COLORS.accent).fillCircle(0, -1, 3.5);
      break;
    case 'golden':
      marker.add(scene.add.star(0, 0, 5, 4.5, 9, COLORS.accent).setStrokeStyle(1, COLORS.holeInner));
      break;
    case 'helmet':
      icon.fillStyle(0x456775).fillRoundedRect(-7, -8, 14, 13, 5).fillRoundedRect(-9, 2, 18, 5, 2);
      icon.fillStyle(COLORS.cream).fillRect(-1, -7, 2, 8);
      break;
  }
  return marker;
}

export function makeShield(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const shield = scene.add.graphics().setPosition(x, y);
  const outline = [
    new Phaser.Math.Vector2(0, -24), new Phaser.Math.Vector2(24, -16),
    new Phaser.Math.Vector2(22, 6), new Phaser.Math.Vector2(14, 18),
    new Phaser.Math.Vector2(0, 27), new Phaser.Math.Vector2(-14, 18),
    new Phaser.Math.Vector2(-22, 6), new Phaser.Math.Vector2(-24, -16),
  ];
  shield.fillStyle(0x6a9ba9).fillPoints(outline, true)
    .lineStyle(3, 0x365c68).strokePoints(outline, true);
  shield.fillStyle(COLORS.cream).fillCircle(0, 0, 9);
  shield.fillStyle(COLORS.accent).fillCircle(0, 0, 5);
  return shield;
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
