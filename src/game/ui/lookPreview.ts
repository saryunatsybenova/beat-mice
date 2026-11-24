import type Phaser from 'phaser';
import type { MouseLook } from '../personalTasks';
import { MOUSE_LOOKS } from '../settings';
import { makeMouse } from '../visuals';

export const looks = Object.keys(MOUSE_LOOKS) as MouseLook[];
const columns = 4;
const rows = Math.ceil(looks.length / columns);
const cell = 112;
const cache = new WeakMap<Phaser.Textures.TextureManager, Promise<string>>();

export function lookIcon(look: MouseLook): HTMLElement {
  const icon = document.createElement('span');
  icon.className = 'legend-icon';
  icon.setAttribute('aria-hidden', 'true');
  const index = looks.indexOf(look);
  icon.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  icon.style.backgroundPosition = `${(index % columns) * 100 / (columns - 1)}% ${Math.floor(index / columns) * 100 / (rows - 1)}%`;
  return icon;
}

export function applyLookAtlas(scene: Phaser.Scene, element: HTMLElement): void {
  let artwork = cache.get(scene.textures);
  if (!artwork) {
    artwork = new Promise<string>(resolve => {
      const atlas = scene.textures.addDynamicTexture('mouse-collection-atlas', columns * cell, rows * cell);
      if (!atlas) { resolve(''); return; }
      const art = looks.map((look, index) => {
        const x = (index % columns + 0.5) * cell;
        const y = Math.floor(index / columns) * cell + 64;
        const mouse = makeMouse(scene, x, y, 'normal', look).object.setScale(0.96);
        mouse.removeFromDisplayList();
        atlas.capture(mouse, {});
        return mouse;
      });
      atlas.render().snapshot(image => resolve(image instanceof HTMLImageElement ? image.src : ''));
      art.forEach(mouse => mouse.destroy());
      scene.textures.remove(atlas);
    });
    cache.set(scene.textures, artwork);
  }
  void artwork.then(url => {
    if (url && element.isConnected) element.style.setProperty('--legend-atlas', `url("${url}")`);
  });
}
