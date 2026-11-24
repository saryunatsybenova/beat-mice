import { BALANCE } from './settings';

export type GamePhase = 'menu' | 'playing' | 'transition' | 'paused' | 'gameover';
export type GameStage = keyof typeof BALANCE.phaseScores;
export type TransitionStage = Exclude<GameStage, 1>;

/** Состояние и правила партии. Не зависит от Phaser и не рисует интерфейс. */
export class GameState {
  phase: GamePhase = 'menu';
  gameStage: GameStage = 1;
  score = 0;
  streak = 0;
  bestStreak = 0;
  private caughtMice = 0;
  private successfulPresses = 0;
  private mistakenPresses = 0;
  lives: number = BALANCE.startLives;
  private shieldCharges = 0;
  private coinActive = false;
  private healingAvailableAt = 0;
  private pausedPhase: 'playing' | 'transition' = 'playing';

  get spawnIntervalMs(): number {
    const base = BALANCE.phases[this.gameStage === 1 ? 1 : 2].spawnIntervalMs;
    return this.gameStage === 5 ? base * BALANCE.phase5SpawnMultiplier : base;
  }
  get mouseVisibleMs(): number { return BALANCE.phases[this.gameStage === 1 ? 1 : 2].mouseVisibleMs; }
  get scoreMultiplier(): number {
    return this.gameStage >= 2 && this.streak >= BALANCE.streakThreshold ? BALANCE.streakMultiplier : 1;
  }
  get hasShield(): boolean { return this.shieldCharges > 0; }
  get hasCoinBonus(): boolean { return this.coinActive; }
  get roundStats() {
    return { caughtMice: this.caughtMice, successfulPresses: this.successfulPresses, mistakenPresses: this.mistakenPresses };
  }

  reset(): void {
    this.phase = 'menu';
    this.gameStage = 1;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.caughtMice = 0;
    this.successfulPresses = 0;
    this.mistakenPresses = 0;
    this.lives = BALANCE.startLives;
    this.clearShield();
    this.clearCoinBonus();
    this.healingAvailableAt = 0;
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

  hit(basePoints: number = BALANCE.hitPoints):
    { points: number; coinBonus: number; enteredPhase?: TransitionStage } | undefined {
    if (this.phase !== 'playing' || this.lives === 0) return;
    this.successfulPresses++;
    this.caughtMice++;
    const coinBonus = this.coinActive ? BALANCE.cheeseCoinBonus : 0;
    const points = basePoints * this.scoreMultiplier + coinBonus;
    this.clearCoinBonus();
    this.score += points;
    if (this.gameStage >= 2) {
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    }
    const enteredPhase = this.advanceStage();
    if (enteredPhase) this.phase = 'transition';
    return { points, coinBonus, enteredPhase };
  }

  registerHelmetHit(): void {
    if (this.phase === 'playing' && this.lives > 0) this.successfulPresses++;
  }

  private advanceStage(): TransitionStage | undefined {
    if (this.gameStage === 5) return;
    const next = (this.gameStage + 1) as TransitionStage;
    if (this.score >= BALANCE.phaseScores[next]) return (this.gameStage = next);
  }

  activateShield(): boolean {
    if (this.phase !== 'playing' || this.hasShield) return false;
    this.shieldCharges = BALANCE.shieldCharges;
    return true;
  }

  clearShield(): void { this.shieldCharges = 0; }

  activateCoinBonus(): void {
    if (this.phase === 'playing') this.coinActive = true;
  }

  clearCoinBonus(): void { this.coinActive = false; }

  applyMistake(losesLife: boolean, pressed = !losesLife): { protected: boolean; brokeStreak: boolean } | undefined {
    if (this.phase !== 'playing' || this.lives === 0) return;
    if (pressed) this.mistakenPresses++;
    if (this.hasShield) {
      this.shieldCharges--;
      return { protected: true, brokeStreak: false };
    }
    if (losesLife) this.lives = Math.max(0, this.lives - BALANCE.missLives);
    const brokeStreak = this.streak > 0;
    this.streak = 0;
    return { protected: false, brokeStreak };
  }

  canOfferHealing(mouseAppearances: number): boolean {
    return this.lives < BALANCE.startLives && mouseAppearances >= this.healingAvailableAt;
  }

  restoreLife(mouseAppearances: number, amount = 1): boolean {
    if (this.phase !== 'playing' || this.lives === 0 || this.lives >= BALANCE.startLives || amount <= 0) return false;
    this.lives = Math.min(BALANCE.startLives, this.lives + amount);
    // Перерыв ограничивает новые предложения. Уже активное лечение действует.
    this.healingAvailableAt = mouseAppearances + BALANCE.healingCooldownAppearances;
    return true;
  }

  end(): boolean {
    if (this.phase !== 'playing' || this.lives !== 0) return false;
    this.phase = 'gameover';
    this.clearShield();
    this.clearCoinBonus();
    this.healingAvailableAt = 0;
    return true;
  }
}
