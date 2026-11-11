import Phaser from 'phaser';
import { COLORS } from './theme';

export type MouseType = 'normal' | 'decoy';

export function makeMouse(scene: Phaser.Scene, x: number, y: number,
  type: MouseType = 'normal'): Phaser.GameObjects.Container {
  const mouse = scene.add.container(x, y);
  mouse.add(scene.add.ellipse(0, 18, 90, 27, COLORS.holeInner).setAlpha(0.18));
  mouse.add(scene.add.circle(-29, -30, 22, COLORS.mouseBody).setStrokeStyle(2, 0xa59585));
  mouse.add(scene.add.circle(29, -30, 22, COLORS.mouseBody).setStrokeStyle(2, 0xa59585));
  mouse.add(scene.add.circle(-29, -30, 14, COLORS.mouseEar));
  mouse.add(scene.add.circle(29, -30, 14, COLORS.mouseEar));
  mouse.add(scene.add.ellipse(0, -4, 80, 76, COLORS.mouseBody).setStrokeStyle(2, 0xa59585));
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
  return mouse;
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
