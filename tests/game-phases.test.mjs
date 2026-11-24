import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { GameState } = await vite.ssrLoadModule('/src/game/GameState.ts');
const { BALANCE } = await vite.ssrLoadModule('/src/game/settings.ts');

test('party score crosses each phase boundary once and the base interval changes only in phase 5', () => {
  const state = new GameState();
  state.start();
  for (const [stage, threshold] of [[2, 10], [3, 50], [4, 120], [5, 200]]) {
    state.score = threshold - 2;
    state.streak = 0;
    assert.equal(state.hit().enteredPhase, undefined);
    assert.equal(state.gameStage, stage - 1);
    assert.equal(state.score, threshold - 1);
    assert.equal(state.hit().enteredPhase, stage);
    assert.equal(state.score, threshold);
    assert.equal(state.phase, 'transition');
    state.finishPhaseTransition();
    assert.equal(state.gameStage, stage);
    assert.equal(state.phase, 'playing');
  }
  assert.equal(state.spawnIntervalMs, 880);
  assert.equal(state.mouseVisibleMs, BALANCE.phases[2].mouseVisibleMs);
  assert.equal(state.hit().enteredPhase, undefined);
  state.reset();
  assert.equal(state.gameStage, 1);
  assert.equal(state.spawnIntervalMs, 1_400);
});

test('a bonus reward can jump past phase 5 and pausing leaves the transition intact', () => {
  const state = new GameState();
  state.start();
  state.gameStage = 4;
  state.score = 194;
  state.streak = 5;
  state.activateCoinBonus();
  state.activateShield();
  const lives = state.lives;
  assert.deepEqual(state.hit(BALANCE.goldenHitPoints), { points: 20, coinBonus: 10, enteredPhase: 5 });
  state.pause();
  assert.equal(state.finishPhaseTransition(), undefined);
  state.resume();
  state.finishPhaseTransition();
  assert.equal(state.score, 214);
  assert.equal(state.lives, lives);
  assert.equal(state.scoreMultiplier, 2);
  assert.equal(state.streak, 6);
  assert.equal(state.hasShield, true);
});

test('one reward crossing several thresholds chains all transitions before playing again', () => {
  const state = new GameState();
  state.start();
  assert.equal(state.hit(210).enteredPhase, 2);
  for (const stage of [3, 4, 5]) {
    assert.equal(state.phase, 'transition');
    assert.equal(state.finishPhaseTransition().nextStage, stage);
    assert.equal(state.gameStage, stage);
  }
  assert.equal(state.finishPhaseTransition().nextStage, undefined);
  assert.equal(state.phase, 'playing');
  assert.equal(state.score, 210);
});
