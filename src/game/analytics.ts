import { version } from '../../package.json';
import type { GameStage } from './GameState';
import type { GardenRewardId } from './gardenProgress';
import type { MouseType, UsefulItemType } from './visuals';

const COUNTER_ID = 114661733;
const RUN_NUMBER_KEY = 'whack-a-mouse.analytics.run-number';
let lastRunNumber = 0;

interface ItemParams {
  item_id: string;
  item_type: UsefulItemType;
  phase: GameStage;
}

interface MouseDamage {
  shield_absorbed: boolean;
  lives_lost: number;
}

interface EventParams {
  game_start: { run_number: number; first_garden_reward_unlocked: boolean };
  decoy_clicked: MouseDamage & { phase: GameStage; lives_remaining: number };
  item_spawned: ItemParams;
  item_resolved: ItemParams & { result: 'collected' | 'missed' };
  mouse_resolved: MouseDamage & {
    mouse_id: string;
    mouse_type: MouseType;
    phase: GameStage;
    active_event: 'none' | 'invasion' | 'gold_rush';
    result: 'caught' | 'escaped' | 'decoy_clicked' | 'friendly_collected';
  };
  garden_reward_unlocked: { reward_id: GardenRewardId; total_points: number; is_first_reward: boolean };
  game_over: {
    score: number;
    phase: GameStage;
    best_streak: number;
    duration_sec: number;
    outcome: 'defeat';
    first_garden_reward_unlocked: boolean;
  };
  restart: { next_run_id: string };
}

export type MouseResult = EventParams['mouse_resolved']['result'];

interface EventMetadata {
  game_version: string;
  run_id: string;
  event_id: string;
  event_seq: number;
}

type Metrika = <Event extends keyof EventParams>(counter: number, method: 'reachGoal', event: Event,
  params: EventParams[Event] & EventMetadata) => void;

export function analyticsId(): string {
  return globalThis.crypto.randomUUID?.() ??
    Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), part => part.toString(36)).join('-');
}

function nextRunNumber(): number {
  try {
    const saved = Number(localStorage.getItem(RUN_NUMBER_KEY));
    if (Number.isSafeInteger(saved)) lastRunNumber = Math.max(lastRunNumber, saved);
  } catch {
    // Без доступа к хранилищу нумерация действует до закрытия страницы.
  }
  lastRunNumber++;
  try {
    localStorage.setItem(RUN_NUMBER_KEY, String(lastRunNumber));
  } catch {
    // В памяти уже сохранён номер текущей попытки.
  }
  return lastRunNumber;
}

export class AnalyticsRun {
  readonly id = analyticsId();
  readonly number = nextRunNumber();
  private sequence = 0;
  private activeSince: number | undefined = performance.now();
  private activeMs = 0;

  get durationSec(): number {
    const currentMs = this.activeSince === undefined ? 0 : performance.now() - this.activeSince;
    return Math.floor((this.activeMs + currentMs) / 1_000);
  }

  pause(): void {
    if (this.activeSince === undefined) return;
    this.activeMs += performance.now() - this.activeSince;
    this.activeSince = undefined;
  }

  resume(): void {
    this.activeSince ??= performance.now();
  }

  track<Event extends keyof EventParams>(event: Event, params: EventParams[Event]): void {
    const sequence = ++this.sequence;
    const payload = {
      ...params,
      game_version: version,
      run_id: this.id,
      event_id: `${this.id}:${sequence}`,
      event_seq: sequence,
    };
    const host = location.hostname.toLowerCase().replace(/\.$/, '');
    const localhost = host === 'localhost' || host.endsWith('.localhost') ||
      host.startsWith('127.') || host === '[::1]' || host === '0.0.0.0';
    if (import.meta.env.DEV || localhost) {
      console.debug('[Метрика]', event, payload);
      return;
    }
    try {
      (window as Window & { ym?: Metrika }).ym?.(COUNTER_ID, 'reachGoal', event, payload);
    } catch {
      // Заблокированный или неисправный счётчик не влияет на ход игры.
    }
  }
}
