import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSamples } from '../datasets/gestures/generate.mjs';
import { classifyGesture, GestureGate } from '../web/gesture.js';

test('5120 seeded evaluation poses: classes, negative poses, handedness, rotation, noise and aspect ratios', () => {
  for (const s of generateSamples(421337)) assert.equal(classifyGesture(s.world, s.image, s.aspectRatio), s.label, s.id);
});
test('invalid/sparse/degenerate data fail closed', () => {
  for (const points of [null, [], new Array(21), Array(21).fill({ x: 0, y: 0, z: 0 }), Array(21).fill({ x: NaN, y: 0, z: 0 })]) {
    assert.equal(classifyGesture(points, points), null);
  }
  const thumb = [...generateSamples(1, 1)].find(s => s.label === 'thumbs_up');
  assert.equal(classifyGesture(thumb.world, null), null);
  assert.equal(classifyGesture(thumb.world, thumb.image, 0), null);
});
test('alternating gesture classes cannot accumulate hold time; release required after acceptance', () => {
  const gate = new GestureGate();
  for (let t = 0; t < 1000; t += 100) assert.equal(gate.update(t % 200 ? 'thumbs_up' : 'thumbs_down', t), false);
  assert.equal(gate.update('thumbs_up', 1000), false);
  assert.equal(gate.update('thumbs_up', 1100), false);
  assert.equal(gate.update('thumbs_up', 1200), true);
  for (const t of [1300, 1500, 1700]) assert.equal(gate.update('thumbs_down', t), false);
  gate.update(null, 1800); gate.update(null, 2300);
  assert.equal(gate.update('thumbs_down', 2400), false);
  assert.equal(gate.update('thumbs_down', 2550), false);
  assert.equal(gate.update('thumbs_down', 2700), true);
});

test('recorded real-model landmarks preserve labels across 120 public-image variants', async () => {
  const { readFile } = await import('node:fs/promises');
  const rows = (await readFile(new URL('../datasets/gestures/public-landmarks.jsonl', import.meta.url), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 120);
  for (const row of rows) {
    const predictions = row.world.map((w, i) => classifyGesture(w, row.image[i], row.aspectRatio));
    if (row.label) assert.ok(predictions.includes(row.label), row.id);
    else assert.ok(predictions.every(p => p === null), row.id);
  }
});

test('public image provenance checksums match the dataset manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const manifest = JSON.parse(await readFile(new URL('../datasets/gestures/manifest.json', import.meta.url), 'utf8'));
  for (const source of manifest.sources) {
    const bytes = await readFile(new URL(`../${source.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.file);
  }
});
