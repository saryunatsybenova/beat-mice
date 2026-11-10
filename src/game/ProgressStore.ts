const STORAGE_KEY = 'whack-a-mouse.progress';
const FORMAT_VERSION = 1;

export interface PlayerProgress {
  bestScore: number;
  totalPoints: number;
  hasBestScore: boolean;
}

interface StoredProgress extends PlayerProgress {
  version: typeof FORMAT_VERSION;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    Number.isInteger(value) && value >= 0;
}

function isStoredProgress(value: unknown): value is StoredProgress {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return data.version === FORMAT_VERSION &&
    isNonNegativeInteger(data.bestScore) &&
    isNonNegativeInteger(data.totalPoints) &&
    typeof data.hasBestScore === 'boolean';
}

/** Persistent player progress with an in-memory fallback when browser storage is unavailable. */
export class ProgressStore {
  private progress: PlayerProgress = { bestScore: 0, totalPoints: 0, hasBestScore: false };
  private storageAvailable = true;

  constructor() {
    let saved: string | null;
    try {
      saved = globalThis.localStorage.getItem(STORAGE_KEY);
    } catch {
      this.storageAvailable = false;
      return;
    }

    if (saved === null) return;

    let data: unknown;
    try {
      data = JSON.parse(saved);
    } catch {
      this.save();
      return;
    }

    if (isStoredProgress(data)) {
      this.progress = {
        bestScore: data.bestScore,
        totalPoints: data.totalPoints,
        hasBestScore: data.hasBestScore,
      };
    } else {
      this.save();
    }
  }

  get snapshot(): Readonly<PlayerProgress> {
    return { ...this.progress };
  }

  recordScore(score: number): void {
    if (this.progress.hasBestScore && score <= this.progress.bestScore) return;

    this.progress.bestScore = score;
    this.progress.hasBestScore = true;
    this.save();
  }

  addCompletedGame(score: number): void {
    this.progress.totalPoints += score;
    this.save();
  }

  private save(): void {
    if (!this.storageAvailable) return;
    const data: StoredProgress = { ...this.progress, version: FORMAT_VERSION };
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      this.storageAvailable = false;
    }
  }
}
