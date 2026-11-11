import Phaser from 'phaser';
import { GameState } from './GameState';
import { MouseField, type Hole } from './MouseField';
import { GameUI } from './ui/GameUI';
import { BALANCE } from './settings';
import { COLORS } from './theme';
import { ProgressStore } from './ProgressStore';
import type { MouseType } from './visuals';

/** Связывает правила, поле и интерфейс; здесь остаются ввод и жизненный цикл Phaser. */
export class GameScene extends Phaser.Scene {
  private readonly state = new GameState();
  private readonly progress = new ProgressStore();
  private field!: MouseField;
  private ui!: GameUI;
  private pausedTweens: Phaser.Tweens.Tween[] = [];
  private phaseTransitionTimer?: Phaser.Time.TimerEvent;
  private phaseAudio?: AudioContext;
  private bestScoreAtGameStart = 0;
  private hadRecordAtGameStart = false;
  private showedRecordNotification = false;

  constructor() { super('GameScene'); }

  create(data: { startImmediately?: boolean } = {}): void {
    this.state.reset();
    this.time.paused = false;
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.pausedTweens = [];
    this.field = new MouseField(this);
    this.ui = new GameUI(this, this.state, {
      start: () => this.startGame(),
      resume: () => this.resumeGame(),
      restart: () => this.scene.restart({ startImmediately: true }),
    }, () => this.progress.snapshot);
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
    if (this.state.phase !== 'playing' && this.state.phase !== 'transition' &&
      this.state.phase !== 'paused') return;
    event.preventDefault();
    if (this.state.phase === 'playing' || this.state.phase === 'transition') this.pauseGame();
    else this.resumeGame();
  }

  private startGame(): void {
    if (this.state.phase !== 'menu') return;
    const progress = this.progress.snapshot;
    this.bestScoreAtGameStart = progress.bestScore;
    this.hadRecordAtGameStart = progress.hasBestScore;
    this.showedRecordNotification = false;
    this.field.setStage(1);
    this.state.start(performance.now());
    this.ui.start();
    this.scheduleSpawns();
    this.spawnMouse();
  }

  private pauseGame(): void {
    const phase = this.state.phase;
    if (phase === 'playing' && !this.refreshTime()) return;
    if (phase !== 'playing' && phase !== 'transition') return;
    this.state.pause(performance.now());
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
    const type: MouseType = this.state.gameStage === 2 && !this.field.hasDecoyMouse &&
      Math.random() < BALANCE.falseMouseChance ? 'decoy' : 'normal';
    this.field.spawnMouse(this.state.mouseVisibleMs, hole => this.missMouse(hole), type);
  }

  private hitMouse(hole: Hole): void {
    if (!this.refreshTime() || hole.mouse === null) return;
    if (hole.mouseType === 'decoy') {
      this.state.miss();
      this.ui.showMiss();
      this.ui.showDecoyWarning();
      this.ui.feedback(hole.x, hole.y, '−♥', COLORS.pink);
      this.field.clearMouse(hole, true);
      if (this.state.lives <= 0) this.endGame();
      return;
    }

    const enteredPhase2 = this.state.hit();
    this.progress.recordScore(this.state.score);
    const newRecord = this.hadRecordAtGameStart && !this.showedRecordNotification &&
      this.state.score > this.bestScoreAtGameStart;
    if (newRecord) this.showedRecordNotification = true;
    this.ui.updateScore(newRecord);
    this.ui.feedback(hole.x, hole.y, `+${BALANCE.hitPoints}`, COLORS.buttonPressed);
    this.field.clearMouse(hole, true);
    if (enteredPhase2) {
      this.startPhase2Transition();
    }
  }

  private startPhase2Transition(): void {
    if (!this.state.beginPhaseTransition(performance.now(), BALANCE.phaseTransitionMs)) return;
    this.field.clearAll();
    this.field.setStage(2);
    this.field.shake(BALANCE.phaseShakeMs, BALANCE.phaseShakeAmplitude);
    this.ui.showPhase2();
    this.ui.showPhaseTransition();
    this.playPhaseSignal();
    this.phaseTransitionTimer = this.time.delayedCall(BALANCE.phaseTransitionMs, () => {
      if (!this.state.finishPhaseTransition()) return;
      this.phaseTransitionTimer = undefined;
      this.ui.hidePhaseTransition();
      this.scheduleSpawns();
      this.spawnMouse();
    });
  }

  private playPhaseSignal(): void {
    if (typeof AudioContext === 'undefined') return;
    try {
      const context = this.phaseAudio ?? new AudioContext();
      this.phaseAudio = context;
      const play = () => {
        if (context.state === 'closed') return;
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(460, now);
        oscillator.frequency.linearRampToValueAtTime(680, now + BALANCE.phaseSignalMs / 2_000);
        volume.gain.setValueAtTime(0.0001, now);
        volume.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, now + BALANCE.phaseSignalMs / 1_000);
        oscillator.connect(volume);
        volume.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + BALANCE.phaseSignalMs / 1_000);
      };
      if (context.state === 'suspended') {
        void context.resume().then(play).catch(() => undefined);
      } else {
        play();
      }
    } catch {
      this.phaseAudio = undefined;
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
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.ui.hidePhaseTransition();
    this.state.end();
    this.progress.addCompletedGame(this.state.score);
    this.field.clearAll();
    this.ui.showGameOver();
  }

  private cleanup(): void {
    this.phaseTransitionTimer?.remove();
    this.phaseTransitionTimer = undefined;
    this.phaseAudio?.close().catch(() => undefined);
    this.phaseAudio = undefined;
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.off('keydown', this.handlePauseKey, this);
    this.scale.off('resize', this.layout, this);
    this.time.paused = false;
    this.pausedTweens = [];
    this.field.dispose();
    this.ui.dispose();
  }
}
