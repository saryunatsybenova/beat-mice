import type { GameState } from './GameState';
import { gardenProgress } from './gardenProgress';
import { isCumulative, type PartyTask } from './personalTasks';
import type { ProgressStore } from './ProgressStore';
import { PERSONAL_TASKS } from './settings';

export function finishRound(state: GameState, progress: ProgressStore, party: PartyTask | undefined,
  recordAtStart: number | undefined) {
  if (!state.end()) return;

  const { score, gameStage, bestStreak } = state;
  const stats = state.roundStats;
  const { gardenRewards, completedTask } = progress.addCompletedGame(score, party, bestStreak);
  const saved = progress.snapshot;
  const task = PERSONAL_TASKS.find(({ id }) => id === saved.activeTask);
  const presses = stats.successfulPresses + stats.mistakenPresses;
  return {
    score, gameStage, bestStreak, ...stats,
    accuracy: presses ? Math.round(stats.successfulPresses / presses * 100) : undefined,
    bestScore: saved.bestScore,
    newRecord: recordAtStart !== undefined && score > recordAtStart,
    totalPoints: saved.totalPoints,
    canSave: progress.canSave,
    gardenRewards, completedTask,
    garden: gardenProgress(saved.totalPoints, saved.unlockedRewards),
    task: task && {
      title: task.title, goal: task.goal,
      amount: isCumulative(task) ? saved.taskProgress : party?.task?.id === task.id ? party.preview(score, bestStreak) : 0,
      cumulative: isCumulative(task),
    },
  };
}

export type RoundResult = NonNullable<ReturnType<typeof finishRound>>;
