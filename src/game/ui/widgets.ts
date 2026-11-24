import Phaser from 'phaser';
import { COLORS, ANIMATION } from '../theme';

export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, radius = 24,
  color = COLORS.cream): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x66553c, 0.12).fillRoundedRect(x, y + 5, width, height, radius);
  g.fillStyle(color).fillRoundedRect(x, y, width, height, radius);
  return g;
}

export function makeText(scene: Phaser.Scene, x: number,
  y: number,
  text: string,
  size: number,
  color: string | number,
  originX = 0,
  originY = 0,
): Phaser.GameObjects.Text {
  // Число (например, 0xfacc15) превращаем в строку вида '#facc15'
  const colorString = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;

  return scene.add
    .text(x, y, text, {
      fontFamily: 'Trebuchet MS, Arial, sans-serif',
      align: 'center',
      lineSpacing: 6,
      fontSize: `${size}px`,
      color: colorString,
    })
    .setOrigin(originX, originY);
}

export function createButton(scene: Phaser.Scene, x: number, y: number, label: string,
  onClick: () => void, secondary = false, width = 290): Phaser.GameObjects.Container {
  const height = secondary ? 40 : 72;
  const radius = secondary ? 14 : 23;
  const base = secondary ? COLORS.ground : COLORS.button;
  const hover = secondary ? 0xd5e5b8 : COLORS.buttonHover;
  const pressedColor = secondary ? COLORS.grass : COLORS.buttonPressed;
  const button = scene.add.container(x, y);
  const background = panel(scene, -width / 2, -height / 2, width, height, radius, base);
  const text = makeText(scene, 0, 0, label, secondary ? 20 : 28, secondary ? COLORS.ink : COLORS.cream, 0.5, 0.5);
  const target = scene.add.zone(0, 0, width, height).setInteractive({ useHandCursor: true });
  let pressed = false;
  const paint = (color: number, scale: number) => {
    background.clear().fillStyle(pressedColor).fillRoundedRect(-width / 2, -height / 2 + 5, width, height, radius);
    background.fillStyle(color).fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    scene.tweens.killTweensOf(button);
    scene.tweens.add({ targets: button, scale, duration: ANIMATION.button });
  };
  target.on('pointerover', () => paint(hover, 1.03));
  target.on('pointerout', () => { pressed = false; paint(base, 1); });
  target.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number,
    event: Phaser.Types.Input.EventData) => {
    event.stopPropagation(); pressed = true; paint(pressedColor, 0.97);
  });
  target.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number,
    event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    if (pressed) { pressed = false; onClick(); }
  });
  button.add([background, text, target]);
  return button;
}
