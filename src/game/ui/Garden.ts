import type Phaser from 'phaser';
import { gardenImage } from '../gardenArt';
import { gardenProgress, type GardenRewardId } from '../gardenProgress';
import type { ProgressStore } from '../ProgressStore';
import { GARDEN_REWARDS } from '../settings';

const positions: Record<GardenRewardId, [number, number]> = {
  flowerbed: [19, 65], bench: [72, 35], fountain: [48, 56],
  hedgehogHome: [83, 71], sleepingCat: [65, 82], fireflies: [29, 34],
};

export class Garden {
  private readonly dialog = document.createElement('dialog');
  private readonly picture: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly total: HTMLElement;
  private readonly next: HTMLElement;
  private readonly meter: HTMLProgressElement;
  private readonly selectedTitle: HTMLElement;
  private readonly selectedCondition: HTMLElement;
  private readonly selectedImage: HTMLImageElement;
  private readonly entries = new Map<GardenRewardId, {
    spot: HTMLButtonElement; select: HTMLButtonElement; toggle: HTMLButtonElement; condition: HTMLElement;
  }>();
  private selected: GardenRewardId = GARDEN_REWARDS[0].id;

  constructor(private readonly scene: Phaser.Scene, private readonly progress: ProgressStore, onDecorChanged: () => void) {
    this.dialog.className = 'garden-dialog';
    this.dialog.setAttribute('aria-labelledby', 'garden-title');
    this.dialog.innerHTML = `
      <header class="garden-header">
        <h2 id="garden-title">Мой сад</h2>
        <form method="dialog"><button class="garden-back" autofocus></button></form>
      </header>
      <div class="garden-scroll">
        <p class="garden-notice" role="status" hidden></p>
        <div class="garden-progress">
          <strong class="garden-total"></strong>
          <span class="garden-next"></span>
          <progress max="100" aria-label="Прогресс следующего сюрприза"></progress>
        </div>
        <div class="garden-layout">
          <div>
            <div class="garden-picture" role="group" aria-label="Декор в саду"></div>
            <div class="garden-detail">
              <img alt=""><div><strong></strong><p></p></div>
            </div>
          </div>
          <ul class="garden-rewards" aria-label="Сюрпризы сада"></ul>
        </div>
      </div>`;
    this.picture = this.dialog.querySelector('.garden-picture')!;
    this.notice = this.dialog.querySelector('.garden-notice')!;
    this.total = this.dialog.querySelector('.garden-total')!;
    this.next = this.dialog.querySelector('.garden-next')!;
    this.meter = this.dialog.querySelector('progress')!;
    this.selectedTitle = this.dialog.querySelector('.garden-detail strong')!;
    this.selectedCondition = this.dialog.querySelector('.garden-detail p')!;
    this.selectedImage = this.dialog.querySelector('.garden-detail img')!;
    this.picture.style.backgroundImage = `url("${gardenImage(scene)}")`;
    const list = this.dialog.querySelector('.garden-rewards')!;

    for (const reward of GARDEN_REWARDS) {
      const { id, title } = reward;
      const spot = document.createElement('button');
      spot.type = 'button';
      spot.className = 'garden-spot';
      spot.setAttribute('aria-label', title);
      spot.style.left = `${positions[id][0]}%`;
      spot.style.top = `${positions[id][1]}%`;
      const art = document.createElement('img');
      art.src = gardenImage(scene, id);
      art.alt = '';
      spot.append(art);
      const row = document.createElement('li');
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'garden-select';
      const name = document.createElement('strong');
      name.textContent = title;
      const condition = document.createElement('span');
      select.append(name, condition);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'garden-toggle';
      const choose = () => { this.selected = id; this.refresh(); };
      spot.addEventListener('click', choose);
      select.addEventListener('click', () => {
        choose();
        this.selectedTitle.closest('.garden-detail')?.scrollIntoView({ block: 'nearest' });
      });
      toggle.addEventListener('click', () => {
        const hidden = this.progress.snapshot.hiddenRewards.includes(id);
        this.progress.setRewardVisible(id, hidden);
        this.refresh();
        onDecorChanged();
      });
      row.append(select, toggle);
      this.picture.append(spot);
      list.append(row);
      this.entries.set(id, { spot, select, toggle, condition });
    }
    document.body.append(this.dialog);
  }

  open(fromResult: boolean): void {
    if (this.dialog.open) return;
    const note = this.progress.takeGardenNotice();
    this.notice.hidden = !note.length;
    this.notice.textContent = note.length
      ? `Открыто за накопленные очки: ${GARDEN_REWARDS.filter(({ id }) => note.includes(id)).map(({ title }) => title).join(', ')}.`
      : '';
    const back = this.dialog.querySelector('.garden-back')!;
    back.textContent = fromResult ? 'К результату' : 'В меню';
    this.refresh();
    this.dialog.showModal();
    this.dialog.querySelector('.garden-scroll')!.scrollTop = 0;
  }

  destroy(): void { this.dialog.remove(); }

  private refresh(): void {
    const { totalPoints, unlockedRewards, hiddenRewards } = this.progress.snapshot;
    const { next, remaining, fraction } = gardenProgress(totalPoints, unlockedRewards);
    this.total.textContent = `Общие очки — ${totalPoints.toLocaleString('ru-RU')}`;
    this.next.textContent = next
      ? `Дальше — ${next.title.toLocaleLowerCase('ru-RU')} · Осталось ${remaining.toLocaleString('ru-RU')}`
      : 'Все сюрпризы открыты!';
    this.meter.hidden = !next;
    this.meter.value = fraction * 100;
    this.picture.classList.toggle('garden-evening', unlockedRewards.includes('fireflies') && !hiddenRewards.includes('fireflies'));

    for (const { id, title, threshold } of GARDEN_REWARDS) {
      const { spot, select, toggle, condition } = this.entries.get(id)!;
      const unlocked = unlockedRewards.includes(id);
      const hidden = hiddenRewards.includes(id);
      const goal = `${threshold.toLocaleString('ru-RU')} общих очков`;
      spot.hidden = unlocked && hidden;
      spot.classList.toggle('garden-locked', !unlocked);
      spot.setAttribute('aria-pressed', String(id === this.selected));
      select.setAttribute('aria-pressed', String(id === this.selected));
      condition.textContent = unlocked ? `Открыто · ${goal}` : `Закрыто · ${goal}`;
      toggle.hidden = !unlocked;
      toggle.textContent = hidden ? 'Показать' : 'Скрыть';
      toggle.setAttribute('aria-label', `${toggle.textContent} — ${title}`);
      if (id === this.selected) {
        this.selectedTitle.textContent = title;
        this.selectedCondition.textContent = unlocked ? `Открыто за ${goal}` : `Условие открытия — ${goal}`;
        this.selectedImage.src = gardenImage(this.scene, id);
      }
    }
  }
}
