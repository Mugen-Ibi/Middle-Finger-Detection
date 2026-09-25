import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerMaskBounds } from '../web/mask.js';

function hand() {
  const points = Array.from({ length: 21 }, () => ({ x: 0.25, y: 0.75 }));
  points[5] = { x: 0.1, y: 0.75 }; points[13] = { x: 0.4, y: 0.75 };
  [0.75, 0.6, 0.4, 0.2].forEach((y, i) => { points[9 + i] = { x: 0.25, y }; });
  return points;
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('mask follows camera letterboxing and mirror without stretching the source', () => {
  const normal = fingerMaskBounds(hand(), 640, 480, 1000, 500, false);
  const mirror = fingerMaskBounds(hand(), 640, 480, 1000, 500, true);
  near(normal.x, 1000 / 3); near(normal.y, 237.5);
  near(mirror.x, 1000 - normal.x); near(mirror.y, normal.y);
  near(mirror.width, normal.width); near(mirror.height, normal.height);
  const portrait = fingerMaskBounds(hand(), 640, 480, 300, 600, false);
  near(portrait.x, 75); near(portrait.y, 187.5 + 0.475 * 225);
});

test('rotated and bent middle finger joints stay within the mask footprint', () => {
  const points = hand().map(p => ({ x: 1 - p.y, y: p.x }));
  points[10].y += 0.03;
  const box = fingerMaskBounds(points, 640, 480, 640, 480, false);
  near(box.angle, Math.PI / 2);
  for (const p of points.slice(9, 13)) {
    const dx = p.x * 640 - box.x, dy = p.y * 480 - box.y;
    const localX = dx * Math.cos(box.angle) + dy * Math.sin(box.angle);
    const localY = -dx * Math.sin(box.angle) + dy * Math.cos(box.angle);
    assert.ok(Math.abs(localX) < box.width / 2 && Math.abs(localY) < box.height / 2);
  }
});

test('size affects coverage without moving the mask; missing or invalid points are ignored', () => {
  const small = fingerMaskBounds(hand(), 640, 480, 640, 480, false, 1);
  const large = fingerMaskBounds(hand(), 640, 480, 640, 480, false, 2);
  near(small.x, large.x); near(small.y, large.y);
  near(small.width * 2, large.width); near(small.height * 2, large.height);
  assert.equal(fingerMaskBounds([], 640, 480, 640, 480), null);
  assert.equal(fingerMaskBounds(hand(), 0, 480, 640, 480), null);
  const invalid = hand(); invalid[12].x = NaN;
  assert.equal(fingerMaskBounds(invalid, 640, 480, 640, 480), null);
  invalid[12] = invalid[9];
  assert.equal(fingerMaskBounds(invalid, 640, 480, 640, 480), null);
});
