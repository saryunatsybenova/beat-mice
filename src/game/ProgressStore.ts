import { GARDEN_REWARDS } from './settings';
import type { GardenRewardId } from './gardenProgress';

const STORAGE_KEY = 'whack-a-mouse.progress';
const FORMAT_VERSION = 2;

export interface PlayerProgress {
  bestScore: number;
  totalPoints: number;
  hasBestScore: boolean;
  unlockedRewards: readonly GardenRewardId[];
  hiddenRewards: readonly GardenRewardId[];
}

interface StoredProgress extends PlayerProgress {
  version: typeof FORMAT_VERSION;
  pendingGardenNotice: readonly GardenRewardId[];
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    Number.isInteger(value) && value >= 0;
}

function readRewards(value: unknown): GardenRewardId[] {
  return Array.isArray(value) ? GARDEN_REWARDS.map(({ id }) => id).filter(id => value.includes(id)) : [];
}

/** Persistent player progress with an in-memory fallback when browser storage is unavailable. */
export class ProgressStore {
  private progress: PlayerProgress = {
    bestScore: 0, totalPoints: 0, hasBestScore: false, unlockedRewards: [], hiddenRewards: [],
  };
  private pendingGardenNotice: GardenRewardId[] = [];
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

    if (typeof data !== 'object' || data === null) {
      this.save();
      return;
    }
    const stored = data as Record<string, unknown>;
    if (stored.version !== 1 && stored.version !== FORMAT_VERSION) {
      // Не перезаписываем сохранение более новой версии.
      this.storageAvailable = false;
      return;
    }
    const bestScore = isNonNegativeInteger(stored.bestScore) ? stored.bestScore : 0;
    const unlockedRewards = readRewards(stored.unlockedRewards);
    this.progress = {
      bestScore,
      totalPoints: isNonNegativeInteger(stored.totalPoints) ? stored.totalPoints : 0,
      hasBestScore: typeof stored.hasBestScore === 'boolean' ? stored.hasBestScore : bestScore > 0,
      unlockedRewards,
      hiddenRewards: readRewards(stored.hiddenRewards).filter(id => unlockedRewards.includes(id)),
    };
    const repaired = this.unlockEarnedRewards();
    this.pendingGardenNotice = [
      ...new Set([...readRewards(stored.pendingGardenNotice), ...repaired]),
    ].filter(id => this.progress.unlockedRewards.includes(id));
    this.save();
  }

  get snapshot(): Readonly<PlayerProgress> {
    return { ...this.progress, unlockedRewards: [...this.progress.unlockedRewards], hiddenRewards: [...this.progress.hiddenRewards] };
  }

  recordScore(score: number): void {
    if (this.progress.hasBestScore && score <= this.progress.bestScore) return;

    this.progress.bestScore = score;
    this.progress.hasBestScore = true;
    this.save();
  }

  addCompletedGame(score: number): GardenRewardId[] {
    this.progress.totalPoints += score;
    const opened = this.unlockEarnedRewards();
    this.save();
    return opened;
  }

  setRewardVisible(id: GardenRewardId, visible: boolean): void {
    if (!this.progress.unlockedRewards.includes(id)) return;
    this.progress.hiddenRewards = visible
      ? this.progress.hiddenRewards.filter(hidden => hidden !== id)
      : [...new Set([...this.progress.hiddenRewards, id])];
    this.save();
  }

  takeGardenNotice(): GardenRewardId[] {
    const notice = this.pendingGardenNotice;
    if (notice.length) {
      this.pendingGardenNotice = [];
      this.save();
    }
    return notice;
  }

  private unlockEarnedRewards(): GardenRewardId[] {
    const earned = GARDEN_REWARDS
      .filter(reward => reward.threshold <= this.progress.totalPoints && !this.progress.unlockedRewards.includes(reward.id))
      .map(reward => reward.id);
    this.progress.unlockedRewards = [...this.progress.unlockedRewards, ...earned];
    return earned;
  }

  private save(): void {
    if (!this.storageAvailable) return;
    const data: StoredProgress = { ...this.progress, version: FORMAT_VERSION, pendingGardenNotice: this.pendingGardenNotice };
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      this.storageAvailable = false;
    }
  }
}
