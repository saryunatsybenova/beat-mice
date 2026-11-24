import type { GameStage } from './GameState';
import { BALANCE } from './settings';
import type { UsefulItemType } from './visuals';

type ItemWeight = [UsefulItemType, number];

interface ItemAvailability {
  canOfferHealing: boolean;
  hasShield: boolean;
  hasCoinBonus: boolean;
  hasFlowerCharge: boolean;
}

export function availableItems(stage: GameStage, state: ItemAvailability): ItemWeight[] {
  if (stage < 3) return [];
  const weights = stage === 4
    ? BALANCE.phase4UsefulItemChances
    : { ...BALANCE.usefulItemChances, glasses: 0, clover: 0, coin: 0, flower: 0 };
  const choices: ItemWeight[] = [
    ['cheese', weights.cheese],
    ['bigCheese', weights.bigCheese],
    ['heart', state.canOfferHealing ? weights.heart : 0],
    ['shield', state.hasShield ? 0 : weights.shield],
    ['glasses', weights.glasses],
    ['clover', weights.clover],
    ['coin', state.hasCoinBonus ? 0 : weights.coin],
    ['flower', state.canOfferHealing && !state.hasFlowerCharge ? weights.flower : 0],
  ];
  return choices.filter(([, weight]) => weight > 0);
}

export function drawUsefulItem(choices: readonly ItemWeight[], random = Math.random): UsefulItemType | undefined {
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  if (total === 0) return;

  // Один бросок по доступным весам, без повторного выбора исключённых предметов.
  let roll = random() * total;
  for (const [type, weight] of choices) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return choices.at(-1)?.[0];
}
