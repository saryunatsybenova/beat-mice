import Phaser from 'phaser';
import { GameState } from '../GameState';
import { BALANCE } from '../settings';
import { COLORS, ANIMATION } from '../theme';
import { makeMouse } from '../visuals';
import { panel, makeText, createButton } from './widgets';

interface UIActions { start: () => void; resume: () => void; restart: () => void; }

/** HUD, всплывающие подсказки и экраны. Не изменяет игровые правила. */
export class GameUI {
  private stageText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Graphics[] = [];
  private hud!: Phaser.GameObjects.Container;
  private uiLayer?: Phaser.GameObjects.Container;
  private layoutWidth = 960;
  private layoutHeight = 640;

  constructor(private readonly scene: Phaser.Scene, private readonly state: GameState,
    private readonly actions: UIActions) {}

  resize(width: number, height: number): void {
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
  }

  hideOverlay(): void { this.uiLayer?.destroy(); this.uiLayer = undefined; }
  start(): void { this.hideOverlay(); this.hud.setVisible(true); }
  updateTime(): void { this.timeText.setText(`${Math.ceil(this.state.remainingMs / 1000)} с`); }
  updateScore(): void { this.scoreText.setText(String(this.state.score)); }

  showPhase2(): void {
    this.stageText.setText('ФАЗА 2 · Мышки быстрее!').setColor('#9a5b29');
    this.scene.tweens.add({ targets: this.stageText, alpha: 0.65, duration: 200, yoyo: true, repeat: 2 });
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

  dispose(): void { this.hideOverlay(); this.hud?.destroy(); }

  private createHud(): void {
    const w = this.layoutWidth;
    const cardWidth = (w - 48) / 3;
    this.hud = this.scene.add.container(0, 0).setDepth(10);
    this.hearts = [];
    const labels = ['СЧЁТ', 'ЖИЗНИ', 'ВРЕМЯ'];
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * (cardWidth + 8);
      this.hud.add(panel(this.scene, x, 18, cardWidth, 91, 20));
      this.hud.add(makeText(this.scene, x + cardWidth / 2, 40, labels[i], 16, COLORS.muted, 0.5, 0.5));
    }
    this.scoreText = makeText(this.scene, 16 + cardWidth / 2, 76, String(this.state.score), 32, COLORS.ink, 0.5, 0.5);
    this.timeText = makeText(this.scene, w - 16 - cardWidth / 2, 76,
      `${Math.ceil(this.state.remainingMs / 1000)} с`, 30, COLORS.ink, 0.5, 0.5);
    this.hud.add([this.scoreText, this.timeText]);
    const spacing = Math.min(26, (cardWidth - 20) / BALANCE.startLives);
    for (let i = 0; i < BALANCE.startLives; i++) {
      const heart = this.scene.add.graphics().setPosition(w / 2 + (i - (BALANCE.startLives - 1) / 2) * spacing, 77);
      this.hearts.push(heart);
      this.hud.add(heart);
    }
    this.stageText = makeText(this.scene, w / 2, 119,
      this.state.gameStage === 1 ? 'ФАЗА 1' : 'ФАЗА 2 · Мышки быстрее!',
      18, this.state.gameStage === 1 ? COLORS.muted : '#9a5b29', 0.5, 0.5);
    this.hud.add(this.stageText);
    this.drawHearts();
    this.hud.setVisible(this.state.phase === 'playing' || this.state.phase === 'paused');
  }

  private drawHearts(): void {
    this.hearts.forEach((heart, i) => {
      heart.clear().fillStyle(i < this.state.lives ? COLORS.pink : COLORS.emptyHeart);
      heart.fillCircle(-5, -3, 6).fillCircle(5, -3, 6).fillTriangle(-11, -1, 11, -1, 0, 12);
    });
  }

  feedback(x: number, y: number, label: string, color: number): void {
    const text = makeText(this.scene, x, y - 32, label, 32, color, 0.5, 0.5).setDepth(15);
    this.scene.tweens.add({ targets: text, y: y - 85, alpha: 0, duration: ANIMATION.feedback,
      ease: 'Cubic.out', onComplete: () => text.destroy() });
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
    layer.add(makeMouse(this.scene, w / 2, top + 92));
    layer.add(makeText(this.scene, w / 2, top + 162, 'Бей мышей', 44, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 209, 'Маленькая игра в большом саду', 20, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 276,
      'Нажимай на мышек,\nпока они не спрятались!', 24, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 342,
      `Попадание: +${BALANCE.hitPoints} · Пропуск: −${BALANCE.missLives} жизнь\n${BALANCE.startLives} жизней · ${BALANCE.durationMs / 1000} секунд`,
      20, COLORS.muted, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 435, 'Играть', this.actions.start));
    layer.add(makeText(this.scene, w / 2, top + 496, 'Мышь / касание · P или Esc — пауза', 17, COLORS.muted, 0.5, 0.5));
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
    const { w, top, layer } = this.createOverlay();
    layer.add(makeMouse(this.scene, w / 2, top + 92));
    layer.add(makeText(this.scene, w / 2, top + 170, 'Игра окончена', 38, COLORS.ink, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 226,
      this.state.lives === 0 ? 'Мышки оказались проворнее!' : 'Время вышло — хороший улов!',
      21, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 288, 'ТВОЙ СЧЁТ', 18, COLORS.muted, 0.5, 0.5));
    layer.add(makeText(this.scene, w / 2, top + 348, String(this.state.score), 64, COLORS.buttonPressed, 0.5, 0.5));
    layer.add(createButton(this.scene, w / 2, top + 435, 'Заново',
      this.actions.restart));
    layer.add(makeText(this.scene, w / 2, top + 496, 'Ещё одна прогулка по саду?', 18, COLORS.muted, 0.5, 0.5));
  }
}
