import Phaser from 'phaser';

// ===== Настройки игры (константы) =====
const GAME_DURATION_MS = 90_000; // длительность партии, мс (90 секунд)
const HIT_POINTS = 1; // очков за попадание
const MISS_LIVES = 1; // потеря жизней за пропуск
const START_LIVES = 5; // сколько жизней в начале партии
const MOUSE_VISIBLE_MS = 1_000; // сколько мышь видна, мс (1 секунда)
const SPAWN_INTERVAL_MS = 1_200; // как часто появляется новая мышь, мс
const GRID_COLS = 3; // нор по горизонтали
const GRID_ROWS = 3; // нор по вертикали
const CELL_SIZE = 200; // расстояние между центрами нор
const HOLE_RADIUS = 58; // радиус норы
const MOUSE_HIT_RADIUS = 58; // радиус, в котором клик считается попаданием

// Длительность анимаций, мс
const ANIMATION = { appear: 150, hide: 120, feedback: 500, button: 90 };
const COLORS = {
  ground: 0xc7dfa3, grass: 0xaccd84, leaf: 0x6c9858,
  holeRim: 0xb98a62, holeInner: 0x654635, soil: 0xd7aa7c,
  mouseBody: 0xc4b4a2, mouseEar: 0xe6b2b0, mouseEye: 0x42382f,
  cream: 0xfff8e9, ink: 0x493e32, muted: 0x7a705b,
  button: 0x759b5a, buttonHover: 0x86ac69, buttonPressed: 0x5d8046,
  accent: 0xe3a451, pink: 0xd87881, emptyHeart: 0xded5c5,
};

// Одна нора: координаты центра и мышь, которая сейчас в ней (или null)
interface Hole {
  x: number;
  y: number;
  mouse: Phaser.GameObjects.Container | null;
  hideTimer?: Phaser.Time.TimerEvent;
}

/**
 * Игра «Бей мышей».
 *
 * Четыре фазы: menu (правила + «Играть»), playing (сама игра), paused (пауза),
 * gameover (итоговый счёт + «Заново»).
 */
export class GameScene extends Phaser.Scene {
  private phase: 'menu' | 'playing' | 'paused' | 'gameover' = 'menu';
  private holes: Hole[] = [];
  private score = 0;
  private lives = START_LIVES;
  private remainingMs = GAME_DURATION_MS;

  private scoreText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Graphics[] = [];
  private hud!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Container;
  private holeDecor!: Phaser.GameObjects.Container;
  private layoutWidth = 960;
  private layoutHeight = 640;
  private timeText!: Phaser.GameObjects.Text;
  private uiLayer!: Phaser.GameObjects.Container;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private deadline = 0;
  private pausedTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super('GameScene');
  }

  create(data: { startImmediately?: boolean } = {}): void {
    // Полный сброс состояния (нужно и для кнопки «Заново»)
    this.phase = 'menu';
    this.score = 0;
    this.lives = START_LIVES;
    this.remainingMs = GAME_DURATION_MS;
    this.holes = [];
    this.spawnTimer = undefined;
    this.deadline = 0;
    this.time.paused = false;
    this.pausedTweens = [];

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.setupInput();
    this.showMenu();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    if (data.startImmediately) this.startGame();
  }

  update(): void {
    if (this.phase === 'playing') this.refreshTime();
  }

  // Реальное время не растягивает партию при низком FPS или скрытой вкладке.
  private refreshTime(): boolean {
    if (this.phase !== 'playing') return false;
    this.remainingMs = Math.max(0, this.deadline - performance.now());
    this.timeText.setText(`${Math.ceil(this.remainingMs / 1000)} с`);
    if (this.remainingMs === 0) {
      this.endGame();
      return false;
    }
    return true;
  }

  // ===== Оформление =====

  // Координаты макета не зависят от размера экрана и поворота телефона.
  private layout(): void {
    const portrait = this.scale.width < this.scale.height;
    const compact = !portrait && this.scale.height < 480;
    this.layoutWidth = portrait ? 480 : compact ? 800 : 960;
    this.layoutHeight = portrait ? 760 : compact ? 500 : 640;
    const zoom = Math.min(this.scale.width / this.layoutWidth, this.scale.height / this.layoutHeight);
    this.cameras.main.setZoom(zoom).centerOn(this.layoutWidth / 2, this.layoutHeight / 2);
    this.ground?.destroy();
    this.holeDecor?.destroy();
    this.hud?.destroy();
    this.createGround();
    this.createHoles();
    this.createHud();
    if (this.uiLayer?.active) {
      this.uiLayer.destroy();
      if (this.phase === 'menu') this.showMenu();
      if (this.phase === 'gameover') this.showGameOver();
      if (this.phase === 'paused') this.showPause();
    }
  }

  private panel(x: number, y: number, width: number, height: number, radius = 24,
    color = COLORS.cream): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0x66553c, 0.12).fillRoundedRect(x, y + 5, width, height, radius);
    g.fillStyle(color).fillRoundedRect(x, y, width, height, radius);
    return g;
  }

  private createGround(): void {
    const w = this.layoutWidth, h = this.layoutHeight;
    this.ground = this.add.container(0, 0).setDepth(-10);
    this.ground.add(this.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground));
    this.ground.add(this.panel(14, 128, w - 28, h - 150, 36, COLORS.grass));
    const grass = this.add.graphics().lineStyle(2, COLORS.leaf, 0.3);
    for (let i = 0; i < 42; i++) {
      const x = 28 + ((i * 137) % (w - 56));
      const y = 150 + ((i * 97) % (h - 185));
      grass.lineBetween(x - 4, y, x - 7, y - 7);
      grass.lineBetween(x, y, x + 2, y - 9);
      grass.lineBetween(x + 4, y, x + 8, y - 5);
    }
    this.ground.add(grass);
    for (let i = 0; i < 8; i++) {
      const x = i % 2 ? w - 27 : 27;
      const y = 173 + Math.floor(i / 2) * (h - 210) / 4;
      const flower = this.add.container(x, y);
      for (let p = 0; p < 5; p++) {
        const angle = p * Math.PI * 2 / 5;
        flower.add(this.add.circle(Math.cos(angle) * 6, Math.sin(angle) * 6, 4, COLORS.cream));
      }
      flower.add(this.add.circle(0, 0, 3, COLORS.accent));
      this.ground.add(flower);
    }
  }

  private createHoles(): void {
    const portrait = this.layoutWidth === 480;
    const spacingX = portrait ? 144 : CELL_SIZE;
    const spacingY = portrait ? 184 : this.layoutHeight === 500 ? 120 : 164;
    const startX = (this.layoutWidth - (GRID_COLS - 1) * spacingX) / 2;
    const startY = portrait ? 237 : this.layoutHeight === 500 ? 181 : 236;
    this.holeDecor = this.add.container(0, 0).setDepth(-5);
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const x = startX + col * spacingX, y = startY + row * spacingY;
        this.holeDecor.add([
          this.add.ellipse(x, y + 22, HOLE_RADIUS * 2 + 16, 65, COLORS.leaf).setAlpha(0.25),
          this.add.ellipse(x, y + 13, HOLE_RADIUS * 2 + 8, 66, COLORS.soil),
          this.add.ellipse(x, y + 9, HOLE_RADIUS * 2, 58, COLORS.holeRim),
          this.add.ellipse(x, y + 7, HOLE_RADIUS * 2 - 12, 43, COLORS.holeInner),
        ]);
        const index = row * GRID_COLS + col;
        if (this.holes[index]) {
          const hole = this.holes[index];
          hole.x = x; hole.y = y;
          if (hole.mouse) hole.mouse.setPosition(x, y);
        } else this.holes.push({ x, y, mouse: null });
      }
    }
  }

  private createHud(): void {
    const w = this.layoutWidth;
    const cardWidth = (w - 48) / 3;
    this.hud = this.add.container(0, 0).setDepth(10);
    this.hearts = [];
    const labels = ['СЧЁТ', 'ЖИЗНИ', 'ВРЕМЯ'];
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * (cardWidth + 8);
      this.hud.add(this.panel(x, 18, cardWidth, 91, 20));
      this.hud.add(this.makeText(x + cardWidth / 2, 40, labels[i], 16, COLORS.muted, 0.5, 0.5));
    }
    this.scoreText = this.makeText(16 + cardWidth / 2, 76, String(this.score), 32, COLORS.ink, 0.5, 0.5);
    this.timeText = this.makeText(w - 16 - cardWidth / 2, 76,
      `${Math.ceil(this.remainingMs / 1000)} с`, 30, COLORS.ink, 0.5, 0.5);
    this.hud.add([this.scoreText, this.timeText]);
    const spacing = Math.min(26, (cardWidth - 20) / START_LIVES);
    for (let i = 0; i < START_LIVES; i++) {
      const heart = this.add.graphics().setPosition(w / 2 + (i - (START_LIVES - 1) / 2) * spacing, 77);
      this.hearts.push(heart);
      this.hud.add(heart);
    }
    this.drawHearts();
    this.hud.setVisible(this.phase === 'playing' || this.phase === 'paused');
  }

  private drawHearts(): void {
    this.hearts.forEach((heart, i) => {
      heart.clear().fillStyle(i < this.lives ? COLORS.pink : COLORS.emptyHeart);
      heart.fillCircle(-5, -3, 6).fillCircle(5, -3, 6).fillTriangle(-11, -1, 11, -1, 0, 12);
    });
  }

  private feedback(x: number, y: number, label: string, color: number): void {
    const text = this.makeText(x, y - 32, label, 32, color, 0.5, 0.5).setDepth(15);
    this.tweens.add({ targets: text, y: y - 85, alpha: 0, duration: ANIMATION.feedback,
      ease: 'Cubic.out', onComplete: () => text.destroy() });
  }

  // ===== Ввод =====

  private setupInput(): void {
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.on('keydown', this.handlePauseKey, this);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.refreshTime()) return;

    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    for (const hole of this.holes) {
      if (hole.mouse === null) continue;
      const distance = Phaser.Math.Distance.Between(
        point.x, point.y, hole.x, hole.y,
      );
      if (distance <= MOUSE_HIT_RADIUS) {
        this.hitMouse(hole);
        break; // один клик — одно попадание
      }
    }
  }

  private cleanup(): void {
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.off('keydown', this.handlePauseKey, this);
    this.time.paused = false;
    this.pausedTweens = [];
    this.scale.off('resize', this.layout, this);
    this.spawnTimer?.remove();
    this.spawnTimer = undefined;
    for (const hole of this.holes) {
      hole.hideTimer?.remove();
      hole.hideTimer = undefined;
    }
  }

  // ===== Игровая логика =====

  private handlePauseKey(event: KeyboardEvent): void {
    // code работает и при русской раскладке; удержание не переключает паузу многократно.
    if (event.repeat || (event.code !== 'KeyP' && event.code !== 'Escape')) return;
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    event.preventDefault();
    if (this.phase === 'playing') this.pauseGame();
    else this.resumeGame();
  }

  private pauseGame(): void {
    if (!this.refreshTime()) return;
    this.phase = 'paused';
    this.time.paused = true; // сохраняем прогресс появления и скрытия мышей
    this.pausedTweens = this.tweens.getTweens().filter((tween) => !tween.isPaused());
    this.pausedTweens.forEach((tween) => tween.pause());
    this.showPause();
  }

  private resumeGame(): void {
    if (this.phase !== 'paused') return;
    // Исключаем время паузы из отсчёта реальных часов браузера.
    this.deadline = performance.now() + this.remainingMs;
    this.uiLayer.destroy();
    this.phase = 'playing';
    this.time.paused = false;
    this.pausedTweens.forEach((tween) => tween.resume());
    this.pausedTweens = [];
  }

  private startGame(): void {
    if (this.phase !== 'menu') return;
    this.deadline = performance.now() + GAME_DURATION_MS;
    this.phase = 'playing';
    this.uiLayer.destroy();

    this.hud.setVisible(true);

    // Периодически появляется новая мышь
    this.spawnTimer = this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => this.spawnMouse(),
    });
    this.spawnMouse(); // первая мышь — сразу
  }

  private spawnMouse(): void {
    if (!this.refreshTime()) return;
    const freeHoles = this.holes.filter((hole) => hole.mouse === null);
    if (freeHoles.length === 0) return;

    const hole = Phaser.Utils.Array.GetRandom(freeHoles);
    const mouse = this.makeMouse(hole.x, hole.y);
    mouse.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: mouse, scale: 1, alpha: 1, duration: ANIMATION.appear, ease: 'Back.out' });

    hole.mouse = mouse;

    // Через MOUSE_VISIBLE_MS мышь прячется сама
    hole.hideTimer = this.time.delayedCall(MOUSE_VISIBLE_MS, () => {
      if (hole.mouse === mouse) this.missMouse(hole);
    });
  }

  private hitMouse(hole: Hole): void {
    if (!this.refreshTime() || hole.mouse === null) return;

    this.score += HIT_POINTS;
    this.scoreText.setText(String(this.score));
    this.feedback(hole.x, hole.y, `+${HIT_POINTS}`, COLORS.buttonPressed);
    this.clearMouse(hole, true);
  }

  private missMouse(hole: Hole): void {
    if (!this.refreshTime() || hole.mouse === null) return;

    this.lives = Math.max(0, this.lives - MISS_LIVES);
    this.drawHearts();
    this.feedback(hole.x, hole.y, '−♥', COLORS.pink);
    // Реакция HUD тоже приостанавливается вместе с игровыми анимациями.
    this.tweens.killTweensOf(this.hud);
    this.hud.setX(0);
    this.tweens.add({ targets: this.hud, x: 4, duration: 30, yoyo: true, repeat: 1 });
    const lostHeart = this.hearts[this.lives];
    if (lostHeart) {
      this.tweens.killTweensOf(lostHeart);
      lostHeart.setScale(1);
      this.tweens.add({ targets: lostHeart, scale: 1.5, duration: 110, yoyo: true });
    }
    this.clearMouse(hole);

    if (this.lives <= 0) this.endGame();
  }

  private clearMouse(hole: Hole, hit = false): void {
    hole.hideTimer?.remove();
    hole.hideTimer = undefined;
    const mouse = hole.mouse;
    hole.mouse = null; // сразу помечаем нору свободной — повторное попадание не засчитается
    if (!mouse) return;
    this.tweens.killTweensOf(mouse);

    this.tweens.add({
      targets: mouse,
      scale: hit ? 1.18 : 0.2,
      alpha: 0,
      angle: hit ? 12 : 0,
      duration: ANIMATION.hide,
      onComplete: () => mouse.destroy(),
    });
  }

  private endGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'gameover';

    this.spawnTimer?.remove();
    this.spawnTimer = undefined;

    // Убираем оставшихся мышей
    for (const hole of this.holes) this.clearMouse(hole);

    this.showGameOver();
  }

  // ===== Экраны =====

  private createOverlay(): { w: number; top: number } {
    const w = this.layoutWidth, h = this.layoutHeight;
    const cardWidth = Math.min(560, w - 32), top = (h - 530) / 2;
    const fit = Math.min(1, (h - 24) / 530);
    this.uiLayer = this.add.container(w * (1 - fit) / 2, h * (1 - fit) / 2)
      .setScale(fit).setDepth(30);
    this.uiLayer.add(this.add.rectangle(w / 2, h / 2, w * 3, h * 3, COLORS.ground, 0.87));
    this.uiLayer.add(this.panel((w - cardWidth) / 2, top, cardWidth, 530, 32));
    return { w, top };
  }

  private showMenu(): void {
    const { w, top } = this.createOverlay();
    this.uiLayer.add(this.makeMouse(w / 2, top + 92));
    this.uiLayer.add(this.makeText(w / 2, top + 162, 'Бей мышей', 44, COLORS.ink, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 209, 'Маленькая игра в большом саду', 20, COLORS.muted, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 276,
      'Нажимай на мышек,\nпока они не спрятались!', 24, COLORS.ink, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 342,
      `Попадание: +${HIT_POINTS} · Пропуск: −${MISS_LIVES} жизнь\n${START_LIVES} жизней · ${GAME_DURATION_MS / 1000} секунд`,
      20, COLORS.muted, 0.5, 0.5));
    this.uiLayer.add(this.createButton(w / 2, top + 435, 'Играть', () => this.startGame()));
    this.uiLayer.add(this.makeText(w / 2, top + 496, 'Мышь / касание · P или Esc — пауза', 17, COLORS.muted, 0.5, 0.5));
  }

  private showPause(): void {
    const { w, top } = this.createOverlay();
    this.uiLayer.add(this.makeText(w / 2, top + 155, 'ПАУЗА', 44, COLORS.ink, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 235,
      'Мышки отдыхают.\nВремя, жизни и счёт сохранены.', 23, COLORS.muted, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 325,
      `Счёт: ${this.score} · Жизни: ${this.lives}`, 24, COLORS.ink, 0.5, 0.5));
    this.uiLayer.add(this.createButton(w / 2, top + 435, 'Продолжить', () => this.resumeGame()));
    this.uiLayer.add(this.makeText(w / 2, top + 496, 'P или Esc — продолжить', 18, COLORS.muted, 0.5, 0.5));
  }

  private showGameOver(): void {
    const { w, top } = this.createOverlay();
    this.uiLayer.add(this.makeMouse(w / 2, top + 92));
    this.uiLayer.add(this.makeText(w / 2, top + 170, 'Игра окончена', 38, COLORS.ink, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 226,
      this.lives === 0 ? 'Мышки оказались проворнее!' : 'Время вышло — хороший улов!',
      21, COLORS.muted, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 288, 'ТВОЙ СЧЁТ', 18, COLORS.muted, 0.5, 0.5));
    this.uiLayer.add(this.makeText(w / 2, top + 348, String(this.score), 64, COLORS.buttonPressed, 0.5, 0.5));
    this.uiLayer.add(this.createButton(w / 2, top + 435, 'Заново',
      () => this.scene.restart({ startImmediately: true })));
    this.uiLayer.add(this.makeText(w / 2, top + 496, 'Ещё одна прогулка по саду?', 18, COLORS.muted, 0.5, 0.5));
  }

  private makeMouse(x: number, y: number): Phaser.GameObjects.Container {
    const mouse = this.add.container(x, y);
    mouse.add(this.add.ellipse(0, 18, 90, 27, COLORS.holeInner).setAlpha(0.18));
    mouse.add(this.add.circle(-29, -30, 22, COLORS.mouseBody).setStrokeStyle(2, 0xa59585));
    mouse.add(this.add.circle(29, -30, 22, COLORS.mouseBody).setStrokeStyle(2, 0xa59585));
    mouse.add(this.add.circle(-29, -30, 14, COLORS.mouseEar));
    mouse.add(this.add.circle(29, -30, 14, COLORS.mouseEar));
    mouse.add(this.add.ellipse(0, -4, 80, 76, COLORS.mouseBody).setStrokeStyle(2, 0xa59585));
    mouse.add(this.add.ellipse(0, 12, 52, 32, COLORS.cream));
    mouse.add(this.add.circle(-14, -12, 6, COLORS.mouseEye));
    mouse.add(this.add.circle(14, -12, 6, COLORS.mouseEye));
    mouse.add(this.add.circle(-16, -14, 2, 0xffffff));
    mouse.add(this.add.circle(12, -14, 2, 0xffffff));
    mouse.add(this.add.ellipse(-25, 4, 13, 7, COLORS.mouseEar));
    mouse.add(this.add.ellipse(25, 4, 13, 7, COLORS.mouseEar));
    mouse.add(this.add.ellipse(0, 5, 13, 10, COLORS.pink));
    const whiskers = this.add.graphics().lineStyle(2, COLORS.muted, 0.7);
    whiskers.lineBetween(-18, 8, -42, 3).lineBetween(-18, 13, -43, 16);
    whiskers.lineBetween(18, 8, 42, 3).lineBetween(18, 13, 43, 16);
    whiskers.lineBetween(0, 10, 0, 17).lineBetween(-5, 17, 5, 17);
    mouse.add(whiskers);
    mouse.add(this.add.ellipse(-24, 28, 20, 12, COLORS.cream));
    mouse.add(this.add.ellipse(24, 28, 20, 12, COLORS.cream));
    return mouse;
  }

  private createButton(x: number, y: number, label: string,
    onClick: () => void): Phaser.GameObjects.Container {
    const button = this.add.container(x, y);
    const background = this.panel(-145, -36, 290, 72, 23, COLORS.button);
    const text = this.makeText(0, 0, label, 28, COLORS.cream, 0.5, 0.5);
    const target = this.add.zone(0, 0, 290, 72).setInteractive({ useHandCursor: true });
    let pressed = false;
    const paint = (color: number, scale: number) => {
      background.clear().fillStyle(COLORS.buttonPressed).fillRoundedRect(-145, -31, 290, 72, 23);
      background.fillStyle(color).fillRoundedRect(-145, -36, 290, 72, 23);
      this.tweens.killTweensOf(button);
      this.tweens.add({ targets: button, scale, duration: ANIMATION.button });
    };
    target.on('pointerover', () => paint(COLORS.buttonHover, 1.03));
    target.on('pointerout', () => { pressed = false; paint(COLORS.button, 1); });
    target.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number,
      event: Phaser.Types.Input.EventData) => {
      event.stopPropagation(); pressed = true; paint(COLORS.buttonPressed, 0.97);
    });
    target.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number,
      event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (pressed) { pressed = false; onClick(); }
    });
    button.add([background, text, target]);
    return button;
  }

  private makeText(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string | number,
    originX = 0,
    originY = 0,
  ): Phaser.GameObjects.Text {
    // Число (например, 0xfacc15) превращаем в строку вида '#facc15'
    const colorString = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;

    return this.add
      .text(x, y, text, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        align: 'center',
        lineSpacing: 6,
        fontSize: `${size}px`,
        color: colorString,
      })
      .setOrigin(originX, originY);
  }
}
