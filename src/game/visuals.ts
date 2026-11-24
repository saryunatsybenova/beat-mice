import Phaser from 'phaser';
import { COLORS } from './theme';
import type { MouseLook } from './personalTasks';

export type MouseType = 'normal' | 'decoy' | 'friendly' | 'golden' | 'helmet';
export type UsefulItemType = 'cheese' | 'bigCheese' | 'heart' | 'shield' | 'glasses' | 'clover' | 'coin' | 'flower';

export interface MouseAppearance {
  object: Phaser.GameObjects.Container;
  helmet?: Phaser.GameObjects.Container;
}

export function makeMouse(scene: Phaser.Scene, x: number, y: number,
  type: MouseType = 'normal', look: MouseLook = 'standard'): MouseAppearance {
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
  if (type !== 'decoy') {
    mouse.add(scene.add.circle(-14, -12, 6, COLORS.mouseEye));
    mouse.add(scene.add.circle(14, -12, 6, COLORS.mouseEye));
    mouse.add(scene.add.circle(-16, -14, 2, 0xffffff));
    mouse.add(scene.add.circle(12, -14, 2, 0xffffff));
  }
  mouse.add(scene.add.ellipse(-25, 4, 13, 7, COLORS.mouseEar));
  mouse.add(scene.add.ellipse(25, 4, 13, 7, COLORS.mouseEar));
  mouse.add(scene.add.ellipse(0, 5, 13, 10, COLORS.pink));
  const whiskers = scene.add.graphics().lineStyle(2, COLORS.muted, 0.7);
  whiskers.lineBetween(-18, 8, -42, 3).lineBetween(-18, 13, -43, 16);
  whiskers.lineBetween(18, 8, 42, 3).lineBetween(18, 13, 43, 16);
  if (type === 'decoy' || type === 'friendly') whiskers.lineBetween(0, 10, 0, 14);
  else whiskers.lineBetween(0, 10, 0, 17).lineBetween(-5, 17, 5, 17);
  mouse.add(whiskers);
  mouse.add(scene.add.ellipse(-24, 28, 20, 12, COLORS.cream));
  mouse.add(scene.add.ellipse(24, 28, 20, 12, COLORS.cream));
  if (look !== 'standard') mouse.add(drawLook(scene, type, look, bodyColor));
  if (type === 'decoy') {
    mouse.add(makeDecoyExpression(scene));
    addFlower(mouse, scene);
  }
  if (type === 'friendly') {
    const smile = scene.add.graphics().setName('friendly-smile').lineStyle(2.2, COLORS.mouseEye);
    smile.beginPath().moveTo(-8, 15).lineTo(-5, 18).lineTo(0, 20).lineTo(5, 18).lineTo(8, 15).strokePath();
    mouse.add(smile);
    mouse.add(makeMagicFlower(scene, 38, -39));
    mouse.add(makeFriendlyHeart(scene, 0, -48));
  }
  if (type === 'golden') addStar(mouse, scene);
  const helmet = type === 'helmet' ? addHelmet(mouse, scene) : undefined;
  return { object: mouse, helmet };
}

function makeDecoyExpression(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const face = scene.add.graphics().setName('decoy-expression');
  face.fillStyle(COLORS.mouseEye).fillEllipse(-14, -10, 12, 6).fillEllipse(14, -10, 12, 6);
  face.fillStyle(COLORS.cream).fillCircle(-12, -10.5, 1.25).fillCircle(12, -10.5, 1.25);
  face.lineStyle(3.2, COLORS.mouseEye).lineBetween(-23, -21, -7, -15).lineBetween(23, -21, 7, -15);
  face.lineStyle(2.5, COLORS.mouseEye).beginPath().moveTo(-8, 21).lineTo(-5, 18)
    .lineTo(0, 16).lineTo(5, 18).lineTo(8, 21).strokePath();
  return face;
}

function makeNoTouch(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const ink = 0x9f3745;
  const sign = scene.add.graphics().setPosition(x, y).setName('no-touch');
  sign.fillStyle(COLORS.cream).fillCircle(0, 0, 14)
    .lineStyle(2.5, ink).strokeCircle(0, 0, 11);
  sign.fillStyle(COLORS.ink).fillRoundedRect(-4, -2, 8, 9, 3)
    .fillRoundedRect(-5, -5, 2.3, 7, 1).fillRoundedRect(-2, -8, 2.3, 8, 1)
    .fillRoundedRect(1, -7, 2.3, 7, 1).fillRoundedRect(4, -5, 2.3, 7, 1)
    .fillCircle(-5, 2, 2.5);
  sign.lineStyle(4.6, COLORS.cream).lineBetween(-7.5, 7.5, 7.5, -7.5);
  sign.lineStyle(2.9, ink).lineBetween(-7.5, 7.5, 7.5, -7.5);
  return sign;
}

function drawLook(scene: Phaser.Scene, type: MouseType, look: Exclude<MouseLook, 'standard'>,
  fur: number): Phaser.GameObjects.Graphics {
  const art = scene.add.graphics().setName('mouse-look');
  const marking = type === 'golden' ? 0xa96e33 : 0x896d5c;
  switch (look) {
    case 'spotted':
      art.fillStyle(marking, 0.7).fillCircle(-25, -25, 5).fillCircle(-17, -30, 3)
        .fillCircle(25, -23, 4).fillEllipse(31, -18, 6, 8);
      break;
    case 'freckles':
      art.fillStyle(marking, 0.95);
      for (const side of [-1, 1]) {
        art.fillCircle(side * 12, 3, 1.7).fillCircle(side * 17, 1, 1.35).fillCircle(side * 19, 6, 1.4);
      }
      break;
    case 'rosy':
      art.fillStyle(0xe88c9e, 0.82).fillEllipse(-26, 6, 18, 11).fillEllipse(26, 6, 18, 11);
      art.fillStyle(0xf5b7bf, 0.82).fillEllipse(-28, 4, 8, 4).fillEllipse(28, 4, 8, 4);
      break;
    case 'striped':
      art.lineStyle(2.8, marking, 0.82);
      for (const direction of [-1, 1]) {
        art.lineBetween(direction * 32, -21, direction * 24, -19);
        art.lineBetween(direction * 35, -16, direction * 27, -14);
        art.lineBetween(direction * 35, -11, direction * 30, -9);
      }
      break;
    case 'fluffy':
      art.fillStyle(fur).fillTriangle(-30, 4, -40, 10, -30, 13).fillTriangle(30, 4, 40, 10, 30, 13)
        .fillTriangle(-32, 10, -38, 17, -28, 17).fillTriangle(32, 10, 38, 17, 28, 17);
      art.lineStyle(1.3, marking, 0.46);
      for (const direction of [-1, 1]) {
        art.lineBetween(direction * 39, 10, direction * 31, 13)
          .lineBetween(direction * 37, 17, direction * 29, 17);
      }
      if (type === 'normal' || type === 'decoy' || type === 'golden') {
        art.fillTriangle(-12, -36, -8, -49, 2, -38).fillTriangle(-7, -39, 6, -50, 9, -36);
      }
      break;
    case 'starry':
      art.fillStyle(marking, 0.82);
      for (const [x, y, radius] of [[-25, -26, 5], [23, -25, 4], [31, -17, 3]]) {
        const points = Array.from({ length: 8 }, (_, index) => {
          const angle = index * Math.PI / 4;
          const distance = radius * (index % 2 === 0 ? 1 : 0.38);
          return new Phaser.Math.Vector2(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
        });
        art.fillPoints(points, true);
      }
      break;
  }
  return art;
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
  } else if (type === 'clover') {
    const stem = scene.add.graphics().lineStyle(4, 0x386135);
    stem.beginPath().moveTo(1, 3).lineTo(-2, 15).lineTo(-10, 23).strokePath();
    item.add(stem);
    for (const x of [-11, 11]) {
      for (const y of [-12, 9]) {
        item.add(scene.add.ellipse(x, y, 22, 26, y < 0 ? 0x80bc5a : 0x66a64d)
          .setAngle(x * y > 0 ? -35 : 35).setStrokeStyle(2, 0x386135));
      }
    }
    item.add(scene.add.circle(0, -1, 3, 0xbcd876));
  } else if (type === 'coin') {
    item.add(makeCheeseCoin(scene, 0, 0));
  } else if (type === 'flower') {
    item.add(makeMagicFlower(scene, 0, -2).setScale(1.15));
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

export function makeMagicFlower(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const flower = scene.add.container(x, y);
  flower.add(scene.add.circle(0, -7, 23, 0xffefad, 0.47));
  const petals = scene.add.graphics().lineStyle(4, 0x4d7946)
    .lineBetween(1, 2, -3, 21).fillStyle(0x68a85c).fillEllipse(2, 13, 14, 7);
  petals.fillStyle(0x9454a2);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    petals.fillCircle(Math.cos(angle) * 11, Math.sin(angle) * 11 - 7, 7);
  }
  petals.fillStyle(0xffd568).fillCircle(0, -7, 7).fillStyle(COLORS.cream).fillCircle(-2, -9, 2.5);
  flower.add([petals, scene.add.star(17, -21, 4, 2, 5, COLORS.cream)]);
  return flower;
}

function makeFriendlyHeart(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const heart = scene.add.graphics().setPosition(x, y);
  heart.fillStyle(COLORS.cream).fillCircle(0, 0, 13);
  heart.fillStyle(0xb94262).fillCircle(-4, -2, 5).fillCircle(4, -2, 5)
    .fillTriangle(-8, 1, 8, 1, 0, 9);
  return heart;
}

export function makeCheeseCoin(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const coin = scene.add.graphics().setPosition(x, y);
  coin.fillStyle(0x976027).fillCircle(0, 3, 25);
  coin.fillStyle(0xffcb54).fillCircle(0, 0, 24);
  coin.lineStyle(2, 0xd18e36).strokeCircle(0, 0, 19);
  const wedge = [
    new Phaser.Math.Vector2(-12, 8), new Phaser.Math.Vector2(-13, -1),
    new Phaser.Math.Vector2(-6, -11), new Phaser.Math.Vector2(13, -1),
    new Phaser.Math.Vector2(12, 7),
  ];
  coin.fillStyle(0xffec9d).fillPoints(wedge, true)
    .lineStyle(2, 0x9c6029).strokePoints(wedge, true).lineBetween(-13, -1, 13, -1);
  coin.fillStyle(0xa96728).fillCircle(-5, 3, 2.2).fillCircle(5, 2, 1.8).fillCircle(-3, -5, 1.6);
  return coin;
}

export function makePredictionMarker(scene: Phaser.Scene, x: number, y: number, radius: number,
  type: MouseType): Phaser.GameObjects.Container {
  const marker = scene.add.container(x, y).setDepth(3);
  marker.add(scene.add.circle(0, 0, radius, 0x674579));
  marker.add(scene.add.circle(0, 0, radius - 3, COLORS.cream));
  const icon = scene.add.graphics().setScale(1.55);
  marker.add(icon);
  switch (type) {
    case 'normal':
      icon.fillStyle(COLORS.holeInner).fillCircle(-5, -5, 4).fillCircle(5, -5, 4).fillEllipse(0, 2, 15, 13);
      icon.fillStyle(COLORS.cream).fillCircle(-2.7, 1, 1).fillCircle(2.7, 1, 1);
      break;
    case 'decoy':
      marker.add(makeNoTouch(scene, 0, 0).setScale(1.23));
      break;
    case 'friendly':
      marker.add(makeFriendlyHeart(scene, -6, -1).setScale(0.85));
      marker.add(makeMagicFlower(scene, 8, 3).setScale(0.49));
      break;
    case 'golden':
      marker.add(scene.add.star(0, 0, 5, 7, 14, 0xffc44d).setStrokeStyle(2, COLORS.holeInner));
      break;
    case 'helmet':
      icon.fillStyle(0x31536a).fillRoundedRect(-7, -8, 14, 13, 5).fillRoundedRect(-9, 2, 18, 5, 2);
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
