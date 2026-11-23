import { BALANCE } from './settings';

export type GamePhase = 'menu' | 'playing' | 'transition' | 'paused' | 'gameover';
export type GameStage = 1 | 2 | 3 | 4;
export type TransitionStage = Exclude<GameStage, 1>;

/** Состояние и правила партии. Не зависит от Phaser и не рисует интерфейс. */
export class GameState {
  phase: GamePhase = 'menu';
  gameStage: GameStage = 1;
  score = 0;
  streak = 0;
  bestStreak = 0;
  lives: number = BALANCE.startLives;
  private shieldCharges = 0;
  private pausedPhase: 'playing' | 'transition' = 'playing';

  get spawnIntervalMs(): number { return BALANCE.phases[this.gameStage === 1 ? 1 : 2].spawnIntervalMs; }
  get mouseVisibleMs(): number { return BALANCE.phases[this.gameStage === 1 ? 1 : 2].mouseVisibleMs; }
  get scoreMultiplier(): number {
    return this.gameStage >= 2 && this.streak >= BALANCE.streakThreshold ? BALANCE.streakMultiplier : 1;
  }
  get hasShield(): boolean { return this.shieldCharges > 0; }

  reset(): void {
    this.phase = 'menu';
    this.gameStage = 1;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lives = BALANCE.startLives;
    this.clearShield();
    this.pausedPhase = 'playing';
  }

  start(): void {
    if (this.phase !== 'menu') return;
    this.phase = 'playing';
  }

  pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'transition') return;
    this.pausedPhase = this.phase;
    this.phase = 'paused';
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = this.pausedPhase;
  }

  finishPhaseTransition(): { nextStage?: TransitionStage } | undefined {
    if (this.phase !== 'transition') return;
    const nextStage = this.advanceStage();
    if (!nextStage) this.phase = 'playing';
    return { nextStage };
  }

  get isTransitioning(): boolean {
    return this.phase === 'transition' || (this.phase === 'paused' && this.pausedPhase === 'transition');
  }

  hit(basePoints: number = BALANCE.hitPoints): { points: number; enteredPhase?: TransitionStage } | undefined {
    if (this.phase !== 'playing') return;
    const points = basePoints * this.scoreMultiplier;
    this.score += points;
    if (this.gameStage >= 2) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    }
    const enteredPhase = this.advanceStage();
    if (enteredPhase) this.phase = 'transition';
    return { points, enteredPhase };
  }

  private advanceStage(): TransitionStage | undefined {
    if (this.gameStage === 1 && this.score >= BALANCE.phase2Score) return (this.gameStage = 2);
    if (this.gameStage === 2 && this.score >= BALANCE.phase3Score) return (this.gameStage = 3);
    if (this.gameStage === 3 && this.score >= BALANCE.phase4Score) return (this.gameStage = 4);
  }

  activateShield(): boolean {
    if (this.phase !== 'playing' || this.hasShield) return false;
    this.shieldCharges = BALANCE.shieldCharges;
    return true;
  }

  clearShield(): void { this.shieldCharges = 0; }

  applyMistake(losesLife: boolean): { protected: boolean; brokeStreak: boolean } | undefined {
    if (this.phase !== 'playing') return;
    if (this.hasShield) {
      this.shieldCharges--;
      return { protected: true, brokeStreak: false };
    }
    if (losesLife) this.lives = Math.max(0, this.lives - BALANCE.missLives);
    const brokeStreak = this.streak > 0;
    this.streak = 0;
    return { protected: false, brokeStreak };
  }

  restoreLife(): boolean {
    if (this.phase !== 'playing' || this.lives >= BALANCE.startLives) return false;
    this.lives++;
    return true;
  }

  end(): boolean {
    if (this.phase !== 'playing' || this.lives !== 0) return false;
    this.phase = 'gameover';
    this.clearShield();
    return true;
  }
}
