import { BALANCE } from './settings';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

/** Состояние и правила партии. Не зависит от Phaser и не рисует интерфейс. */
export class GameState {
  phase: GamePhase = 'menu';
  gameStage: 1 | 2 = 1;
  score = 0;
  lives: number = BALANCE.startLives;
  remainingMs: number = BALANCE.durationMs;
  private deadline = 0;

  get spawnIntervalMs(): number { return BALANCE.phases[this.gameStage].spawnIntervalMs; }
  get mouseVisibleMs(): number { return BALANCE.phases[this.gameStage].mouseVisibleMs; }

  reset(): void {
    this.phase = 'menu';
    this.gameStage = 1;
    this.score = 0;
    this.lives = BALANCE.startLives;
    this.remainingMs = BALANCE.durationMs;
    this.deadline = 0;
  }

  start(now: number): void {
    if (this.phase !== 'menu') return;
    this.phase = 'playing';
    this.deadline = now + this.remainingMs;
  }

  updateTime(now: number): boolean {
    if (this.phase !== 'playing') return false;
    this.remainingMs = Math.max(0, this.deadline - now);
    return this.remainingMs > 0;
  }

  pause(): void {
    if (this.phase === 'playing') this.phase = 'paused';
  }

  resume(now: number): void {
    if (this.phase !== 'paused') return;
    this.deadline = now + this.remainingMs;
    this.phase = 'playing';
  }

  /** Возвращает true только при первом переходе в фазу 2. */
  hit(): boolean {
    if (this.phase !== 'playing') return false;
    this.score += BALANCE.hitPoints;
    if (this.gameStage === 1 && this.score >= BALANCE.phase2Score) {
      this.gameStage = 2;
      return true;
    }
    return false;
  }

  miss(): void {
    if (this.phase === 'playing') this.lives = Math.max(0, this.lives - BALANCE.missLives);
  }

  end(): void {
    if (this.phase === 'playing') this.phase = 'gameover';
  }
}
