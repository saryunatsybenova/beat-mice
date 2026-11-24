import { GARDEN_EVENTS as SETTINGS } from './settings';

const EVENT_TYPES = ['goldRush', 'invasion'] as const;
export type GardenEventType = typeof EVENT_TYPES[number];
export type GardenEvent = { type: GardenEventType } & (
  { status: 'warning' } | { status: 'active'; remaining: number }
);

/** Считает только фактические появления. Время предупреждения ведёт сцена. */
export class GardenEvents {
  private event?: GardenEvent;
  private dueAt?: number;
  private previousType?: GardenEventType;
  private sameInARow = 0;

  constructor(private readonly random = () => Math.random()) {}

  get current(): Readonly<GardenEvent> | undefined { return this.event; }

  startCounting(appearances: number): void {
    this.dueAt = appearances + SETTINGS.firstWaitAppearances;
  }

  prepare(appearances: number): boolean {
    if (this.event || this.dueAt === undefined || appearances < this.dueAt) return false;
    const eligible = this.sameInARow < SETTINGS.maxSameInARow
      ? EVENT_TYPES : EVENT_TYPES.filter(type => type !== this.previousType);
    const type = eligible[Math.floor(this.random() * eligible.length)];
    this.sameInARow = type === this.previousType ? this.sameInARow + 1 : 1;
    this.previousType = type;
    this.event = { type, status: 'warning' };
    this.dueAt = undefined;
    return true;
  }

  activate(): void {
    if (this.event?.status !== 'warning') return;
    this.event = { type: this.event.type, status: 'active', remaining: SETTINGS.durationAppearances };
  }

  onMouseAppeared(appearances: number): void {
    if (this.event?.status !== 'active') return;
    this.event.remaining--;
    if (this.event.remaining > 0) return;
    this.event = undefined;
    const { min, max } = SETTINGS.nextWaitAppearances;
    this.dueAt = appearances + min + Math.floor(this.random() * (max - min + 1));
  }

  reset(): void {
    this.event = undefined;
    this.dueAt = undefined;
    this.previousType = undefined;
    this.sameInARow = 0;
  }
}
