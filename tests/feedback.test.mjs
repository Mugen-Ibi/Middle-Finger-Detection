import test from 'node:test';
import assert from 'node:assert/strict';
import { Sfx } from '../web/feedback.js';

test('all combo lengths including maximum mode produce complete, finite rising sound runs', () => {
  for (const max of [false, true]) for (let combo = 1; combo <= 12; combo++) {
    const sfx = new Sfx(), tones = [];
    sfx.context = { state: 'running', currentTime: 0 };
    sfx.noise = () => {};
    sfx.tone = (frequency, start, duration, type) => {
      assert.ok(Number.isFinite(frequency) && frequency > 0);
      tones.push({ frequency, type });
    };
    sfx.hit(combo, { max });
    const run = tones.filter(tone => tone.type === 'triangle' || tone.type === 'square');
    assert.equal(run.length, 3 + Math.min(combo, 6) + (max ? 4 : 0));
    assert.ok(run.every((tone, i) => i === 0 || tone.frequency > run[i - 1].frequency));
  }
});

test('disposal closes audio once and prevents later document gestures reopening it', async () => {
  const sfx = new Sfx();
  let closed = 0;
  sfx.context = { state: 'running', close: async () => { closed++; } };
  assert.equal(sfx.ready, true);
  sfx.dispose();
  sfx.dispose();
  sfx.unlock();
  await Promise.resolve();
  assert.equal(closed, 1);
  assert.equal(sfx.context, null);
  assert.equal(sfx.ready, false);
});

test('audio-close rejection stays optional and does not revive the context', async () => {
  const sfx = new Sfx();
  sfx.context = { close: async () => { throw new Error('Already closed'); } };
  sfx.dispose();
  await Promise.resolve();
  assert.equal(sfx.context, null);
  assert.equal(sfx.ready, false);
});
