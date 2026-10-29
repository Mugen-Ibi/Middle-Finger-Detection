import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureGate, isMiddleFinger, resolveGesture } from '../web/gesture.js';

export function hand(extended = [9]) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const base of [5, 9, 13, 17]) {
    const x = base / 10;
    points[base] = { x, y: 0, z: 0 };
    points[base + 1] = { x, y: 1, z: 0 };
    points[base + 2] = { x: x + (extended.includes(base) ? 0 : 0.3), y: extended.includes(base) ? 1.7 : 0.6, z: 0 };
    points[base + 3] = { x, y: extended.includes(base) ? 2.3 : 0.3, z: 0 };
  }
  return points;
}
test('middle finger alone is recognized, open hand / fist / victory are rejected', () => {
  assert.equal(isMiddleFinger(hand()), true);
  for (const extended of [[], [5], [5, 9], [5, 9, 13, 17], [9, 13], [9, 17]]) assert.equal(isMiddleFinger(hand(extended)), false);
});
test('rotation, handedness, translation and scale do not change classification', () => {
  const rotated = hand().map(p => ({ x: p.z * 0.02 + 2, y: -p.x * 0.02 + 3, z: p.y * 0.02 - 1 }));
  assert.equal(isMiddleFinger(rotated), true);
  assert.equal(isMiddleFinger(hand().map(p => ({ ...p, x: -p.x }))), true);
});
test('missing, non-finite and degenerate landmarks cannot trigger', () => {
  assert.equal(isMiddleFinger(null), false);
  assert.equal(isMiddleFinger([]), false);
  assert.equal(isMiddleFinger(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))), false);
  const invalid = hand(); invalid[0].x = NaN; assert.equal(isMiddleFinger(invalid), false);
});
test('gesture requires a stable hold and fires once while held', () => {
  const gate = new GestureGate();
  assert.equal(gate.update(true, 0), false);
  assert.equal(gate.update(true, 150), false);
  assert.equal(gate.update(true, 310), true);
  for (const time of [500, 800, 1100]) assert.equal(gate.update(true, time), false);
});
test('brief tracking losses do not rearm; deliberate release does', () => {
  const gate = new GestureGate();
  [0, 150, 300].forEach(t => gate.update(true, t));
  gate.update(false, 400); gate.update(false, 600);
  assert.equal(gate.update(true, 650), false);
  gate.update(false, 700); gate.update(false, 1200);
  assert.equal(gate.update(true, 1300), false);
  assert.equal(gate.update(true, 1500), false);
  assert.equal(gate.update(true, 1650), true);
});
test('stale samples do not count as a continuous hold', () => {
  const gate = new GestureGate();
  gate.update(true, 0); gate.update(true, 150);
  assert.equal(gate.update(true, 2000), false);
  gate.reset(); assert.equal(gate.update(true, 4000), false);
});

test('simultaneous middle fingers resolve to a dedicated gesture regardless of hand order', () => {
  assert.equal(resolveGesture(['middle_finger', 'middle_finger']), 'double_middle_finger');
  assert.equal(resolveGesture(['middle_finger']), 'middle_finger');
  assert.equal(resolveGesture([null, 'middle_finger']), 'middle_finger');
  assert.equal(resolveGesture(['thumbs_up', 'thumbs_up']), 'thumbs_up');
  for (const gestures of [[], [null, null], ['middle_finger', 'thumbs_up'], ['thumbs_up', 'middle_finger']]) {
    assert.equal(resolveGesture(gestures), null);
  }
});

test('short recognition dropouts preserve a hold but longer interruptions reset it', () => {
  const gate = new GestureGate();
  gate.update('middle_finger', 0); gate.update('middle_finger', 100);
  gate.update(null, 130);
  gate.update('middle_finger', 180);
  assert.equal(gate.update('middle_finger', 310), true);
  gate.reset();
  gate.update('middle_finger', 0); gate.update(null, 100);
  assert.equal(gate.update('middle_finger', 250), false);
  assert.equal(gate.update('middle_finger', 400), false);
  assert.equal(gate.update('middle_finger', 560), true);
});

test('one hand upgrades to two only after a separate stable hold and cannot flicker into repeats', () => {
  const gate = new GestureGate();
  gate.update('middle_finger', 0); gate.update('middle_finger', 150);
  assert.equal(gate.update('middle_finger', 310), true);
  assert.equal(gate.update('double_middle_finger', 400), false);
  assert.equal(gate.update('double_middle_finger', 550), false);
  assert.equal(gate.update('double_middle_finger', 710), true);
  for (const [gesture, time] of [
    ['middle_finger', 800], ['middle_finger', 1000], ['middle_finger', 1200],
    ['double_middle_finger', 1300], ['double_middle_finger', 1500], ['double_middle_finger', 1700],
  ]) assert.equal(gate.update(gesture, time), false);
  gate.update(null, 1800); gate.update(null, 2300);
  gate.update('double_middle_finger', 2400); gate.update('double_middle_finger', 2550);
  assert.equal(gate.update('double_middle_finger', 2700), true);
});

test('alternating one-hand results cannot accumulate into a simultaneous two-hand hold', () => {
  const gate = new GestureGate();
  for (let t = 0; t <= 900; t += 50) {
    const gestures = t % 100 ? ['middle_finger', null] : [null, 'middle_finger'];
    gate.update(resolveGesture(gestures), t);
    assert.notEqual(gate.accepted, 'double_middle_finger');
  }
  for (let t = 1000; t < 1500; t += 50) {
    assert.equal(gate.update(t % 100 ? 'double_middle_finger' : 'middle_finger', t), false);
  }
});

test('missing inference results interrupt the hold without rearming an accepted gesture', () => {
  const gate = new GestureGate();
  gate.update('double_middle_finger', 0); gate.update('double_middle_finger', 150);
  assert.equal(gate.update('double_middle_finger', 310), true);
  gate.interrupt();
  for (const time of [3000, 3150, 3350]) assert.equal(gate.update('double_middle_finger', time), false);
  gate.update(null, 3400); gate.update(null, 3900);
  gate.update('double_middle_finger', 4000); gate.update('double_middle_finger', 4150);
  assert.equal(gate.update('double_middle_finger', 4310), true);
});
