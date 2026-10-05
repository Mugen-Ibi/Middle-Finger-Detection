import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, COMBO_WINDOW_MS, Progress, xpForLevel } from '../web/progress.js';

test('gestures inside the combo window chain; a gap restarts the combo', () => {
  const progress = new Progress();
  assert.equal(progress.record(0).combo, 1);
  assert.equal(progress.record(COMBO_WINDOW_MS).combo, 2);
  assert.equal(progress.record(COMBO_WINDOW_MS * 2 + 1).combo, 1);
  assert.equal(progress.count, 3);
  assert.equal(progress.best, 2);
});

test('score and XP grow with the combo', () => {
  const progress = new Progress();
  assert.equal(progress.record(0).gain, 100);
  assert.equal(progress.record(1000).gain, 200);
  assert.equal(progress.record(2000).gain, 300);
  assert.equal(progress.score, 600);
  assert.equal(progress.xp, 600 - xpForLevel(1));
  assert.equal(progress.level, 2);
});

test('a large gain can pass several levels at once and keeps the remainder', () => {
  const progress = new Progress();
  progress.combo = 30; progress.lastAt = 0;
  const result = progress.record(10);
  assert.equal(result.gain, 3100);
  assert.deepEqual(result.levelsGained, [2, 3, 4]);
  assert.equal(progress.xp, 3100 - xpForLevel(1) - xpForLevel(2) - xpForLevel(3));
  assert.ok(progress.xp >= 0 && progress.xp < progress.xpNeeded);
});

test('each badge is reported once, when its condition is first met', () => {
  const progress = new Progress();
  assert.deepEqual(progress.record(0).newBadges.map(b => b.id), ['first']);
  assert.deepEqual(progress.record(100).newBadges, []);
  assert.deepEqual(progress.record(200).newBadges.map(b => b.id), ['combo3']);
  const ids = [];
  for (let i = 3; i < 12; i++) ids.push(...progress.record(i * 100).newBadges.map(b => b.id));
  assert.deepEqual(ids.filter(id => id === 'combo3'), []);
  assert.ok(ids.includes('five') && ids.includes('combo5') && ids.includes('ten') && ids.includes('combo10'));
  assert.equal(new Set(BADGES.map(b => b.id)).size, BADGES.length);
});

test('the all-effects badge needs the all-effects option', () => {
  const progress = new Progress();
  assert.equal(progress.record(0).newBadges.some(b => b.id === 'all'), false);
  assert.equal(progress.record(10, { allEffects: true }).newBadges.some(b => b.id === 'all'), true);
});

test('the combo timer drains and then expires without touching the totals', () => {
  const progress = new Progress();
  assert.equal(progress.comboRemaining(0), 0);
  progress.record(1000);
  assert.equal(progress.comboRemaining(1000), 1);
  assert.equal(progress.comboRemaining(1000 + COMBO_WINDOW_MS / 2), 0.5);
  assert.equal(progress.expire(1000 + COMBO_WINDOW_MS - 1), false);
  assert.equal(progress.expire(1000 + COMBO_WINDOW_MS + 1), true);
  assert.equal(progress.combo, 0);
  assert.equal(progress.count, 1);
  assert.equal(progress.score, 100);
  assert.equal(progress.best, 1);
  assert.equal(progress.expire(1000 + COMBO_WINDOW_MS + 2), false);
});

test('reset returns to the first level with no badges', () => {
  const progress = new Progress();
  progress.record(0, { allEffects: true });
  progress.reset();
  assert.deepEqual([progress.count, progress.score, progress.level, progress.combo, progress.badges.size], [0, 0, 1, 0, 0]);
});
