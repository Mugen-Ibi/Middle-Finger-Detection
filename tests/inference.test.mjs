import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameScheduler, InferenceMetrics } from '../web/inference.js';

function clock() {
  let time = 0, id = 0;
  const timers = new Map();
  return { now: () => time,
    schedule: (callback, delay) => { timers.set(++id, { callback, at: time + Math.max(1, delay) }); return id; },
    cancel: id => timers.delete(id),
    advance(to) {
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > to) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback();
      }
      time = to;
    },
  };
}

test('completion immediately dispatches the newest unseen frame without queuing old frames', () => {
  const time = clock(), sent = [];
  const scheduler = new FrameScheduler(frame => sent.push(frame), time);
  const first = { timestamp: 0 }, skipped = { timestamp: 16 }, latest = { timestamp: 33 };
  scheduler.offer(first);
  time.advance(16); scheduler.offer(skipped);
  time.advance(33); scheduler.offer(latest);
  assert.deepEqual(sent, [first]);
  time.advance(40); scheduler.complete(first);
  assert.deepEqual(sent, [first, latest]);
  time.advance(80); scheduler.complete(latest);
  time.advance(1000);
  assert.equal(sent.length, 2, 'never dispatch the same frame twice');
});

test('rate cap dispatches the latest frame at its deadline and responds to rate changes', () => {
  const time = clock(), sent = [];
  const scheduler = new FrameScheduler(frame => sent.push({ frame, at: time.now() }), { ...time, fps: 15 });
  const first = {}, latest = {};
  scheduler.offer(first); time.advance(10); scheduler.complete(first);
  scheduler.offer({}); time.advance(20); scheduler.offer(latest);
  time.advance(66); assert.equal(sent.length, 1);
  time.advance(67); assert.equal(sent[1].frame, latest);
  scheduler.complete(latest); scheduler.offer({}); scheduler.setRate(30);
  time.advance(101);
  assert.equal(sent.length, 3);
  assert.ok(sent[2].at - sent[1].at >= 1000 / 30 - 0.001);
});

test('pause clears queued frames but preserves backpressure until the old request completes', () => {
  const time = clock(), sent = [];
  const scheduler = new FrameScheduler(frame => sent.push(frame), time);
  const old = {}, resumed = {};
  scheduler.offer(old); scheduler.offer({}); scheduler.reset();
  time.advance(100); scheduler.offer(resumed);
  assert.deepEqual(sent, [old]);
  scheduler.complete(old);
  assert.deepEqual(sent, [old, resumed]);
  scheduler.complete(old);
  assert.equal(scheduler.busy, resumed, 'duplicate completion cannot release a newer request');
});

test('worker replacement releases its slot and cancels scheduled dispatch', () => {
  const time = clock(), sent = [];
  const scheduler = new FrameScheduler(frame => sent.push(frame), time);
  const old = {}, replacement = {};
  scheduler.offer(old); scheduler.reset({ cancelInFlight: true });
  scheduler.offer(replacement); scheduler.complete(old);
  assert.equal(scheduler.busy, replacement);
  scheduler.complete(replacement); scheduler.offer({}); scheduler.reset();
  time.advance(1000);
  assert.equal(sent.length, 2);
});

test('metrics distinguish accepted results, stale results and timing percentiles, then expire', () => {
  const metrics = new InferenceMetrics(); metrics.reset(0);
  metrics.record(20, 30, true, 100);
  metrics.record(40, 550, false, 200);
  const summary = metrics.summary(1000);
  assert.equal(summary.fps, 1); assert.equal(summary.dropped, 1);
  assert.equal(summary.inference.p95, 40); assert.equal(summary.latency.p95, 550);
  assert.equal(metrics.summary(5200).fps, 0);
  assert.equal(metrics.summary(5200).latency.median, null);
  metrics.record(undefined, 10, true, 5300);
  assert.equal(metrics.summary(5400).inference.median, null);
  metrics.reset(5500); assert.equal(metrics.summary(5600).fps, 0);
});
