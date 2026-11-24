import type Phaser from 'phaser';
import { isCumulative, type MouseLook, type PersonalTask } from '../personalTasks';
import type { ProgressStore } from '../ProgressStore';
import { MOUSE_LOOKS, PERSONAL_TASKS } from '../settings';
import { makeMouse } from '../visuals';

const looks = Object.keys(MOUSE_LOOKS) as MouseLook[];
const columns = 4;
const rows = Math.ceil(looks.length / columns);
const cell = 112;

function requirement(task: PersonalTask): string {
  switch (task.metric) {
    case 'normal': return `Поймай обычных мышей — ${task.goal}.`;
    case 'golden': return `Поймай золотых мышей — ${task.goal}.`;
    case 'helmet': return `Поймай мышей в касках — ${task.goal}.`;
    case 'items': return `Подбери полезные предметы — ${task.goal}.`;
    case 'streak': return `Дойди до серии ${task.goal} в одной партии.`;
    case 'score': return `Набери ${task.goal} очков в одной партии.`;
  }
}

function icon(look: MouseLook): HTMLElement {
  const image = document.createElement('span');
  image.className = 'legend-icon';
  image.setAttribute('aria-hidden', 'true');
  const i = looks.indexOf(look);
  image.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  image.style.backgroundPosition = `${(i % columns) * 100 / (columns - 1)}% ${Math.floor(i / columns) * 100 / (rows - 1)}%`;
  return image;
}

export class Collection {
  private readonly dialog = document.createElement('dialog');
  private readonly cards = new Map<MouseLook, { status: HTMLElement; button: HTMLButtonElement }>();
  private readonly list: HTMLElement;
  private readonly taskPanel: HTMLElement;
  private readonly scroll: HTMLElement;

  constructor(scene: Phaser.Scene, private readonly store: ProgressStore) {
    this.dialog.className = 'legend collection';
    this.dialog.setAttribute('aria-labelledby', 'collection-title');
    this.dialog.innerHTML = `
      <header><h2 id="collection-title">Коллекция</h2>
      <form method="dialog"><button class="legend-close" autofocus></button></form></header>
      <nav class="legend-tabs" aria-label="Раздел коллекции">
        <button type="button" aria-controls="collection-looks">Образы</button>
        <button type="button" aria-controls="collection-task">Задание</button>
      </nav>
      <div class="legend-scroll" tabindex="0" role="region" aria-label="Содержимое коллекции">
        <ul class="legend-list" id="collection-looks"></ul>
        <section id="collection-task" hidden></section>
      </div>`;
    this.list = this.dialog.querySelector('#collection-looks')!;
    this.taskPanel = this.dialog.querySelector('#collection-task')!;
    this.scroll = this.dialog.querySelector('.legend-scroll')!;
    const tabs = [...this.dialog.querySelectorAll<HTMLButtonElement>('nav button')];
    tabs.forEach((tab, index) => tab.addEventListener('click', () => this.selectTab(index === 1)));
    for (const look of looks) this.addCard(look);
    document.body.append(this.dialog);
    this.createAtlas(scene);
  }

  open(fromResult: boolean): void {
    if (this.dialog.open) return;
    this.dialog.querySelector('.legend-close')!.textContent = fromResult ? 'К результату' : 'В меню';
    this.renderCards();
    this.renderTask();
    this.selectTab(false);
    this.dialog.showModal();
    this.scroll.scrollTop = 0;
  }

  destroy(): void { this.dialog.remove(); }

  private selectTab(task: boolean): void {
    this.list.hidden = task;
    this.taskPanel.hidden = !task;
    this.dialog.querySelectorAll('nav button').forEach((tab, index) =>
      tab.setAttribute('aria-pressed', String(Boolean(index) === task)));
    this.scroll.scrollTop = 0;
  }

  private addCard(look: MouseLook): void {
    const row = document.createElement('li');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = MOUSE_LOOKS[look];
    const status = document.createElement('p');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Выбрать';
    button.setAttribute('aria-label', `Выбрать образ «${MOUSE_LOOKS[look]}»`);
    button.addEventListener('click', () => {
      this.store.selectLook(look);
      this.renderCards();
    });
    copy.append(title, status);
    row.append(icon(look), copy, button);
    this.list.append(row);
    this.cards.set(look, { status, button });
  }

  private renderCards(): void {
    const { unlockedLooks, selectedLook } = this.store.snapshot;
    for (const [look, { status, button }] of this.cards) {
      const unlocked = unlockedLooks.includes(look);
      const task = PERSONAL_TASKS.find(({ reward }) => reward === look);
      status.textContent = unlocked ? (look === selectedLook ? 'Открыт · выбран' : 'Открыт')
        : `Закрыт · ${task?.title ? `«${task.title}». ${requirement(task)}` : ''}`;
      button.hidden = !unlocked || look === selectedLook;
    }
  }

  private renderTask(): void {
    const { activeTask, taskProgress } = this.store.snapshot;
    const task = PERSONAL_TASKS.find(({ id }) => id === activeTask);
    const heading = document.createElement('h3');
    heading.textContent = task?.title ?? 'Все задания выполнены!';
    this.taskPanel.replaceChildren(heading);
    if (!task) return;
    const detail = document.createElement('p');
    detail.textContent = `${requirement(task)} ${isCumulative(task) ? 'Суммарно за завершённые партии.' : 'Цель нужно выполнить за одну партию.'}`;
    const progress = document.createElement('p');
    progress.textContent = `Зафиксировано — ${taskProgress} / ${task.goal}`;
    const meter = document.createElement('progress');
    meter.max = task.goal;
    meter.value = taskProgress;
    meter.setAttribute('aria-label', 'Зафиксированный прогресс');
    const reward = document.createElement('div');
    reward.className = 'collection-reward';
    reward.append(icon(task.reward), `Награда — «${MOUSE_LOOKS[task.reward]}»`);
    this.taskPanel.append(detail, progress, meter, reward);
  }

  private createAtlas(scene: Phaser.Scene): void {
    const key = 'mouse-collection-atlas';
    const atlas = scene.textures.addDynamicTexture(key, columns * cell, rows * cell);
    if (!atlas) return;
    const art = looks.map((look, index) => {
      const x = (index % columns + 0.5) * cell;
      const y = Math.floor(index / columns) * cell + 64;
      const mouse = makeMouse(scene, x, y, 'normal', look).object.setScale(0.96);
      mouse.removeFromDisplayList();
      atlas.capture(mouse, {});
      return mouse;
    });
    atlas.render().snapshot(image => {
      if (image instanceof HTMLImageElement) this.dialog.style.setProperty('--legend-atlas', `url("${image.src}")`);
    });
    art.forEach(mouse => mouse.destroy());
    scene.textures.remove(atlas);
  }
}
