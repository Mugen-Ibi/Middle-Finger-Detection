import { generateSamples } from '../datasets/gestures/generate.mjs';
import { classifyGesture } from '../web/gesture.js';
import { mkdir, writeFile } from 'node:fs/promises';
const labels = ['middle_finger', 'thumbs_up', 'thumbs_down', 'none'];
const report = { kind: 'synthetic regression only; not real-world accuracy', splits: {} };
await mkdir('test-results/gestures', { recursive: true });
for (const [split, seed] of Object.entries({ development: 20261023, evaluation: 421337 })) {
  const samples = [...generateSamples(seed)];
  const confusion = Object.fromEntries(labels.map(label => [label, Object.fromEntries(labels.map(prediction => [prediction, 0]))]));
  for (const s of samples) confusion[s.label ?? 'none'][classifyGesture(s.world, s.image, s.aspectRatio) ?? 'none']++;
  const correct = labels.reduce((sum, label) => sum + confusion[label][label], 0);
  report.splits[split] = { seed, samples: samples.length, correct, accuracy: correct / samples.length, confusion };
  await writeFile(`test-results/gestures/${split}.jsonl`, samples.map(s => JSON.stringify(s)).join('\n') + '\n');
}
await writeFile('test-results/gestures/metrics.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.splits).some(s => s.correct !== s.samples)) process.exitCode = 1;
