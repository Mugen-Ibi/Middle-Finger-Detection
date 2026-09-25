export const MAX_RESULT_AGE_MS = 450;

// Retain only metadata for the newest frame. A bitmap is created only on dispatch.
export class FrameScheduler {
  constructor(submit, { fps = 30, now = () => performance.now(),
    schedule = (callback, delay) => setTimeout(callback, delay), cancel = timer => clearTimeout(timer) } = {}) {
    Object.assign(this, { submit, fps, now, schedule, cancel });
    this.latest = null; this.busy = null; this.timer = null; this.lastStarted = -Infinity;
  }
  offer(frame) { this.latest = frame; this.pump(); }
  setRate(fps) {
    this.fps = fps;
    this.cancel(this.timer); this.timer = null;
    this.pump();
  }
  reset({ cancelInFlight = false } = {}) {
    this.latest = null;
    this.cancel(this.timer); this.timer = null; this.lastStarted = -Infinity;
    if (cancelInFlight) this.busy = null;
  }
  complete(frame) {
    if (this.busy !== frame) return;
    this.busy = null; this.pump();
  }
  pump() {
    if (this.busy || !this.latest || this.timer !== null) return;
    const wait = 1000 / this.fps - (this.now() - this.lastStarted);
    if (wait > 0) {
      this.timer = this.schedule(() => { this.timer = null; this.pump(); }, wait);
      return;
    }
    const frame = this.latest;
    this.latest = null; this.busy = frame; this.lastStarted = this.now();
    this.submit(frame);
  }
}

// A bounded five-second window, containing timing values only.
export class InferenceMetrics {
  constructor() { this.reset(); }
  reset(now = performance.now()) { this.started = now; this.samples = []; }
  record(inferenceMs, latencyMs, accepted, now = performance.now()) {
    this.samples.push({ now, inferenceMs, latencyMs, accepted });
    this.prune(now);
    if (this.samples.length > 300) this.samples.shift();
  }
  prune(now) { this.samples = this.samples.filter(sample => now - sample.now < 5000); }
  summary(now = performance.now()) {
    this.prune(now);
    const percentile = key => {
      const values = this.samples.map(sample => sample[key]).filter(Number.isFinite).sort((a, b) => a - b);
      return { median: values[Math.floor(values.length * 0.5)] ?? null,
        p95: values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] ?? null };
    };
    return { fps: this.samples.filter(sample => sample.accepted).length * 1000 / Math.max(1, Math.min(5000, now - this.started)),
      inference: percentile('inferenceMs'), latency: percentile('latencyMs'),
      dropped: this.samples.filter(sample => !sample.accepted).length };
  }
}
