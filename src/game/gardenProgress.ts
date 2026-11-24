import { GARDEN_REWARDS } from './settings';

export type GardenReward = typeof GARDEN_REWARDS[number];
export type GardenRewardId = GardenReward['id'];

export function gardenProgress(total: number, unlocked: readonly GardenRewardId[]) {
  const rewards = [...GARDEN_REWARDS].sort((a, b) => a.threshold - b.threshold);
  const nextIndex = rewards.findIndex(reward => !unlocked.includes(reward.id));
  const next = rewards[nextIndex];
  if (!next) return { next: undefined, remaining: 0, fraction: 1 };
  const previous = rewards[nextIndex - 1]?.threshold ?? 0;
  const span = next.threshold - previous;
  const remaining = Math.max(0, next.threshold - total);
  const fraction = span > 0 ? Math.max(0, Math.min(1, (total - previous) / span)) : Number(remaining === 0);
  return { next, remaining, fraction };
}
