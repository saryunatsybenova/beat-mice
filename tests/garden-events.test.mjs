import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { GardenEvents } = await vite.ssrLoadModule('/src/game/GardenEvents.ts');

test('an event is armed after phase 2 and uses ten subsequent successful appearances', () => {
  const events = new GardenEvents(() => 0);
  assert.equal(events.prepare(100), false);
  events.startCounting(8);
  assert.equal(events.prepare(22), false);
  assert.equal(events.prepare(23), true);
  assert.deepEqual(events.current, { type: 'goldRush', status: 'warning' });
  events.onMouseAppeared(24);
  assert.equal(events.prepare(24), false);
  events.activate();
  assert.deepEqual(events.current, { type: 'goldRush', status: 'active', remaining: 10 });
  for (let count = 25; count <= 33; count++) {
    events.onMouseAppeared(count);
    assert.equal(events.current.remaining, 34 - count);
  }
  events.onMouseAppeared(34);
  assert.equal(events.current, undefined);
  assert.equal(events.prepare(53), false);
  assert.equal(events.prepare(54), true);
});

test('event draws allow either first type and force a different third one', () => {
  for (const [roll, expected] of [
    [0, ['goldRush', 'goldRush', 'invasion']],
    [0.999, ['invasion', 'invasion', 'goldRush']],
  ]) {
    const events = new GardenEvents(() => roll);
    let count = 15;
    events.startCounting(0);
    for (const type of expected) {
      assert.equal(events.prepare(count), true);
      assert.equal(events.current.type, type);
      events.activate();
      for (let i = 0; i < 10; i++) events.onMouseAppeared(++count);
      const interval = roll === 0 ? 20 : 30;
      assert.equal(events.prepare(count + interval - 1), false);
      count += interval;
    }
  }
});

test('reset discards a warning, an active effect, the interval and the selection history', () => {
  const events = new GardenEvents(() => 0);
  events.startCounting(0);
  events.prepare(15);
  events.reset();
  assert.equal(events.current, undefined);
  assert.equal(events.prepare(500), false);
  events.startCounting(0);
  events.prepare(15);
  events.activate();
  events.reset();
  assert.equal(events.current, undefined);
  assert.equal(events.prepare(500), false);
  events.startCounting(0);
  events.prepare(15);
  assert.equal(events.current.type, 'goldRush');
});
