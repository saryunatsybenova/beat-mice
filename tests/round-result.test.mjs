import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { GameState } = await vite.ssrLoadModule('/src/game/GameState.ts');
const { ProgressStore } = await vite.ssrLoadModule('/src/game/ProgressStore.ts');
const { finishRound } = await vite.ssrLoadModule('/src/game/roundResult.ts');

function setup(saved, fail = false) {
  let value = JSON.stringify({ version: 3, bestScore: 3, totalPoints: 95, hasBestScore: true, ...saved });
  let writes = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => value,
      setItem: (_key, next) => { if (fail) throw Error('quota'); value = next; writes++; },
    },
  });
  const state = new GameState();
  state.start();
  return { state, progress: new ProgressStore(), writes: () => writes };
}

test('one result freezes the score, statistics, garden and task, including one storage write', () => {
  const { state, progress, writes } = setup({ activeTask: 'firstCatches', taskProgress: 29 });
  const task = progress.startTask();
  assert.equal(finishRound(state, progress, task, 3), undefined);
  state.registerHelmetHit();
  state.hit(3);
  state.hit(1);
  state.hit(5);
  task.count('normal');
  progress.recordScore(state.score);
  state.activateShield();
  assert.deepEqual(state.applyMistake(true, true), { protected: true, brokeStreak: false });
  assert.equal(state.lives, 5);
  state.applyMistake(false, true);
  for (let index = 0; index < 5; index++) state.applyMistake(true, false);
  const before = writes();
  const result = finishRound(state, progress, task, 3);
  assert.equal(writes(), before + 1);
  assert.deepEqual([result.score, result.caughtMice, result.successfulPresses, result.mistakenPresses, result.accuracy],
    [9, 3, 4, 2, 67]);
  assert.equal(result.newRecord, true);
  assert.equal(result.bestScore, 9);
  assert.equal(result.totalPoints, 104);
  assert.deepEqual(result.gardenRewards, ['flowerbed']);
  assert.equal(result.completedTask.id, 'firstCatches');
  assert.equal(result.task.title, 'Золотой улов');
  assert.equal(result.task.amount, 0);
  assert.equal(result.garden.remaining, 146);
  assert.equal(state.hit(), undefined);
  state.registerHelmetHit();
  assert.equal(state.applyMistake(false, true), undefined);
  assert.equal(finishRound(state, progress, task, 3), undefined);
  assert.equal(writes(), before + 1);
  state.reset();
  assert.deepEqual(state.roundStats, { caughtMice: 0, successfulPresses: 0, mistakenPresses: 0 });
  assert.equal(result.caughtMice, 3);
});

test('no presses yield absent accuracy; failed persistence is reported and progress stays in memory', () => {
  const { state, progress } = setup({}, true);
  for (let index = 0; index < 5; index++) state.applyMistake(true);
  const result = finishRound(state, progress, progress.startTask(), undefined);
  assert.equal(result.accuracy, undefined);
  assert.equal(result.newRecord, false);
  assert.equal(result.canSave, false);
  assert.equal(result.totalPoints, 95);
});

test('a first record follows the existing rule and unfinished score does not credit totals or tasks', () => {
  const { state, progress } = setup({ hasBestScore: false, bestScore: 0 });
  const task = progress.startTask();
  state.hit(1);
  task.count('normal');
  progress.recordScore(state.score);
  assert.equal(finishRound(state, progress, task, undefined), undefined);
  assert.equal(progress.snapshot.bestScore, 1);
  assert.equal(progress.snapshot.totalPoints, 95);
  assert.equal(progress.snapshot.taskProgress, 0);
  for (let index = 0; index < 5; index++) state.applyMistake(true);
  const result = finishRound(state, progress, task, undefined);
  assert.equal(result.newRecord, false);
  assert.equal(result.task.amount, 1);
});
