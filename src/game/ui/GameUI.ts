import Phaser from 'phaser';
import { GameState } from '../GameState';
import { BALANCE } from '../settings';
import { COLORS, ANIMATION } from '../theme';
import { makeMouse } from '../visuals';
import { panel, makeText, createButton } from './widgets';
import type { PlayerProgress } from '../ProgressStore';

interface UIActions { start: () => void; resume: () => void; restart: () => void; }

/** HUD, всплывающие подсказки и экраны. Не изменяет игровые правила. */
export class GameUI {
  private stageText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private bestScoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private slowMotionText!: Phaser.GameObjects.Text;
  private slowMotionRemainingMs?: number;
  private hearts: Phaser.GameObjects.Graphics[] = [];
  private hud!: Phaser.GameObjects.Container;
  private uiLayer?: Phaser.GameObjects.Container;
  private phaseTransitionLayer?: Phaser.GameObjects.Container;
  private decoyWarning?: Phaser.GameObjects.Container;
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
      this.hideOverlay();
      if (this.state.phase === 'menu') this.showMenu();
      if (this.state.phase === 'paused') this.showPause();
      if (this.state.phase === 'gameover') this.showGameOver();
    }
    if (this.phaseTransitionLayer) {
      this.hidePhaseTransition();
      if (this.state.isTransitioning) {
        this.showPhaseTransition(this.state.gameStage === 3 ? 3 : 2, false);
      }
    }
  }

  hideOverlay(): void { this.uiLayer?.destroy(); this.uiLayer = undefined; }
  start(): void { this.hideOverlay(); this.hud.setVisible(true); }
  updateTime(): void { this.timeText.setText(`${Math.ceil(this.state.remainingMs / 1000)} с`); }
  updateScore(newRecord: boolean): void {
    this.scoreText.setText(String(this.state.score));
    this.bestScoreText.setText(this.getProgress().bestScore.toLocaleString('ru-RU'));
    if (newRecord) this.showNewRecord();
  }

  showStage(stage: 2 | 3): void {
    this.stageText.setText(`ФАЗА ${stage}`).setColor(stage === 2 ? '#9a5b29' : '#527d48');
  }

  updateSlowMotion(remainingMs?: number): void {
    this.slowMotionRemainingMs = remainingMs;
    if (!this.slowMotionText) return;
    this.slowMotionText.setVisible(remainingMs !== undefined);
    if (remainingMs !== undefined) {
      this.slowMotionText.setText(`Замедление · ${(remainingMs / 1_000).toFixed(1)} с`);
    }
  }

  showPhaseTransition(stage: 2 | 3, animate = true): void {
    this.hidePhaseTransition();
    const w = this.layoutWidth, h = this.layoutHeight;
    const centerY = h / 2 + 28;
    const layer = this.scene.add.container(0, 0).setDepth(5);
    const wave = this.scene.add.graphics()
      .lineStyle(5, COLORS.phase2Tint, 0.28)
      .strokeCircle(w / 2, centerY, Math.min(42, w * 0.09));
    const titleSize = Math.min(42, w * 0.09);
    const subtitleSize = Math.min(27, w * 0.06);
    const title = makeText(this.scene, w / 2, centerY - (stage === 3 ? 36 : 18), `ФАЗА ${stage}`, titleSize,
      stage === 2 ? '#8a542f' : '#527d48', 0.5, 0.5);
    const subtitle = makeText(this.scene, w / 2, centerY + (stage === 3 ? 5 : 28),
      stage === 2 ? 'Мыши наступают!' : 'Подкрепление в саду!',
      subtitleSize, '#fff8e9', 0.5, 0.5)
      .setStroke('#654635', 5);
    const reminder = stage === 3
      ? makeText(this.scene, w / 2, centerY + 43, 'Собирай сыр и сердечки',
        Math.min(19, w * 0.042), '#fff8e9', 0.5, 0.5).setStroke('#654635', 4)
      : undefined;
    layer.add([wave, title, subtitle]);
    if (reminder) layer.add(reminder);
    this.phaseTransitionLayer = layer;

    if (!animate) return;
    title.setAlpha(0);
    subtitle.setAlpha(0);
    reminder?.setAlpha(0);
    this.scene.tweens.add({
      targets: [title, subtitle, reminder].filter((object): object is Phaser.GameObjects.Text =>
        object !== undefined), alpha: 1, duration: ANIMATION.phaseText,
      hold: ANIMATION.phaseTextHold, yoyo: true,
      ease: 'Sine.inOut',
    });
    wave.setScale(0.6).setAlpha(0.25);
    this.scene.tweens.add({
      targets: wave, scale: 2.2, alpha: 0, duration: ANIMATION.phaseWave, ease: 'Sine.out',
    });
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
      effect.destroy();
    }
    this.transientEffects.clear();
  }

  private createHud(): void {
    const w = this.layoutWidth;
    const cardWidth = (w - 48) / 4;
    this.hud = this.scene.add.container(0, 0).setDepth(10);
    this.hearts = [];
    const labels = ['СЧЁТ', 'РЕКОРД', 'ЖИЗНИ', 'ВРЕМЯ'];
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * (cardWidth + 8);
      this.hud.add(panel(this.scene, x, 18, cardWidth, 91, 20));
      this.hud.add(makeText(this.scene, x + cardWidth / 2, 40, labels[i], 14, COLORS.muted, 0.5, 0.5));
    }
    this.scoreText = makeText(this.scene, 16 + cardWidth / 2, 76, String(this.state.score), 32, COLORS.ink, 0.5, 0.5);
    const progress = this.getProgress();
    this.bestScoreText = makeText(this.scene, 24 + cardWidth * 1.5, 76,
      progress.bestScore.toLocaleString('ru-RU'), 27, COLORS.ink, 0.5, 0.5);
    this.timeText = makeText(this.scene, w - 16 - cardWidth / 2, 76,
      `${Math.ceil(this.state.remainingMs / 1000)} с`, 30, COLORS.ink, 0.5, 0.5);
    this.slowMotionText = makeText(this.scene, w / 2, 145, '', 17, '#3c7580', 0.5, 0.5);
    this.hud.add([this.scoreText, this.bestScoreText, this.timeText, this.slowMotionText]);
    const livesCenter = 16 + 2 * (cardWidth + 8) + cardWidth / 2;
    const spacing = Math.min(26, (cardWidth - 20) / BALANCE.startLives);
    for (let i = 0; i < BALANCE.startLives; i++) {
      const heart = this.scene.add.graphics()
        .setPosition(livesCenter + (i - (BALANCE.startLives - 1) / 2) * spacing, 77);
      this.hearts.push(heart);
      this.hud.add(heart);
    }
    this.stageText = makeText(this.scene, w / 2, 119,
      `ФАЗА ${this.state.gameStage}`,
      18, this.state.gameStage === 1 ? COLORS.muted :
        this.state.gameStage === 2 ? '#9a5b29' : '#527d48', 0.5, 0.5);
    this.hud.add(this.stageText);
    this.drawHearts();
    this.hud.setVisible(this.state.phase === 'playing' || this.state.phase === 'transition' ||
      this.state.phase === 'paused');
    this.updateSlowMotion(this.slowMotionRemainingMs);
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

  private createOverlay(): { w: number; top: number; layer: Phaser.GameObjects.Container } {
    const w = this.layoutWidth, h = this.layoutHeight;
    const cardWidth = Math.min(560, w - 32), top = (h - 530) / 2;
    const fit = Math.min(1, (h - 24) / 530);
    this.uiLayer = this.scene.add.container(w * (1 - fit) / 2, h * (1 - fit) / 2)
      .setScale(fit).setDepth(30);
    this.uiLayer.add(this.scene.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground, 0.87));
    this.uiLayer.add(panel(this.scene, (w - cardWidth) / 2, top, cardWidth, 530, 32));
    return { w, top, layer: this.uiLayer };
  }

  showMenu(): void {
    const { w, top, layer } = this.createOverlay();
    layer.add(makeMouse(this.scene, w / 2, top + 92).object);
    layer.add(makeText(this.scene, w / 2, top + 162, 'Бей мышей', 44, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 209, 'Маленькая игра в большом саду', 20, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 260,
      'Нажимай на мышек,\nпока они не спрятались!', 22, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 327,
      'Фаза 3 — с 30 очков\nСыр замедляет мышей на 4 секунды\nСердечко возвращает одну жизнь',
      17, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 405, this.progressSummary(), 19, COLORS.buttonPressed, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 462, 'Играть', this.actions.start));
    layer.add(makeText(this.scene, w / 2, top + 516, 'Мышь / касание · P или Esc — пауза', 16, COLORS.muted, 0.5, 0.5));
  }

  showPause(): void {
    const { w, top, layer } = this.createOverlay();
    layer.add(makeText(this.scene, w / 2, top + 155, 'ПАУЗА', 44, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 235,
      'Мышки отдыхают.\nВремя, жизни и счёт сохранены.', 23, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 325,
      `Счёт: ${this.state.score} · Жизни: ${this.state.lives}`, 24, COLORS.ink, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 435, 'Продолжить', this.actions.resume));
    layer.add(makeText(this.scene, w / 2, top + 496, 'P или Esc — продолжить', 18, COLORS.muted, 0.5, 0.5));
  }

  showGameOver(): void {
    this.hideDecoyWarning();
    this.clearTransientEffects();
    const { w, top, layer } = this.createOverlay();
    layer.add(makeMouse(this.scene, w / 2, top + 92).object);
    layer.add(makeText(this.scene, w / 2, top + 170, 'Игра окончена', 38, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 226,
      this.state.lives === 0 ? 'Мышки оказались проворнее!' : 'Время вышло — хороший улов!',
      21, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 280, 'СЧЁТ ЗА ПАРТИЮ', 18, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 332, String(this.state.score), 58, COLORS.buttonPressed, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 386, this.progressSummary(), 18, COLORS.muted, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 435, 'Заново',
      this.actions.restart));
    layer.add(makeText(this.scene, w / 2, top + 496, 'Ещё одна прогулка по саду?', 18, COLORS.muted, 0.5, 0.5));
  }

  private progressSummary(): string {
    const progress = this.getProgress();
    return `Рекорд: ${progress.bestScore.toLocaleString('ru-RU')} · Общие очки: ${progress.totalPoints.toLocaleString('ru-RU')}`;
  }
}
