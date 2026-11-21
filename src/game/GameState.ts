import { BALANCE } from './settings';

export type GamePhase = 'menu' | 'playing' | 'transition' | 'paused' | 'gameover';

/** Состояние и правила партии. Не зависит от Phaser и не рисует интерфейс. */
export class GameState {
  phase: GamePhase = 'menu';
  gameStage: 1 | 2 | 3 = 1;
  score = 0;
  streak = 0;
  bestStreak = 0;
  lives: number = BALANCE.startLives;
  remainingMs: number = BALANCE.durationMs;
  private deadline = 0;
  private pausedPhase: 'playing' | 'transition' = 'playing';
  private pausedAt = 0;

  get spawnIntervalMs(): number { return BALANCE.phases[this.gameStage === 3 ? 2 : this.gameStage].spawnIntervalMs; }
  get mouseVisibleMs(): number { return BALANCE.phases[this.gameStage === 3 ? 2 : this.gameStage].mouseVisibleMs; }
  get scoreMultiplier(): number {
    return this.gameStage >= 2 && this.streak >= BALANCE.streakThreshold ? BALANCE.streakMultiplier : 1;
  }

  reset(): void {
    this.phase = 'menu';
    this.gameStage = 1;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lives = BALANCE.startLives;
    this.remainingMs = BALANCE.durationMs;
    this.deadline = 0;
    this.pausedPhase = 'playing';
    this.pausedAt = 0;
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

  pause(now: number): void {
    if (this.phase !== 'playing' && this.phase !== 'transition') return;
    this.pausedPhase = this.phase;
    if (this.phase === 'playing') this.updateTime(now);
    else this.pausedAt = now;
    this.phase = 'paused';
  }

  resume(now: number): void {
    if (this.phase !== 'paused') return;
    if (this.pausedPhase === 'transition') {
      this.deadline += now - this.pausedAt;
      this.phase = 'transition';
    } else {
      this.deadline = now + this.remainingMs;
      this.phase = 'playing';
    }
  }

  beginPhaseTransition(now: number, durationMs: number): boolean {
    if (this.phase !== 'playing' || this.gameStage === 1) return false;
    this.deadline = Math.max(this.deadline, now) + durationMs;
    this.phase = 'transition';
    return true;
  }

  finishPhaseTransition(): boolean {
    if (this.phase !== 'transition') return false;
    this.phase = 'playing';
    return true;
  }

  get isTransitioning(): boolean {
    return this.phase === 'transition' || (this.phase === 'paused' && this.pausedPhase === 'transition');
  }

  hit(basePoints: number = BALANCE.hitPoints): { points: number; enteredPhase?: 2 | 3 } | undefined {
    if (this.phase !== 'playing') return;
    const points = basePoints * this.scoreMultiplier;
    this.score += points;
    if (this.gameStage >= 2) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    }
    if (this.gameStage === 1 && this.score >= BALANCE.phase2Score) {
      this.gameStage = 2;
      return { points, enteredPhase: 2 };
    }
    if (this.gameStage === 2 && this.score >= BALANCE.phase3Score) {
      this.gameStage = 3;
      return { points, enteredPhase: 3 };
    }
    return { points };
  }

  miss(): boolean {
    if (this.phase !== 'playing') return false;
    this.lives = Math.max(0, this.lives - BALANCE.missLives);
    return this.breakStreak();
  }

  breakStreak(): boolean {
    if (this.phase !== 'playing' || this.streak === 0) return false;
    this.streak = 0;
    return true;
  }

  restoreLife(): boolean {
    if (this.phase !== 'playing' || this.lives >= BALANCE.startLives) return false;
    this.lives++;
    return true;
  }

  end(): void {
    if (this.phase === 'playing') this.phase = 'gameover';
  }
}
