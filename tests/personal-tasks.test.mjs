import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { ProgressStore } = await vite.ssrLoadModule('/src/game/ProgressStore.ts');
const { PERSONAL_TASKS } = await vite.ssrLoadModule('/src/game/settings.ts');

function mockStorage(initial = {}) {
  let value = JSON.stringify({ version: 3, bestScore: 0, totalPoints: 0, hasBestScore: false, ...initial });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => value, setItem: (_key, updated) => { value = updated; } },
  });
}

function complete(store, task, amount) {
  const party = store.startTask();
  const score = task.metric === 'score' ? amount : 0;
  const streak = task.metric === 'streak' ? amount : 0;
  if (task.metric !== 'score' && task.metric !== 'streak') {
    for (let i = 0; i < amount; i++) party.count(task.metric);
  }
  assert.equal(party.preview(score, streak), Math.min(amount, task.goal));
  return store.addCompletedGame(score, party, streak).completedTask;
}

test('each task is below, on and above its goal; rewards stay earned after loading', () => {
  for (const [index, task] of PERSONAL_TASKS.entries()) {
    for (const offset of [-1, 0, 1]) {
      mockStorage({ completedTasks: PERSONAL_TASKS.slice(0, index).map(({ id }) => id) });
      const store = new ProgressStore();
      const won = complete(store, task, task.goal + offset);
      const progress = new ProgressStore().snapshot;
      assert.equal(won?.id, offset >= 0 ? task.id : undefined);
      assert.equal(progress.unlockedLooks.includes(task.reward), offset >= 0);
      assert.equal(progress.activeTask, offset >= 0 ? PERSONAL_TASKS[index + 1]?.id ?? null : task.id);
      assert.equal(progress.selectedLook, 'standard');
      if (offset >= 0) assert.equal(progress.taskProgress, 0);
    }
  }
});

test('sums only completed parties for the assigned action, drops spills and returns both kinds of rewards', () => {
  mockStorage({ totalPoints: 95 });
  const store = new ProgressStore();
  const abandoned = store.startTask();
  for (let i = 0; i < 30; i++) abandoned.count('normal');
  assert.equal(abandoned.preview(0, 0), 30);
  assert.equal(store.snapshot.taskProgress, 0);
  assert.equal(complete(store, PERSONAL_TASKS[0], 15), undefined);
  const second = store.startTask();
  for (let i = 0; i < 20; i++) {
    second.count('normal');
    second.count('golden');
  }
  assert.deepEqual(store.addCompletedGame(5, second), {
    gardenRewards: ['flowerbed'], completedTask: PERSONAL_TASKS[0],
  });
  assert.equal(second.finish(5, 0), undefined);
  assert.equal(store.snapshot.activeTask, 'goldenCatch');
  assert.equal(store.snapshot.taskProgress, 0);
  assert.equal(store.startTask().preview(0, 0), 0);
});

test('score and streak never add across parties', () => {
  for (const index of [2, 5]) {
    const task = PERSONAL_TASKS[index];
    mockStorage({ completedTasks: PERSONAL_TASKS.slice(0, index).map(({ id }) => id) });
    const store = new ProgressStore();
    for (let i = 0; i < 2; i++) assert.equal(complete(store, task, task.goal - 1), undefined);
    assert.equal(store.snapshot.taskProgress, 0);
    assert.equal(complete(store, task, task.goal).id, task.id);
  }
});

test('migration keeps garden, ignores unknown IDs and restores an available selected look', () => {
  mockStorage({ version: 2, totalPoints: 250, bestScore: 151, hasBestScore: true,
    unlockedRewards: ['flowerbed', 'bench'], hiddenRewards: ['bench'],
    completedTasks: ['firstCatches'], unlockedLooks: ['spotted'], selectedLook: 'spotted' });
  let store = new ProgressStore();
  assert.equal(store.snapshot.activeTask, 'firstCatches');
  assert.equal(store.snapshot.taskProgress, 0);
  assert.deepEqual(store.snapshot.hiddenRewards, ['bench']);
  assert.equal(store.snapshot.bestScore, 151);
  store.selectLook('spotted');
  assert.equal(store.snapshot.selectedLook, 'standard');
  complete(store, PERSONAL_TASKS[0], 30);
  store.selectLook('spotted');
  store = new ProgressStore();
  assert.equal(store.snapshot.selectedLook, 'spotted');
  assert.equal(store.snapshot.activeTask, 'goldenCatch');
  mockStorage({ completedTasks: ['unknown', 'firstCatches', 'firstCatches'], activeTask: 'unknown',
    taskProgress: 9, unlockedLooks: ['missing'], selectedLook: 'starry' });
  store = new ProgressStore();
  assert.deepEqual(store.snapshot.completedTasks, ['firstCatches']);
  assert.deepEqual(store.snapshot.unlockedLooks, ['standard', 'spotted']);
  assert.equal(store.snapshot.selectedLook, 'standard');
  assert.equal(store.snapshot.taskProgress, 0);
});

test('tasks and unlocked looks remain usable in memory when storage is unavailable', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw Error('disabled'); },
  });
  const store = new ProgressStore();
  assert.equal(complete(store, PERSONAL_TASKS[0], 30).id, 'firstCatches');
  store.selectLook('spotted');
  assert.equal(store.snapshot.selectedLook, 'spotted');
  assert.deepEqual(store.snapshot.completedTasks, ['firstCatches']);
});
