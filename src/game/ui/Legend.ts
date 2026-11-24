import type Phaser from 'phaser';
import { BALANCE } from '../settings';
import { makeMouse, makeUsefulItem, type MouseType, type UsefulItemType } from '../visuals';

const plural = new Intl.PluralRules('ru');
function count(value: number, one: string, few: string, many: string): string {
  const form = plural.select(value);
  return `${value} ${form === 'one' ? one : form === 'few' ? few : many}`;
}

const points = (value: number) => count(value, 'очко', 'очка', 'очков');
const blockDuration = count(BALANCE.cheeseBlockAppearances, 'появление', 'появления', 'появлений');

type Entry = { title: string; detail: string } & ({ mouse: MouseType } | { item: UsefulItemType });
const sections: { title: string; entries: Entry[] }[] = [
  { title: 'Мыши', entries: [
    { mouse: 'normal', title: 'Обычная мышь', detail: `Базовая награда — ${points(BALANCE.hitPoints)}. Пропуск отнимает жизнь.` },
    { mouse: 'decoy', title: 'Ложная мышь с цветком', detail: 'Нажатие отнимает жизнь. Можно пропустить.' },
    { mouse: 'golden', title: 'Золотая мышь', detail: `Базовая награда — ${points(BALANCE.goldenHitPoints)}. Можно пропустить.` },
    { mouse: 'helmet', title: 'Мышь в каске', detail: `Сбей каску и поймай мышь. Базовая награда — ${points(BALANCE.helmetHitPoints)}.` },
    { mouse: 'friendly', title: 'Дружественная мышь', detail: `Возвращает ${count(BALANCE.friendlyMouseLifeGain, 'жизнь', 'жизни', 'жизней')} при нажатии.` },
  ] },
  { title: 'Предметы', entries: [
    { item: 'cheese', title: 'Маленький сыр', detail: `Закрывает ${count(BALANCE.cheeseBlockedHoles.cheese, 'нору', 'норы', 'нор')} на ${blockDuration} мышей.` },
    { item: 'bigCheese', title: 'Большой сыр', detail: `Закрывает до ${BALANCE.cheeseBlockedHoles.bigCheese} нор на ${blockDuration} мышей.` },
    { item: 'heart', title: 'Сердечко', detail: 'Возвращает потерянную жизнь.' },
    { item: 'shield', title: 'Щит', detail: `Поглощает ${count(BALANCE.shieldCharges, 'ошибку', 'ошибки', 'ошибок')} и сохраняет серию.` },
    { item: 'glasses', title: 'Волшебные очки', detail: `Заранее показывают тип следующих мышей (${BALANCE.glassesPredictions} предсказаний).` },
    { item: 'clover', title: 'Клевер', detail: `Превращает обычных мышей в золотых (${count(BALANCE.cloverConversions, 'превращение', 'превращения', 'превращений')}).` },
    { item: 'coin', title: 'Сырная монета', detail: `Даёт ещё ${points(BALANCE.cheeseCoinBonus)} за следующую поимку.` },
    { item: 'flower', title: 'Волшебный цветок', detail: 'Превращает следующую ложную мышь в дружественную.' },
  ] },
];

const atlasEntries = sections.flatMap(section => section.entries);
const columns = 4;
const rows = Math.ceil(atlasEntries.length / columns);
const cell = 112;

/**
 * Нативное окно даёт прокрутку касанием и закрытие по Esc. Рисунки снимком
 * собираются в один атлас из тех же фигур Phaser, которыми пользуется поле.
 */
export class Legend {
  private readonly dialog = document.createElement('dialog');
  private readonly scroll = document.createElement('div');
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly lists: HTMLUListElement[] = [];

  constructor(scene: Phaser.Scene) {
    this.dialog.className = 'legend';
    this.dialog.setAttribute('aria-labelledby', 'legend-title');
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.id = 'legend-title';
    title.textContent = 'Мыши и предметы';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'legend-close';
    close.textContent = 'Закрыть';
    close.autofocus = true;
    close.addEventListener('click', () => this.dialog.close());
    header.append(title, close);

    const navigation = document.createElement('div');
    navigation.className = 'legend-tabs';
    navigation.setAttribute('role', 'group');
    navigation.setAttribute('aria-label', 'Раздел легенды');
    this.scroll.className = 'legend-scroll';
    this.scroll.tabIndex = 0;
    this.scroll.setAttribute('role', 'region');
    for (const [index, section] of sections.entries()) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = section.title;
      tab.addEventListener('click', () => this.select(index));
      const list = document.createElement('ul');
      list.className = 'legend-list';
      list.id = `legend-section-${index}`;
      tab.setAttribute('aria-controls', list.id);
      list.append(...section.entries.map(entry => this.createRow(entry)));
      this.buttons.push(tab);
      this.lists.push(list);
      navigation.append(tab);
      this.scroll.append(list);
    }
    this.dialog.append(header, navigation, this.scroll);
    document.body.append(this.dialog);
    this.createAtlas(scene);
  }

  open(): void {
    if (this.dialog.open) return;
    this.select(0);
    this.dialog.showModal();
  }

  destroy(): void {
    this.dialog.remove();
  }

  private select(index: number): void {
    this.buttons.forEach((button, tab) => button.setAttribute('aria-pressed', String(tab === index)));
    this.lists.forEach((list, tab) => { list.hidden = tab !== index; });
    this.scroll.setAttribute('aria-label', sections[index].title);
    this.scroll.scrollTop = 0;
  }

  private createRow(entry: Entry): HTMLLIElement {
    const row = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = 'legend-icon';
    icon.setAttribute('aria-hidden', 'true');
    const index = atlasEntries.indexOf(entry);
    icon.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
    icon.style.backgroundPosition = `${index % columns / (columns - 1) * 100}% ${Math.floor(index / columns) / (rows - 1) * 100}%`;
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = entry.title;
    const detail = document.createElement('p');
    detail.textContent = entry.detail;
    copy.append(name, detail);
    row.append(icon, copy);
    return row;
  }

  private createAtlas(scene: Phaser.Scene): void {
    const key = 'legend-art';
    const atlas = scene.textures.addDynamicTexture(key, columns * cell, rows * cell);
    if (!atlas) return;
    const art = atlasEntries.map((entry, index) => {
      const x = (index % columns + 0.5) * cell;
      const top = Math.floor(index / columns) * cell;
      const object = 'mouse' in entry
        ? makeMouse(scene, x, top + 74, entry.mouse).object.setScale(0.76)
        : makeUsefulItem(scene, x, top + 58, entry.item);
      object.removeFromDisplayList();
      atlas.capture(object, {});
      return object;
    });
    atlas.render().snapshot(image => {
      if (image instanceof HTMLImageElement) this.dialog.style.setProperty('--legend-atlas', `url("${image.src}")`);
    });
    art.forEach(object => object.destroy());
    scene.textures.remove(key);
  }
}
