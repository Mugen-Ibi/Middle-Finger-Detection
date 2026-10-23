function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function angle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const length = Math.hypot(...u) * Math.hypot(...v);
  if (length < 1e-10) return 0;
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((s, x, i) => s + x * v[i], 0) / length))) * 180 / Math.PI;
}

function valid(points) {
  return Array.isArray(points) && points.length === 21 &&
    Array.from(points).every(p => p && [p.x, p.y, p.z].every(Number.isFinite));
}

function fingerStates(points) {
  return [5, 9, 13, 17].map(base => {
    const [mcp, pip, dip, tip] = points.slice(base, base + 4);
    const length = distance(mcp, pip);
    if (length < 1e-6) return { extended: false, curled: false };
    const bend = angle(mcp, pip, dip);
    const reach = distance(mcp, tip) / length;
    return { extended: bend > 155 && angle(pip, dip, tip) > 145 && reach > 1.5,
      curled: bend < 140 || reach < 1.3 };
  });
}

export function isMiddleFinger(points) {
  if (!valid(points)) return false;
  const fingers = fingerStates(points);
  return fingers[1].extended && [0, 2, 3].every(i => fingers[i].curled);
}

export const GESTURE_LABELS = Object.freeze({
  middle_finger: '中指', thumbs_up: 'いいね！', thumbs_down: 'Bad',
});

// Use metric world coordinates for shape, image coordinates for screen direction.
// Horizontal mirroring does not change up/down. Reject ambiguous sideways thumbs.
export function classifyGesture(world, image, aspectRatio = 1) {
  if (!valid(world)) return null;
  if (isMiddleFinger(world)) return 'middle_finger';
  if (!valid(image) || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  if (!fingerStates(world).every(f => f.curled)) return null;
  const palm = distance(world[5], world[17]);
  const thumbLength = distance(world[2], world[3]) + distance(world[3], world[4]);
  if (palm < 1e-6 || thumbLength < 1e-6 ||
      angle(world[2], world[3], world[4]) < 150 ||
      distance(world[2], world[4]) / thumbLength < 0.9 ||
      distance(world[4], world[5]) / palm < 0.55) return null;
  const dx = (image[4].x - image[2].x) * aspectRatio;
  const dy = image[4].y - image[2].y;
  const span = Math.hypot(dx, dy);
  const imagePalm = Math.hypot((image[5].x - image[17].x) * aspectRatio, image[5].y - image[17].y);
  if (imagePalm < 1e-6 || span < imagePalm * 0.35 || Math.abs(dy) / span < 0.6) return null;
  return dy < 0 ? 'thumbs_up' : 'thumbs_down';
}

export class GestureGate {
  constructor({ holdMs = 300, releaseMs = 450, maxGapMs = 600 } = {}) {
    Object.assign(this, { holdMs, releaseMs, maxGapMs });
    this.reset();
  }
  reset() { this.since = null; this.released = null; this.last = null; this.armed = true; this.samples = 0; this.candidate = null; }
  update(detected, now) {
    if (this.last !== null && (now < this.last || now - this.last > this.maxGapMs)) {
      this.since = null; this.released = null; this.samples = 0;
    }
    this.last = now;
    if (!detected) {
      this.since = null; this.samples = 0;
      this.released ??= now;
      if (now - this.released >= this.releaseMs) this.armed = true;
      return false;
    }
    this.released = null;
    // Different gesture classes must never contribute to the same stable hold.
    if (this.candidate !== detected) {
      this.candidate = detected; this.since = null; this.samples = 0;
    }
    this.since ??= now;
    this.samples++;
    if (this.armed && this.samples >= 3 && now - this.since >= this.holdMs) {
      this.armed = false;
      return true;
    }
    return false;
  }
}
