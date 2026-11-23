import Phaser from 'phaser';
import type { GameStage, GameState, TransitionStage } from '../GameState';
import { BALANCE } from '../settings';
import { COLORS, ANIMATION } from '../theme';
import { makeMouse, makeShield } from '../visuals';
import { panel, makeText, createButton } from './widgets';
import type { PlayerProgress } from '../ProgressStore';

interface UIActions { start: () => void; resume: () => void; restart: () => void; menu: () => void; }

const STAGE_COLORS = { 1: '#7a705b', 2: '#9a5b29', 3: '#527d48', 4: '#79507f' } as const;
const STAGE_SUBTITLES = {
  2: 'Мыши наступают!',
  4: 'Сад полон сюрпризов!',
} as const;

/** HUD, всплывающие подсказки и экраны. Не изменяет игровые правила. */
export class GameUI {
  private stageText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private bestScoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private blockGroupText!: Phaser.GameObjects.Text;
  private predictionsText!: Phaser.GameObjects.Text;
  private cloverText!: Phaser.GameObjects.Text;
  private shieldIcon!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Graphics[] = [];
  private hud!: Phaser.GameObjects.Container;
  private uiLayer?: Phaser.GameObjects.Container;
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
    private readonly actions: UIActions, private readonly getProgress: () => Readonly<PlayerProgress>) {}

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
      ? makeText(this.scene, this.layoutWidth / 2, this.layoutHeight / 2 + 253,
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
    const wave = this.scene.add.graphics()
      .lineStyle(5, stage === 4 ? COLORS.phase4Tint : COLORS.phase2Tint, 0.28)
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
    if (stage === 4) this.addPhaseCelebration(layer, w / 2, centerY);
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
    if (this.topNotice === effect) this.topNotice = undefined;
  }

  private hideDecoyWarning(): void {
    if (!this.decoyWarning) return;
    this.scene.tweens.killTweensOf(this.decoyWarning);
    this.destroyTransient(this.decoyWarning);
    this.decoyWarning = undefined;
  }

  dispose(): void {
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
    this.hearts = [];
    for (const [i, label] of labels.entries()) {
      this.hud.add(panel(this.scene, cardCenter(i) - cardWidth / 2, 18, cardWidth, 91, 20));
      this.hud.add(makeText(this.scene, cardCenter(i), 40, label, 14, COLORS.muted, 0.5, 0.5));
    }
    this.scoreText = makeText(this.scene, cardCenter(0), 76, String(this.state.score), 32, COLORS.ink, 0.5, 0.5);
    const progress = this.getProgress();
    this.bestScoreText = makeText(this.scene, cardCenter(1), 76,
      progress.bestScore.toLocaleString('ru-RU'), 27, COLORS.ink, 0.5, 0.5);
    this.hud.add([this.scoreText, this.bestScoreText]);
    const livesCenter = cardCenter(2);
    this.shieldIcon = makeShield(this.scene, livesCenter + 44, 40).setScale(0.35);
    this.hud.add(this.shieldIcon);
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
    this.blockGroupText = makeText(this.scene, w / 2, this.layoutHeight - 12, '', 16, COLORS.ink, 0.5, 0.5)
      .setVisible(false);
    this.predictionsText = makeText(this.scene, 16, this.layoutHeight - 12, '', 16, COLORS.ink, 0, 0.5)
      .setFontStyle('bold').setVisible(false);
    this.cloverText = makeText(this.scene, w - 16, this.layoutHeight - 12, '', 16, COLORS.ink, 1, 0.5)
      .setFontStyle('bold').setVisible(false);
    this.hud.add([this.stageText, this.streakText, this.blockGroupText, this.predictionsText, this.cloverText]);
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
    const { w, top, layer } = this.createOverlay(460, 460);
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
    layer.add(makeText(this.scene, center, top + 437, 'Мышь / касание · P или Esc — пауза',
      16, COLORS.muted, 0.5, 0.5));
  }

  showPause(): void {
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

  showGameOver(): void {
    this.hideDecoyWarning();
    this.clearTransientEffects();
    const { w, top, layer } = this.createOverlay();
    layer.add(makeMouse(this.scene, w / 2, top + 92).object);
    layer.add(makeText(this.scene, w / 2, top + 170, 'Игра окончена', 38, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 226, 'Мышки оказались проворнее!',
      21, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 280, 'СЧЁТ ЗА ПАРТИЮ', 18, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 332, String(this.state.score), 58, COLORS.buttonPressed, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 378, `Максимальная серия: ${this.state.bestStreak}`,
      20, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 413, this.progressSummary(), 18, COLORS.muted, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 468, 'Заново',
      this.actions.restart));
  }

  private progressSummary(): string {
    const progress = this.getProgress();
    return `Рекорд: ${progress.bestScore.toLocaleString('ru-RU')} · Общие очки: ${progress.totalPoints.toLocaleString('ru-RU')}`;
  }
}
