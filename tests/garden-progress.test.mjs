import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { ProgressStore } = await vite.ssrLoadModule('/src/game/ProgressStore.ts');
const { gardenProgress } = await vite.ssrLoadModule('/src/game/gardenProgress.ts');
const { GARDEN_REWARDS } = await vite.ssrLoadModule('/src/game/settings.ts');

function useStorage(initial) {
  let value = initial === undefined ? null : JSON.stringify(initial);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => value, setItem: (_key, updated) => { value = updated; } },
  });
  return () => JSON.parse(value);
}

test('rewards unlock on or above every threshold using completed games only', () => {
  for (const [index, reward] of GARDEN_REWARDS.entries()) {
    for (const offset of [-1, 0, 1]) {
      useStorage();
      const store = new ProgressStore();
      store.recordScore(reward.threshold + 100);
      assert.deepEqual(store.snapshot.unlockedRewards, []);
      assert.equal(store.snapshot.totalPoints, 0);
      const opened = store.addCompletedGame(reward.threshold + offset);
      assert.deepEqual(opened, GARDEN_REWARDS.slice(0, index + Number(offset >= 0)).map(({ id }) => id));
      assert.deepEqual(store.snapshot.hiddenRewards, []);
      assert.deepEqual(store.addCompletedGame(0), []);
    }
  }
});

test('migration opens all earned rewards without adding points and persists one garden notice', () => {
  const saved = useStorage({ version: 1, bestScore: 208, totalPoints: 350, hasBestScore: true });
  let store = new ProgressStore();
  assert.equal(saved().version, 2);
  assert.equal(store.snapshot.bestScore, 208);
  assert.equal(store.snapshot.totalPoints, 350);
  assert.deepEqual(store.snapshot.unlockedRewards, ['flowerbed', 'bench']);
  store = new ProgressStore();
  assert.deepEqual(store.takeGardenNotice(), ['flowerbed', 'bench']);
  assert.deepEqual(new ProgressStore().takeGardenNotice(), []);
  store.setRewardVisible('flowerbed', false);
  store.setRewardVisible('fountain', false);
  store = new ProgressStore();
  assert.deepEqual(store.snapshot.hiddenRewards, ['flowerbed']);
  assert.deepEqual(store.snapshot.unlockedRewards, ['flowerbed', 'bench']);
  assert.deepEqual(store.addCompletedGame(150), ['fountain']);
  assert.deepEqual(store.snapshot.hiddenRewards, ['flowerbed']);
  assert.deepEqual(store.takeGardenNotice(), []);
});

test('missing and malformed garden fields keep core progress and known unlocks', () => {
  useStorage({
    version: 2, bestScore: 125, totalPoints: 100, hasBestScore: true,
    unlockedRewards: ['fireflies', {}, 'unknown', 'fireflies'], hiddenRewards: { fireflies: false },
    pendingGardenNotice: ['unknown', 500, 'fountain'],
  });
  const store = new ProgressStore();
  assert.deepEqual(store.snapshot.unlockedRewards, ['fireflies', 'flowerbed']);
  assert.deepEqual(store.snapshot.hiddenRewards, []);
  assert.equal(store.snapshot.bestScore, 125);
  assert.equal(store.snapshot.totalPoints, 100);
  assert.deepEqual(store.takeGardenNotice(), ['flowerbed']);
  useStorage({ version: 2, bestScore: 375, totalPoints: 250, hasBestScore: true });
  assert.deepEqual(new ProgressStore().snapshot.unlockedRewards, ['flowerbed', 'bench']);
});

test('progress uses the previous threshold and clamps to the scale', () => {
  assert.equal(gardenProgress(40, []).fraction, 0.4);
  assert.equal(gardenProgress(120, []).fraction, 1);
  assert.equal(gardenProgress(50, ['flowerbed']).fraction, 0);
  const progress = gardenProgress(350, ['flowerbed', 'bench']);
  assert.equal(progress.next.id, 'fountain');
  assert.equal(progress.remaining, 150);
  assert.equal(progress.fraction, 0.4);
  assert.deepEqual(gardenProgress(1800, GARDEN_REWARDS.map(({ id }) => id)), {
    next: undefined, remaining: 0, fraction: 1,
  });
});

test('disabled or failing storage falls back to live progress', () => {
  for (const readFails of [true, false]) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem() { if (readFails) throw Error('blocked'); return null; }, setItem() { throw Error('quota'); } },
    });
    const store = new ProgressStore();
    store.recordScore(500);
    assert.deepEqual(store.addCompletedGame(500), ['flowerbed', 'bench', 'fountain']);
    store.setRewardVisible('fountain', false);
    assert.equal(store.snapshot.bestScore, 500);
    assert.equal(store.snapshot.totalPoints, 500);
    assert.deepEqual(store.snapshot.hiddenRewards, ['fountain']);
  }
});
