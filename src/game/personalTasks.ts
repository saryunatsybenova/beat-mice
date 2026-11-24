import { MOUSE_LOOKS, PERSONAL_TASKS } from './settings';

export type MouseLook = keyof typeof MOUSE_LOOKS;
export type PersonalTask = typeof PERSONAL_TASKS[number];
export type TaskId = PersonalTask['id'];
type CountedAction = Exclude<PersonalTask['metric'], 'streak' | 'score'>;
type TaskResult = { id: TaskId; amount: number };

export interface CollectionProgress {
  activeTask: TaskId | null;
  taskProgress: number;
  completedTasks: readonly TaskId[];
  unlockedLooks: readonly MouseLook[];
  selectedLook: MouseLook;
}

export function isCumulative(task: PersonalTask): boolean {
  return task.metric !== 'streak' && task.metric !== 'score';
}

export function readCollection(data: Record<string, unknown> = {}): CollectionProgress {
  const ids: unknown[] = Array.isArray(data.completedTasks) ? data.completedTasks : [];
  const completed = PERSONAL_TASKS.filter(({ id }) => ids.includes(id));
  const active = PERSONAL_TASKS.find(task => !completed.includes(task));
  const looks: unknown[] = Array.isArray(data.unlockedLooks) ? data.unlockedLooks : [];
  const unlockedLooks = (Object.keys(MOUSE_LOOKS) as MouseLook[]).filter(look =>
    look === 'standard' || looks.includes(look) || completed.some(task => task.reward === look));
  const selectedLook = unlockedLooks.find(look => look === data.selectedLook) ?? 'standard';
  const amount = data.taskProgress;
  const taskProgress = active && active.id === data.activeTask && isCumulative(active) &&
    typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount < active.goal ? amount : 0;
  return { activeTask: active?.id ?? null, taskProgress, completedTasks: completed.map(({ id }) => id),
    unlockedLooks, selectedLook };
}

/** Привязывает действия к заданию, назначенному на момент старта партии. */
export class PartyTask {
  private amount = 0;
  private finished = false;

  constructor(readonly task: PersonalTask | undefined, private readonly confirmed: number) {}

  count(action: CountedAction): void {
    if (!this.finished && this.task?.metric === action) this.amount++;
  }

  preview(score: number, bestStreak: number): number {
    if (!this.task) return 0;
    const { metric, goal } = this.task;
    const value = metric === 'score' ? score : metric === 'streak' ? bestStreak : this.confirmed + this.amount;
    return Math.min(goal, value);
  }

  finish(score: number, bestStreak: number): TaskResult | undefined {
    if (this.finished || !this.task) return;
    this.finished = true;
    const amount = this.task.metric === 'score' ? score : this.task.metric === 'streak' ? bestStreak : this.amount;
    return { id: this.task.id, amount };
  }
}
