import Phaser from 'phaser';
import { GameState } from './GameState';
import { MouseField, type Hole } from './MouseField';
import { GameUI } from './ui/GameUI';
import { BALANCE } from './settings';
import { COLORS } from './theme';

/** Связывает правила, поле и интерфейс; здесь остаются ввод и жизненный цикл Phaser. */
export class GameScene extends Phaser.Scene {
  private readonly state = new GameState();
  private field!: MouseField;
  private ui!: GameUI;
  private pausedTweens: Phaser.Tweens.Tween[] = [];

  constructor() { super('GameScene'); }

  create(data: { startImmediately?: boolean } = {}): void {
    this.state.reset();
    this.time.paused = false;
    this.pausedTweens = [];
    this.field = new MouseField(this);
    this.ui = new GameUI(this, this.state, {
      start: () => this.startGame(),
      resume: () => this.resumeGame(),
      restart: () => this.scene.restart({ startImmediately: true }),
    });
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.on('keydown', this.handlePauseKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.ui.showMenu();
    if (data.startImmediately) this.startGame();
  }

  update(): void {
    if (this.state.phase === 'playing') this.refreshTime();
  }

  private refreshTime(): boolean {
    if (this.state.phase !== 'playing') return false;
    const alive = this.state.updateTime(performance.now());
    this.ui.updateTime();
    if (!alive) this.endGame();
    return alive;
  }

  private layout(): void {
    const portrait = this.scale.width < this.scale.height;
    const compact = !portrait && this.scale.height < 480;
    const width = portrait ? 480 : compact ? 800 : 960;
    const height = portrait ? 760 : compact ? 500 : 640;
    const zoom = Math.min(this.scale.width / width, this.scale.height / height);
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
    this.field.resize(width, height);
    this.ui.resize(width, height);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.refreshTime()) return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const hole = this.field.findMouse(point.x, point.y);
    if (hole) this.hitMouse(hole);
  }

  private handlePauseKey(event: KeyboardEvent): void {
    if (event.repeat || (event.code !== 'KeyP' && event.code !== 'Escape')) return;
    if (this.state.phase !== 'playing' && this.state.phase !== 'paused') return;
    event.preventDefault();
    if (this.state.phase === 'playing') this.pauseGame();
    else this.resumeGame();
  }

  private startGame(): void {
    if (this.state.phase !== 'menu') return;
    this.state.start(performance.now());
    this.ui.start();
    this.scheduleSpawns();
    this.spawnMouse();
  }

  private pauseGame(): void {
    if (!this.refreshTime()) return;
    this.state.pause();
    this.time.paused = true;
    this.pausedTweens = this.tweens.getTweens().filter(tween => !tween.isPaused());
    this.pausedTweens.forEach(tween => tween.pause());
    this.ui.showPause();
  }

  private resumeGame(): void {
    if (this.state.phase !== 'paused') return;
    this.state.resume(performance.now());
    this.ui.hideOverlay();
    this.time.paused = false;
    this.pausedTweens.forEach(tween => tween.resume());
    this.pausedTweens = [];
  }

  private scheduleSpawns(): void {
    this.field.scheduleSpawns(this.state.spawnIntervalMs, () => this.spawnMouse());
  }

  private spawnMouse(): void {
    if (!this.refreshTime()) return;
    this.field.spawnMouse(this.state.mouseVisibleMs, hole => this.missMouse(hole));
  }

  private hitMouse(hole: Hole): void {
    if (!this.refreshTime() || hole.mouse === null) return;
    const enteredPhase2 = this.state.hit();
    this.ui.updateScore();
    this.ui.feedback(hole.x, hole.y, `+${BALANCE.hitPoints}`, COLORS.buttonPressed);
    this.field.clearMouse(hole, true);
    if (enteredPhase2) {
      this.scheduleSpawns();
      this.ui.showPhase2();
    }
  }

  private missMouse(hole: Hole): void {
    if (!this.refreshTime() || hole.mouse === null) return;
    this.state.miss();
    this.ui.showMiss();
    this.ui.feedback(hole.x, hole.y, '−♥', COLORS.pink);
    this.field.clearMouse(hole);
    if (this.state.lives <= 0) this.endGame();
  }

  private endGame(): void {
    if (this.state.phase !== 'playing') return;
    this.state.end();
    this.field.clearAll();
    this.ui.showGameOver();
  }

  private cleanup(): void {
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.off('keydown', this.handlePauseKey, this);
    this.scale.off('resize', this.layout, this);
    this.time.paused = false;
    this.pausedTweens = [];
    this.field.dispose();
    this.ui.dispose();
  }
}
