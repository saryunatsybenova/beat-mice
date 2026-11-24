import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { availableItems, drawUsefulItem } = await vite.ssrLoadModule('/src/game/itemBalance.ts');
const { GameState } = await vite.ssrLoadModule('/src/game/GameState.ts');

const allEligible = { canOfferHealing: true, hasShield: false, hasCoinBonus: false, hasFlowerCharge: false };

test('phase item tables and eligibility', () => {
  for (const stage of [1, 2]) assert.deepEqual(availableItems(stage, allEligible), []);
  assert.deepEqual(Object.fromEntries(availableItems(3, allEligible)), {
    cheese: 45, bigCheese: 20, heart: 20, shield: 15,
  });
  assert.deepEqual(Object.fromEntries(availableItems(4, allEligible)), {
    cheese: 25, bigCheese: 15, heart: 15, shield: 10, glasses: 10, clover: 10, coin: 10, flower: 5,
  });
  assert.deepEqual(availableItems(5, allEligible), availableItems(4, allEligible));
  assert.deepEqual(Object.fromEntries(availableItems(4, { ...allEligible, hasFlowerCharge: true })), {
    cheese: 25, bigCheese: 15, heart: 15, shield: 10, glasses: 10, clover: 10, coin: 10,
  });
  const full = new GameState();
  assert.deepEqual(Object.fromEntries(availableItems(4, {
    canOfferHealing: full.canOfferHealing(0), hasShield: true, hasCoinBonus: true, hasFlowerCharge: false,
  })), { cheese: 25, bigCheese: 15, glasses: 10, clover: 10 });
});

test('seeded sampling uses one roll and normalizes only eligible weights', t => {
  assert.equal(drawUsefulItem([], () => assert.fail('Empty pool must not roll')), undefined);
  const samples = 20_000;
  for (const [stage, eligibility] of [
    [3, allEligible],
    [4, allEligible],
    [4, { ...allEligible, canOfferHealing: false, hasShield: true, hasCoinBonus: true }],
  ]) {
    const weights = availableItems(stage, eligibility);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    const draws = new Map();
    let seed = 20261124;
    let rolls = 0;
    const random = () => {
      rolls++;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < samples; i++) {
      const item = drawUsefulItem(weights, random);
      draws.set(item, (draws.get(item) ?? 0) + 1);
    }
    assert.equal(rolls, samples);
    assert.equal(draws.size, weights.length);
    for (const [item, weight] of weights) {
      assert.ok(Math.abs(draws.get(item) / samples - weight / total) < 0.015, item);
    }
    t.diagnostic(`Phase ${stage}, eligible weight ${total}: ${JSON.stringify(Object.fromEntries(draws))}`);
  }
});

test('both healing offers return after 20 appearances, and an existing heal refreshes the deadline', () => {
  const state = new GameState();
  state.start();
  for (let i = 0; i < 3; i++) state.applyMistake(true);
  assert.equal(state.canOfferHealing(7), true);
  assert.equal(state.restoreLife(7), true);
  assert.equal(state.canOfferHealing(26), false);
  assert.equal(state.canOfferHealing(27), true);
  assert.equal(state.restoreLife(19), true);
  const offeredAt = count => availableItems(4, { ...allEligible, canOfferHealing: state.canOfferHealing(count) })
    .map(([type]) => type).filter(type => type === 'heart' || type === 'flower');
  assert.deepEqual(offeredAt(38), []);
  assert.deepEqual(offeredAt(39), ['heart', 'flower']);
});

test('full lives and shield do not start a cooldown; pause, loss and reset respect the lifecycle', () => {
  const state = new GameState();
  state.start();
  assert.equal(state.restoreLife(10), false);
  state.activateShield();
  assert.deepEqual(state.applyMistake(true), { protected: true, brokeStreak: false });
  state.applyMistake(true);
  assert.equal(state.restoreLife(10, 0), false);
  assert.equal(state.canOfferHealing(10), true);
  assert.equal(state.restoreLife(10), true);
  state.applyMistake(true);
  state.pause();
  assert.equal(state.restoreLife(11), false);
  state.resume();
  assert.equal(state.canOfferHealing(29), false);
  assert.equal(state.canOfferHealing(30), true);
  for (let i = state.lives; i > 0; i--) state.applyMistake(true);
  assert.equal(state.restoreLife(30), false);
  assert.equal(state.end(), true);
  assert.equal(state.end(), false);
  assert.equal(state.restoreLife(31), false);
  state.reset();
  state.start();
  state.applyMistake(true);
  assert.equal(state.canOfferHealing(0), true);
  assert.equal(state.gameStage, 1);
});

test('shield preserves a streak and coin; a full catch spends the coin after multiplication once', () => {
  const state = new GameState();
  state.start();
  state.gameStage = 4;
  state.streak = 5;
  state.activateShield();
  state.activateCoinBonus();
  const lives = state.lives;
  assert.deepEqual(state.applyMistake(true), { protected: true, brokeStreak: false });
  assert.equal(state.lives, lives);
  assert.equal(state.streak, 5);
  assert.equal(state.hasCoinBonus, true);
  assert.deepEqual(state.hit(5), { points: 20, coinBonus: 10, enteredPhase: undefined });
  assert.deepEqual(state.hit(5), { points: 10, coinBonus: 0, enteredPhase: undefined });
  assert.equal(state.score, 30);
});
