function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function angle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const length = Math.hypot(...u) * Math.hypot(...v);
  if (length < 1e-10) return 0;
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((s, x, i) => s + x * v[i], 0) / length))) * 180 / Math.PI;
}

export function isMiddleFinger(points) {
  if (points?.length !== 21 || points.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) return false;
  const fingers = [5, 9, 13, 17].map(base => {
    const [mcp, pip, dip, tip] = points.slice(base, base + 4);
    const length = distance(mcp, pip);
    if (length < 1e-6) return { extended: false, curled: false };
    const bend = angle(mcp, pip, dip);
    const reach = distance(mcp, tip) / length;
    return { extended: bend > 155 && angle(pip, dip, tip) > 145 && reach > 1.5,
      curled: bend < 140 || reach < 1.3 };
  });
  return fingers[1].extended && [0, 2, 3].every(i => fingers[i].curled);
}

export class GestureGate {
  constructor({ holdMs = 300, releaseMs = 450, maxGapMs = 600 } = {}) {
    Object.assign(this, { holdMs, releaseMs, maxGapMs });
    this.reset();
  }
  reset() { this.since = null; this.released = null; this.last = null; this.armed = true; this.samples = 0; }
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
    this.since ??= now;
    this.samples++;
    if (this.armed && this.samples >= 3 && now - this.since >= this.holdMs) {
      this.armed = false;
      return true;
    }
    return false;
  }
}
