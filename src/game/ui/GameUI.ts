import Phaser from 'phaser';
import type { GameStage, GameState, TransitionStage } from '../GameState';
import { BALANCE, GARDEN_REWARDS, MOUSE_LOOKS } from '../settings';
import { COLORS, EVENT_ACCENTS, ANIMATION } from '../theme';
import { makeCheeseCoin, makeMagicFlower, makeMouse, makeShield } from '../visuals';
import { panel, makeText, createButton } from './widgets';
import { Legend } from './Legend';
import { Garden } from './Garden';
import { Collection } from './Collection';
import { rewardTexture } from '../gardenArt';
import type { GardenRewardId } from '../gardenProgress';
import type { ProgressStore } from '../ProgressStore';
import type { PersonalTask } from '../personalTasks';
import type { GardenEvent, GardenEventType } from '../GardenEvents';

interface UIActions {
  start: () => void; pause: () => void; resume: () => void;
  restart: () => void; menu: () => void; refreshDecor: () => void;
}

const STAGE_COLORS = { 1: '#7a705b', 2: '#9a5b29', 3: '#527d48', 4: '#79507f', 5: '#874a38' } as const;
const STAGE_SUBTITLES = {
  2: 'Мыши наступают!',
  4: 'Сад полон сюрпризов!',
  5: 'Мыши набирают темп!',
} as const;
const EVENT_LABELS: Record<GardenEventType, { title: string; rule: string }> = {
  goldRush: { title: 'Золотая лихорадка', rule: 'больше золотых мышей!' },
  invasion: { title: 'Нашествие', rule: 'мыши появляются чаще!' },
};

/** HUD, всплывающие подсказки и экраны. Не изменяет игровые правила. */
export class GameUI {
  private readonly pauseButton = document.createElement('button');
  private stageText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private bestScoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private taskText!: Phaser.GameObjects.Text;
  private eventTitle!: Phaser.GameObjects.Text;
  private eventRule!: Phaser.GameObjects.Text;
  private blockGroupText!: Phaser.GameObjects.Text;
  private predictionsText!: Phaser.GameObjects.Text;
  private cloverText!: Phaser.GameObjects.Text;
  private coinIndicator!: Phaser.GameObjects.Container;
  private coinIcon!: Phaser.GameObjects.Graphics;
  private flowerIndicator!: Phaser.GameObjects.Container;
  private shieldIcon!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Graphics[] = [];
  private hud!: Phaser.GameObjects.Container;
  private uiLayer?: Phaser.GameObjects.Container;
  private legend?: Legend;
  private garden?: Garden;
  private collection?: Collection;
  private newRewards: readonly GardenRewardId[] = [];
  private completedTask: PersonalTask | null = null;
  private resultNoticeY = 0;
  private confirmingAbandon = false;
  private phaseTransitionLayer?: Phaser.GameObjects.Container;
  private decoyWarning?: Phaser.GameObjects.Container;
  private streakNotice?: Phaser.GameObjects.Text;
  private bigCheeseNotice?: Phaser.GameObjects.Text;
  private topNotice?: Phaser.GameObjects.Text;
  private readonly transientEffects = new Set<Phaser.GameObjects.GameObject>();
  private layoutWidth = 960;
  private layoutHeight = 640;

  constructor(private readonly scene: Phaser.Scene, private readonly state: GameState,
    private readonly actions: UIActions, private readonly progress: ProgressStore) {
    this.pauseButton.type = 'button';
    this.pauseButton.className = 'game-pause';
    this.pauseButton.setAttribute('aria-label', 'Пауза');
    this.pauseButton.title = 'Пауза (P или Esc)';
    this.pauseButton.hidden = true;
    this.pauseButton.addEventListener('pointerdown', event => event.stopPropagation());
    this.pauseButton.addEventListener('click', event => {
      event.stopPropagation();
      this.actions.pause();
    });
    this.scene.game.canvas.parentElement?.append(this.pauseButton);
  }

  positionPauseButton(top: number, right: number): void {
    this.pauseButton.style.top = `${top}px`;
    this.pauseButton.style.right = `${right}px`;
  }

  private syncPauseButton(): void {
    this.pauseButton.hidden = this.state.phase !== 'playing' && this.state.phase !== 'transition';
  }

  private getProgress() { return this.progress.snapshot; }

  resize(width: number, height: number): void {
    this.hideDecoyWarning();
    this.clearTransientEffects();
    this.layoutWidth = width;
    this.layoutHeight = height;
    this.hud?.destroy();
    this.createHud();
    if (this.uiLayer?.active) {
      const confirmingAbandon = this.confirmingAbandon;
      this.hideOverlay();
      if (this.state.phase === 'menu') this.showMenu();
      if (this.state.phase === 'paused') {
        if (confirmingAbandon) this.showAbandonConfirmation();
        else this.showPause();
      }
      if (this.state.phase === 'gameover') this.showGameOver();
    }
    if (this.phaseTransitionLayer) {
      this.hidePhaseTransition();
      const stage = this.state.gameStage;
      if (this.state.isTransitioning && stage !== 1) {
        this.showPhaseTransition(stage, false);
      }
    }
  }

  hideOverlay(): void {
    this.uiLayer?.destroy();
    this.uiLayer = undefined;
    this.confirmingAbandon = false;
    this.syncPauseButton();
  }
  start(): void { this.hideOverlay(); this.hud.setVisible(true); }
  updateScore(newRecord: boolean): void {
    this.scoreText.setText(String(this.state.score));
    this.bestScoreText.setText(this.getProgress().bestScore.toLocaleString('ru-RU'));
    if (newRecord) this.showNewRecord();
  }

  showStage(stage: GameStage): void {
    this.stageText.setText(stage === 4 ? 'Фаза 4' : `ФАЗА ${stage}`).setColor(STAGE_COLORS[stage]);
  }

  updateGardenEvent(event?: Readonly<GardenEvent>): void {
    this.eventTitle.setVisible(event !== undefined);
    this.eventRule.setVisible(event?.status === 'warning');
    if (!event) return;
    const { title, rule } = EVENT_LABELS[event.type];
    const color = EVENT_ACCENTS[event.type].textColor.toString(16).padStart(6, '0');
    this.eventTitle.setText(event.status === 'active' ? `${title} · ${event.remaining}` : `${title} —`)
      .setColor(`#${color}`);
    if (event.status === 'warning') this.eventRule.setText(rule);
  }

  updateTask(task: PersonalTask | undefined, amount: number): void {
    this.taskText.setText(task
      ? amount >= task.goal ? 'Цель достигнута — завершите партию' : `${task.label} · ${amount}/${task.goal}`
      : '').setVisible(task !== undefined && !this.topNotice);
  }

  get gardenEventLabelPosition() {
    return { x: this.eventTitle.x + this.eventTitle.width / 2, y: this.eventTitle.y };
  }

  updateStreak(): void {
    const { gameStage, streak, isTransitioning } = this.state;
    this.streakText.setVisible(gameStage >= 3 || (gameStage === 2 && !isTransitioning));
    const active = this.state.scoreMultiplier > 1;
    const multiplier = `×${BALANCE.streakMultiplier}`;
    const detail = active ? multiplier : `До ${multiplier}: ещё ${BALANCE.streakThreshold - streak}`;
    this.streakText.setText(`Серия: ${streak} · ${detail}`)
      .setColor(active ? '#386135' : '#493e32')
      .setFontStyle(active ? 'bold' : 'normal');
  }

  updateBlockGroup(closed?: number, remaining?: number): void {
    this.blockGroupText.setVisible(closed !== undefined);
    if (closed === undefined) return;
    const remainingLabel = this.layoutWidth === 480 ? 'Появлений' : 'Осталось появлений';
    this.blockGroupText.setText(remaining === undefined ? 'Ожидаем свободные норы' :
      `Закрыто нор: ${closed} · ${remainingLabel}: ${remaining}`);
  }

  showBigCheeseNotice(): void {
    if (this.bigCheeseNotice) {
      this.scene.tweens.killTweensOf(this.bigCheeseNotice);
      this.destroyTransient(this.bigCheeseNotice);
    }
    const notice = makeText(this.scene, this.layoutWidth / 2, this.layoutHeight - 32,
      'Закрываем три норы!', 17, COLORS.holeInner, 0.5, 0.5).setFontStyle('bold').setDepth(12);
    this.bigCheeseNotice = notice;
    this.transientEffects.add(notice);
    this.scene.tweens.add({
      targets: notice, alpha: 0, delay: ANIMATION.feedback, duration: ANIMATION.feedback,
      onComplete: () => this.destroyTransient(notice),
    });
  }

  showStreakNotice(activated: boolean): void {
    this.updateStreak();
    if (this.streakNotice) {
      this.scene.tweens.killTweensOf(this.streakNotice);
      this.destroyTransient(this.streakNotice);
    }
    const label = activated ? `Серия! Очки ×${BALANCE.streakMultiplier}` : 'Серия прервана';
    const color = activated ? '#386135' : COLORS.holeInner;
    const resultOverlay = this.state.phase === 'gameover' ? this.uiLayer : undefined;
    const notice = resultOverlay
      ? makeText(this.scene, this.layoutWidth / 2, this.resultNoticeY,
        label, 16, color, 0.5, 0.5)
      : makeText(this.scene, 16, 119, label, 16, color, 0, 0.5).setDepth(12);
    notice.setFontStyle('bold');
    resultOverlay?.add(notice);
    this.streakNotice = notice;
    this.transientEffects.add(notice);
    this.scene.tweens.add({
      targets: notice, alpha: 0, delay: 650, duration: 350,
      onComplete: () => this.destroyTransient(notice),
    });
  }

  showPhaseTransition(stage: TransitionStage, animate = true): void {
    this.hidePhaseTransition();
    const w = this.layoutWidth, h = this.layoutHeight;
    const centerY = h / 2 + 28;
    const layer = this.scene.add.container(0, 0).setDepth(5);
    const tint = stage === 5 ? COLORS.phase5Tint : stage === 4 ? COLORS.phase4Tint : COLORS.phase2Tint;
    const wave = this.scene.add.graphics()
      .lineStyle(5, tint, 0.28)
      .strokeCircle(w / 2, centerY, Math.min(42, w * 0.09));
    const titleSize = Math.min(42, w * 0.09);
    const title = makeText(this.scene, w / 2, centerY - (stage === 3 ? 0 : 18), `ФАЗА ${stage}`, titleSize,
      stage === 2 ? '#8a542f' : STAGE_COLORS[stage], 0.5, 0.5);
    const labels = [title];
    if (stage !== 3) {
      labels.push(makeText(this.scene, w / 2, centerY + 28, STAGE_SUBTITLES[stage],
        Math.min(27, w * 0.06), '#fff8e9', 0.5, 0.5).setStroke('#654635', 5));
    }
    layer.add([wave, ...labels]);
    this.phaseTransitionLayer = layer;

    if (!animate) return;
    labels.forEach(label => label.setAlpha(0));
    this.scene.tweens.add({
      targets: labels, alpha: 1, duration: ANIMATION.phaseText,
      hold: ANIMATION.phaseTextHold, yoyo: true,
      ease: 'Sine.inOut',
    });
    wave.setScale(0.6).setAlpha(0.25);
    this.scene.tweens.add({
      targets: wave, scale: 2.2, alpha: 0, duration: ANIMATION.phaseWave, ease: 'Sine.out',
    });
    if (stage >= 4) this.addPhaseCelebration(layer, w / 2, centerY);
  }

  private addPhaseCelebration(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    const starCount = 8;
    for (let i = 0; i < starCount; i++) {
      const angle = (i + 0.5) * Math.PI * 2 / starCount;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const star = this.scene.add.star(x + dx * 124, y + dy * 66, 4, 3, 9,
        i % 2 === 0 ? COLORS.accent : COLORS.cream).setAlpha(0);
      layer.addAt(star, 1);
      this.scene.tweens.add({
        targets: star, alpha: 0.85, x: star.x + dx * 36, y: star.y + dy * 24,
        duration: ANIMATION.phaseText, hold: ANIMATION.phaseTextHold,
        yoyo: true, ease: 'Sine.inOut',
      });
    }
  }

  hidePhaseTransition(): void {
    if (!this.phaseTransitionLayer) return;
    this.scene.tweens.killTweensOf(this.phaseTransitionLayer.list);
    this.phaseTransitionLayer.destroy();
    this.phaseTransitionLayer = undefined;
  }

  showMiss(): void {
    this.drawHearts();
    // Реакция HUD тоже приостанавливается вместе с игровыми анимациями.
    this.scene.tweens.killTweensOf(this.hud);
    this.hud.setX(0);
    this.scene.tweens.add({ targets: this.hud, x: 4, duration: 30, yoyo: true, repeat: 1 });
    const lostHeart = this.hearts[this.state.lives];
    if (lostHeart) {
      this.scene.tweens.killTweensOf(lostHeart);
      lostHeart.setScale(1);
      this.scene.tweens.add({ targets: lostHeart, scale: 1.5, duration: 110, yoyo: true });
    }
  }

  showLifeRestored(x: number, y: number, restored: boolean): void {
    if (restored) {
      this.drawHearts();
      const restoredHeart = this.hearts[this.state.lives - 1];
      if (restoredHeart) {
        this.scene.tweens.killTweensOf(restoredHeart);
        restoredHeart.setScale(1);
        this.scene.tweens.add({ targets: restoredHeart, scale: 1.55, duration: 150, yoyo: true });
      }
      this.feedback(x, y, '+1 жизнь', COLORS.buttonPressed);
      return;
    }
    this.feedback(x, y, 'Жизни полные', COLORS.buttonPressed);
  }

  updateShield(): void {
    this.shieldIcon.setVisible(this.state.hasShield);
  }

  updatePredictions(remaining: number): void {
    this.predictionsText.setVisible(remaining > 0).setText(`Очки: ${remaining}`);
  }

  showGlassesPickup(): void {
    this.showTopNotice('Видишь, кто появится!');
  }

  updateClover(remaining: number): void {
    this.cloverText.setVisible(remaining > 0).setText(`Клевер: ${remaining}`);
  }

  showCloverPickup(): void {
    this.showTopNotice('Три золотых шанса!');
  }

  updateFlower(active: boolean): void {
    this.flowerIndicator.setVisible(active);
  }

  showFlowerPickup(): void {
    this.showTopNotice('Следующая мышка с цветком поможет!');
  }

  showFriendlyMouse(): void {
    this.showTopNotice('Мышка с сердцем — нажимай!');
  }

  updateCoin(): void {
    const active = this.state.hasCoinBonus;
    this.coinIndicator.setVisible(active);
    this.scoreText.setY(this.layoutHeight === 500 && active ? 68 : 76);
  }

  showCoinPickup(): void {
    this.updateCoin();
    this.showTopNotice(`Следующая мышь принесёт +${BALANCE.cheeseCoinBonus}!`);
  }

  showCoinSpent(): void {
    this.updateCoin();
    const coin = makeCheeseCoin(this.scene, this.coinIndicator.x + this.coinIcon.x, this.coinIndicator.y)
      .setScale(0.36).setDepth(12);
    this.transientEffects.add(coin);
    this.scene.tweens.add({
      targets: coin, x: coin.x + 24, scale: 0.12, alpha: 0, duration: ANIMATION.feedback,
      ease: 'Cubic.out', onComplete: () => this.destroyTransient(coin),
    });
  }

  showCloverTransformation(x: number, y: number): void {
    for (const direction of [-1, 1]) {
      const spark = this.scene.add.star(x + 37 * direction, y - 15, 4, 3, 9,
        COLORS.accent).setDepth(-1);
      this.transientEffects.add(spark);
      this.scene.tweens.add({
        targets: spark, x: x + 51 * direction, y: y - 26, scale: 0.5, alpha: 0,
        duration: ANIMATION.feedback, ease: 'Cubic.out', onComplete: () => this.destroyTransient(spark),
      });
    }
  }

  showShieldPickup(activated: boolean): void {
    this.updateShield();
    if (activated) this.animateShield(0x528797);
    this.showTopNotice(activated ? 'Защищает от одной ошибки и сохраняет серию' : 'Щит уже активен');
  }

  showShieldSaved(): void {
    this.updateShield();
    this.animateShield(COLORS.accent);
    this.showTopNotice('Щит спас!');
  }

  private animateShield(color: number): void {
    const ring = this.scene.add.circle(this.shieldIcon.x, this.shieldIcon.y, 10)
      .setStrokeStyle(3, color).setDepth(12);
    this.transientEffects.add(ring);
    this.scene.tweens.add({
      targets: ring, alpha: 0, scale: 1.55, duration: ANIMATION.feedback, ease: 'Cubic.out',
      onComplete: () => this.destroyTransient(ring),
    });
  }

  private showTopNotice(label: string): void {
    if (this.topNotice) {
      this.scene.tweens.killTweensOf(this.topNotice);
      this.destroyTransient(this.topNotice);
    }
    const notice = makeText(this.scene, this.layoutWidth / 2, 9, label, 15, COLORS.ink, 0.5, 0.5)
      .setFontStyle('bold').setDepth(12);
    this.topNotice = notice;
    this.taskText.setVisible(false);
    this.transientEffects.add(notice);
    this.scene.tweens.add({
      targets: notice, alpha: 0, delay: 900, duration: ANIMATION.feedback,
      onComplete: () => this.destroyTransient(notice),
    });
  }

  showDecoyWarning(): void {
    this.hideDecoyWarning();
    const width = Math.min(440, this.layoutWidth - 32);
    const warning = this.scene.add.container(this.layoutWidth / 2, 166).setDepth(22);
    this.decoyWarning = warning;
    this.transientEffects.add(warning);
    warning.add(panel(this.scene, -width / 2, -24, width, 48, 14, COLORS.cream));
    warning.add(makeText(this.scene, 0, 0, 'Не трогай мышку с цветком!',
      Math.min(18, width / 24), COLORS.buttonPressed, 0.5, 0.5));
    this.scene.tweens.add({
      targets: warning, alpha: 0, delay: 500, duration: 500,
      onComplete: () => this.destroyTransient(warning),
    });
  }

  showHelmetHint(x: number, y: number): void {
    const width = Math.min(280, this.layoutWidth - 32);
    const hint = this.scene.add.container(x, Math.max(148, y - 82)).setDepth(22);
    hint.add(panel(this.scene, -width / 2, -22, width, 44, 13, COLORS.cream));
    hint.add(makeText(this.scene, 0, 0, 'Ещё одно попадание!',
      Math.min(17, width / 17), COLORS.buttonPressed, 0.5, 0.5));
    this.transientEffects.add(hint);
    this.scene.tweens.add({
      targets: hint, alpha: 0, delay: 500, duration: 450,
      onComplete: () => this.destroyTransient(hint),
    });
  }

  showGoldenHit(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const spark = this.scene.add.star(x, y, 4, 4, 11,
        i % 2 === 0 ? 0xffd447 : 0xfff4a8).setDepth(16);
      this.transientEffects.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 38,
        y: y + Math.sin(angle) * 38,
        alpha: 0,
        scale: 0.2,
        duration: 360,
        onComplete: () => this.destroyTransient(spark),
      });
    }
  }

  private destroyTransient(effect: Phaser.GameObjects.GameObject): void {
    this.transientEffects.delete(effect);
    effect.destroy();
    if (this.decoyWarning === effect) this.decoyWarning = undefined;
    if (this.streakNotice === effect) this.streakNotice = undefined;
    if (this.bigCheeseNotice === effect) this.bigCheeseNotice = undefined;
    if (this.topNotice === effect) {
      this.topNotice = undefined;
      this.taskText.setVisible(Boolean(this.taskText.text));
    }
  }

  private hideDecoyWarning(): void {
    if (!this.decoyWarning) return;
    this.scene.tweens.killTweensOf(this.decoyWarning);
    this.destroyTransient(this.decoyWarning);
    this.decoyWarning = undefined;
  }

  dispose(): void {
    this.pauseButton.remove();
    this.legend?.destroy();
    this.garden?.destroy();
    this.collection?.destroy();
    this.hideOverlay();
    this.hidePhaseTransition();
    this.hideDecoyWarning();
    this.clearTransientEffects();
    this.hud?.destroy();
  }

  private clearTransientEffects(): void {
    for (const effect of this.transientEffects) {
      this.scene.tweens.killTweensOf(effect);
      this.destroyTransient(effect);
    }
    this.transientEffects.clear();
  }

  private createHud(): void {
    const w = this.layoutWidth;
    const labels = ['СЧЁТ', 'РЕКОРД', 'ЖИЗНИ'];
    const cardWidth = (w - 48) / labels.length;
    const cardCenter = (i: number) => 16 + i * (cardWidth + 8) + cardWidth / 2;
    this.hud = this.scene.add.container(0, 0).setDepth(10);
    this.taskText = makeText(this.scene, w / 2, 9, '', 14, COLORS.ink, 0.5, 0.5);
    this.hud.add(this.taskText);
    this.hearts = [];
    for (const [i, label] of labels.entries()) {
      this.hud.add(panel(this.scene, cardCenter(i) - cardWidth / 2, 18, cardWidth, 91, 20));
      this.hud.add(makeText(this.scene, cardCenter(i), 40, label, 14, COLORS.muted, 0.5, 0.5));
    }
    this.scoreText = makeText(this.scene, cardCenter(0), 76, String(this.state.score), 32, COLORS.ink, 0.5, 0.5);
    const progress = this.getProgress();
    this.bestScoreText = makeText(this.scene, cardCenter(1), 76,
      progress.bestScore.toLocaleString('ru-RU'), 27, COLORS.ink, 0.5, 0.5);
    const compact = this.layoutHeight === 500;
    this.coinIndicator = this.scene.add.container(compact ? cardCenter(0) : w / 2, compact ? 94 : 145);
    const coinLabel = makeText(this.scene, 10, 0, `Следующая поимка +${BALANCE.cheeseCoinBonus}`,
      15, COLORS.holeInner, 0.5, 0.5).setFontStyle('bold');
    this.coinIcon = makeCheeseCoin(this.scene, -coinLabel.width / 2 - 3, 0).setScale(0.3);
    this.coinIndicator.add([this.coinIcon, coinLabel]);
    this.hud.add([this.scoreText, this.bestScoreText, this.coinIndicator]);
    this.updateCoin();
    const livesCenter = cardCenter(2);
    this.shieldIcon = makeShield(this.scene, livesCenter + 44, 40).setScale(0.35);
    this.flowerIndicator = makeMagicFlower(this.scene, livesCenter - 44, 42).setScale(0.35).setVisible(false);
    this.hud.add([this.shieldIcon, this.flowerIndicator]);
    this.updateShield();
    const spacing = Math.min(26, (cardWidth - 20) / BALANCE.startLives);
    for (let i = 0; i < BALANCE.startLives; i++) {
      const heart = this.scene.add.graphics()
        .setPosition(livesCenter + (i - (BALANCE.startLives - 1) / 2) * spacing, 77);
      this.hearts.push(heart);
      this.hud.add(heart);
    }
    this.stageText = makeText(this.scene, w / 2, 119, '', 18, COLORS.muted, 0.5, 0.5);
    this.showStage(this.state.gameStage);
    this.streakText = makeText(this.scene, w - 16, 119, '', 16, COLORS.ink, 1, 0.5);
    this.eventTitle = makeText(this.scene, 16, 119, '', 16, COLORS.ink, 0, 0.5)
      .setFontStyle('bold').setVisible(false);
    this.eventRule = makeText(this.scene, 16, 131, '', 12, COLORS.ink, 0, 0.5).setVisible(false);
    this.blockGroupText = makeText(this.scene, w / 2, this.layoutHeight - 12, '', 16, COLORS.ink, 0.5, 0.5)
      .setVisible(false);
    this.predictionsText = makeText(this.scene, 16, this.layoutHeight - 12, '', 16, COLORS.ink, 0, 0.5)
      .setFontStyle('bold').setVisible(false);
    this.cloverText = makeText(this.scene, w - 16, this.layoutHeight - 12, '', 16, COLORS.ink, 1, 0.5)
      .setFontStyle('bold').setVisible(false);
    this.hud.add([this.stageText, this.streakText, this.eventTitle, this.eventRule,
      this.blockGroupText, this.predictionsText, this.cloverText]);
    this.drawHearts();
    this.hud.setVisible(this.state.phase === 'playing' || this.state.phase === 'transition' ||
      this.state.phase === 'paused');
    this.updateStreak();
  }

  private drawHearts(): void {
    this.hearts.forEach((heart, i) => {
      heart.clear().fillStyle(i < this.state.lives ? COLORS.pink : COLORS.emptyHeart);
      heart.fillCircle(-5, -3, 6).fillCircle(5, -3, 6).fillTriangle(-11, -1, 11, -1, 0, 12);
    });
  }

  feedback(x: number, y: number, label: string, color: number): void {
    const text = makeText(this.scene, x, y - 32, label, 32, color, 0.5, 0.5).setDepth(15);
    this.transientEffects.add(text);
    this.scene.tweens.add({ targets: text, y: y - 85, alpha: 0, duration: ANIMATION.feedback,
      ease: 'Cubic.out', onComplete: () => this.destroyTransient(text) });
  }

  private showNewRecord(): void {
    const text = makeText(this.scene, 20, 148, 'Новый рекорд!', 20, COLORS.buttonPressed, 0, 0.5)
      .setDepth(20);
    this.transientEffects.add(text);
    this.scene.tweens.add({
      targets: text, alpha: 0, duration: 1_500, delay: 500,
      onComplete: () => this.destroyTransient(text),
    });
  }

  private createOverlay(cardHeight = 530, maxCardWidth = 560):
    { w: number; top: number; layer: Phaser.GameObjects.Container } {
    const w = this.layoutWidth, h = this.layoutHeight;
    const cardWidth = Math.min(maxCardWidth, w - 32), top = (h - cardHeight) / 2;
    const fit = Math.min(1, (h - 24) / cardHeight);
    this.uiLayer = this.scene.add.container(w * (1 - fit) / 2, h * (1 - fit) / 2)
      .setScale(fit).setDepth(30);
    this.uiLayer.add(this.scene.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground, 0.87));
    this.uiLayer.add(panel(this.scene, (w - cardWidth) / 2, top, cardWidth, cardHeight, 32));
    return { w, top, layer: this.uiLayer };
  }

  showMenu(): void {
    this.syncPauseButton();
    const { w, top, layer } = this.createOverlay(510, 460);
    const center = w / 2;
    layer.add(this.scene.add.circle(center, top + 78, 53, COLORS.ground, 0.48)
      .setStrokeStyle(1, COLORS.leaf, 0.35));
    layer.add(this.scene.add.ellipse(center - 67, top + 82, 9, 20, COLORS.leaf, 0.55).setAngle(-42));
    layer.add(this.scene.add.ellipse(center + 67, top + 82, 9, 20, COLORS.leaf, 0.55).setAngle(42));
    layer.add(makeMouse(this.scene, center, top + 87).object.setScale(0.92));
    layer.add(makeText(this.scene, center, top + 164, 'Бей мышей', 46, COLORS.ink, 0.5, 0.5)
      .setFontStyle('bold'));
    layer.add(makeText(this.scene, center, top + 222,
      'Нажимай на мышек,\nпока они не спрятались!', 21, COLORS.muted, 0.5, 0.5));

    const progress = this.getProgress();
    const stats = this.scene.add.graphics()
      .fillStyle(COLORS.ground, 0.36).fillRoundedRect(center - 145, top + 268, 290, 62, 18);
    stats.lineStyle(1, COLORS.leaf, 0.35).lineBetween(center, top + 279, center, top + 319);
    layer.add(stats);
    const entries = [
      { x: center - 72, label: 'Рекорд', value: progress.bestScore },
      { x: center + 72, label: 'Общие очки', value: progress.totalPoints },
    ];
    for (const { x, label, value } of entries) {
      layer.add(makeText(this.scene, x, top + 286, label, 14, COLORS.muted, 0.5, 0.5));
      const score = makeText(this.scene, x, top + 309, value.toLocaleString('ru-RU'),
        24, COLORS.buttonPressed, 0.5, 0.5).setFontStyle('bold');
      layer.add(score.setScale(Math.min(1, 128 / score.width)));
    }

    layer.add(createButton(this.scene, center, top + 379, 'Играть', this.actions.start));
    layer.add(createButton(this.scene, center - 106, top + 441, 'Мыши и предметы',
      () => (this.legend ??= new Legend(this.scene)).open(), true, 170));
    layer.add(createButton(this.scene, center + 32, top + 441, 'Мой сад',
      () => this.openGarden(false), true, 88));
    layer.add(createButton(this.scene, center + 135, top + 441, 'Коллекция',
      () => this.openCollection(false), true, 104));
    layer.add(makeText(this.scene, center, top + 484, 'Мышь / касание · P или Esc — пауза',
      16, COLORS.muted, 0.5, 0.5));
  }

  showPause(): void {
    this.syncPauseButton();
    const { w, top, layer } = this.createOverlay();
    layer.add(makeText(this.scene, w / 2, top + 155, 'ПАУЗА', 44, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 235,
      'Мышки отдыхают.\nСчёт, жизни и серия сохранены.', 23, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 325,
      `Счёт: ${this.state.score} · Жизни: ${this.state.lives}`, 24, COLORS.ink, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 379, 'Продолжить', this.actions.resume));
    layer.add(createButton(this.scene, w / 2, top + 457, 'В меню', () => this.showAbandonConfirmation()));
    layer.add(makeText(this.scene, w / 2, top + 511, 'P или Esc — продолжить', 18, COLORS.muted, 0.5, 0.5));
  }

  private showAbandonConfirmation(): void {
    this.hideOverlay();
    this.confirmingAbandon = true;
    const { w, top, layer } = this.createOverlay(360, 520);
    layer.add(makeText(this.scene, w / 2, top + 64, 'Прервать партию?', 35, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 132,
      'Очки этой партии не будут добавлены к общей сумме', 22, COLORS.muted, 0.5, 0.5)
      .setWordWrapWidth(Math.min(390, w - 88)));
    layer.add(createButton(this.scene, w / 2, top + 217, 'Прервать партию', this.actions.menu));
    layer.add(createButton(this.scene, w / 2, top + 299, 'Отмена', this.actions.resume));
  }

  private openGarden(fromResult: boolean): void {
    const garden = this.garden ??= new Garden(this.scene, this.progress, this.actions.refreshDecor);
    garden.open(fromResult);
    if (fromResult && this.newRewards.length) {
      this.hideOverlay();
      this.showGameOver([]);
    }
  }

  private openCollection(fromResult: boolean): void {
    (this.collection ??= new Collection(this.scene, this.progress)).open(fromResult);
    if (fromResult && this.completedTask) {
      this.hideOverlay();
      this.showGameOver(this.newRewards, null);
    }
  }

  showGameOver(rewards: readonly GardenRewardId[] = this.newRewards, task: PersonalTask | null = this.completedTask): void {
    this.syncPauseButton();
    this.newRewards = rewards;
    this.completedTask = task;
    this.hideDecoyWarning();
    this.clearTransientEffects();
    if (rewards.length || task) {
      this.showRewardResult();
      return;
    }
    const { w, top, layer } = this.createOverlay(570);
    this.resultNoticeY = top + 24;
    layer.add(makeMouse(this.scene, w / 2, top + 92).object);
    layer.add(makeText(this.scene, w / 2, top + 170, 'Игра окончена', 38, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 226, 'Мышки оказались проворнее!',
      21, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 280, 'СЧЁТ ЗА ПАРТИЮ', 18, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 332, String(this.state.score), 58, COLORS.buttonPressed, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 378, `Максимальная серия: ${this.state.bestStreak}`,
      20, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 413, this.progressSummary(), 18, COLORS.muted, 0.5, 0.5));
    this.addResultButtons(layer, w / 2, top + 468);
  }

  private showRewardResult(): void {
    const earned = GARDEN_REWARDS.filter(({ id }) => this.newRewards.includes(id));
    const gardenHeight = earned.length > 3 ? 164 : earned.length ? 99 : 0;
    const taskHeight = this.completedTask ? 71 : 0;
    const buttonY = 289 + gardenHeight + taskHeight;
    const { w, top, layer } = this.createOverlay(buttonY + 96);
    const center = w / 2;
    this.resultNoticeY = top + 16;
    layer.add(makeMouse(this.scene, center, top + 62).object.setScale(0.62));
    layer.add(makeText(this.scene, center, top + 108, 'Игра окончена', 32, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, center, top + 138, 'СЧЁТ ЗА ПАРТИЮ', 15, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, center, top + 171, String(this.state.score), 45, COLORS.buttonPressed, 0.5, 0.5));
    layer.add(makeText(this.scene, center, top + 208, `Максимальная серия: ${this.state.bestStreak}`,
      17, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, center, top + 231, this.progressSummary(), 17, COLORS.muted, 0.5, 0.5));
    if (earned.length) {
      layer.add(panel(this.scene, center - 199, top + 248, 398, gardenHeight - 6, 18, 0xeaf0d3));
      layer.add(makeText(this.scene, center, top + 264, 'Новый сюрприз!',
        18, COLORS.buttonPressed, 0.5, 0.5).setFontStyle('bold'));
    }
    for (const [index, { id, title }] of earned.entries()) {
      const row = Math.floor(index / 3);
      const columns = Math.min(3, earned.length - row * 3);
      const x = center + (index % 3 - (columns - 1) / 2) * 124;
      const y = top + 288 + row * 52;
      layer.add(this.scene.add.image(x, y, rewardTexture(this.scene, id)).setScale(0.42));
      layer.add(makeText(this.scene, x, y + 18, title, 12, COLORS.ink, 0.5)
        .setLineSpacing(0).setWordWrapWidth(columns === 1 ? 220 : 124));
    }
    if (this.completedTask) {
      const { title, reward } = this.completedTask;
      const y = top + 248 + gardenHeight;
      layer.add(panel(this.scene, center - 199, y, 398, 65, 18, 0xf4e9cc));
      layer.add(makeMouse(this.scene, center - 146, y + 35, 'normal', reward).object.setScale(0.53));
      layer.add(makeText(this.scene, center - 103, y + 12, 'Задание выполнено', 17, COLORS.ink).setFontStyle('bold'));
      layer.add(makeText(this.scene, center - 103, y + 36, title, 15, COLORS.ink));
      layer.add(makeText(this.scene, center + 191, y + 37, MOUSE_LOOKS[reward], 15, COLORS.buttonPressed, 1));
    }
    this.addResultButtons(layer, center, top + buttonY);
  }

  private addResultButtons(layer: Phaser.GameObjects.Container, center: number, y: number): void {
    layer.add(createButton(this.scene, center - 102, y, 'Заново', this.actions.restart, false, 171));
    layer.add(createButton(this.scene, center + 86, y, 'В меню', this.actions.menu, false, 188));
    layer.add(createButton(this.scene, center - 102, y + 61, 'Посмотреть сад', () => this.openGarden(true), true, 171));
    layer.add(createButton(this.scene, center + 86, y + 61, 'Посмотреть коллекцию', () => this.openCollection(true), true, 188));
  }

  private progressSummary(): string {
    const progress = this.getProgress();
    return `Рекорд: ${progress.bestScore.toLocaleString('ru-RU')} · Общие очки: ${progress.totalPoints.toLocaleString('ru-RU')}`;
  }
}
