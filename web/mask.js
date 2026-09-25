import { MediaBackground } from './background.js';

// Map normalized camera landmarks through object-fit: contain, then mirror.
export function fingerMaskBounds(points, videoWidth, videoHeight, width, height, mirrored = false, size = 1.3) {
  if (![videoWidth, videoHeight, width, height, size].every(v => Number.isFinite(v) && v > 0)) return null;
  if (!points || [5, 9, 10, 11, 12, 13].some(i => !Number.isFinite(points[i]?.x) || !Number.isFinite(points[i]?.y))) return null;
  const fit = Math.min(width / videoWidth, height / videoHeight);
  const viewWidth = videoWidth * fit, viewHeight = videoHeight * fit;
  const map = p => ({ x: (width - viewWidth) / 2 + (mirrored ? 1 - p.x : p.x) * viewWidth,
    y: (height - viewHeight) / 2 + p.y * viewHeight });
  const finger = points.slice(9, 13).map(map), base = finger[0], tip = finger[3];
  const length = Math.hypot(tip.x - base.x, tip.y - base.y);
  if (length < 2) return null;
  const ux = (tip.x - base.x) / length, uy = (tip.y - base.y) / length;
  const along = finger.map(p => (p.x - base.x) * ux + (p.y - base.y) * uy);
  const across = finger.map(p => -(p.x - base.x) * uy + (p.y - base.y) * ux);
  const middle = (Math.min(...along) + Math.max(...along)) / 2;
  const side = (Math.min(...across) + Math.max(...across)) / 2;
  const left = map(points[5]), right = map(points[13]);
  const thickness = Math.max(Math.hypot(left.x - right.x, left.y - right.y) * 0.36, length * 0.3, 6);
  const scale = Math.max(0.8, Math.min(size, 2));
  return { x: base.x + middle * ux - side * uy, y: base.y + middle * uy + side * ux,
    width: (Math.max(...across) - Math.min(...across) + thickness) * scale,
    height: (Math.max(...along) - Math.min(...along) + length * 0.2) * scale,
    angle: Math.atan2(uy, ux) + Math.PI / 2 };
}

function stamp(ctx, type, width, height) {
  ctx.fillStyle = '#151b21'; ctx.fillRect(-width / 2, -height / 2, width, height);
  if (type === 'mosaic') {
    const cell = width / 4, colors = ['#243549', '#59768e', '#91aabb', '#d0dce3'];
    for (let y = 0; y < height / cell; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = colors[(x * 3 + y * 7) % colors.length];
      ctx.fillRect(-width / 2 + x * cell, -height / 2 + y * cell, cell + 1, cell + 1);
    }
    return;
  }
  if (type === 'bar') {
    ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.min(width * 0.27, height / 7)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CENSORED', 0, 0); return;
  }
  const radius = Math.min(width * 0.4, height * 0.35);
  ctx.fillStyle = type === 'heart' ? '#ff7ca9' : '#ffe18a';
  ctx.beginPath();
  if (type === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2, r = radius * (i % 2 ? 0.45 : 1);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  } else if (type === 'heart') {
    ctx.moveTo(0, radius);
    ctx.bezierCurveTo(-radius * 2, -radius * 0.3, -radius * 0.7, -radius * 1.6, 0, -radius * 0.5);
    ctx.bezierCurveTo(radius * 0.7, -radius * 1.6, radius * 2, -radius * 0.3, 0, radius); ctx.fill();
  } else if (type === 'smile') {
    ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#151b21';
    for (const x of [-0.33, 0.33]) { ctx.beginPath(); ctx.arc(x * radius, -radius * 0.22, radius * 0.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#151b21'; ctx.lineWidth = radius * 0.1;
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.55, 0.15, Math.PI - 0.15); ctx.stroke();
  } else {
    ctx.strokeStyle = '#ff7782'; ctx.lineWidth = radius * 0.2;
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.moveTo(-radius * 0.6, radius * 0.6); ctx.lineTo(radius * 0.6, -radius * 0.6); ctx.stroke();
  }
}

export class FingerMask {
  constructor(canvas, source, status) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.media = new MediaBackground(source, status, 'マスク');
    this.options = { mode: 'off', stamp: 'bar', size: 1.3, mirrored: true };
    this.hands = []; this.updated = 0; this.previewUntil = 0; this.frame = null;
  }

  configure(options) { Object.assign(this.options, options); this.start(); }
  update(hands, width, height) {
    this.hands = hands; this.videoWidth = width; this.videoHeight = height;
    this.updated = performance.now(); this.start();
  }
  preview() { this.previewUntil = performance.now() + 3000; this.media.hide(); this.start(); }
  start() { if (this.frame === null) this.draw(performance.now()); }
  hide() {
    this.hands = []; this.previewUntil = 0;
    this.clear();
  }
  clear() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null; this.canvas.hidden = true; this.media.hide();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(now) {
    const { canvas, ctx, options } = this;
    const width = canvas.parentElement.clientWidth, height = canvas.parentElement.clientHeight;
    let bounds = [];
    if (now < this.previewUntil) {
      bounds = [{ x: width / 2, y: height / 2, width: height * 0.15 * options.size,
        height: height * 0.5 * options.size, angle: -0.15 }];
    } else if (now - this.updated < 450) {
      bounds = this.hands.map(points => fingerMaskBounds(points, this.videoWidth, this.videoHeight, width, height, options.mirrored, options.size)).filter(Boolean);
    }
    if (options.mode === 'off' || !bounds.length || (options.mode === 'media' && !this.media.asset)) { this.clear(); return; }
    if (options.mode === 'media') this.media.show(); else this.media.hide();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    canvas.hidden = false;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    for (const box of bounds) {
      ctx.save(); ctx.translate(box.x, box.y); ctx.rotate(box.angle);
      ctx.beginPath(); ctx.roundRect(-box.width / 2, -box.height / 2, box.width, box.height, Math.min(box.width, box.height) * 0.15); ctx.clip();
      ctx.fillStyle = '#151b21'; ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height);
      if (options.mode === 'stamp') stamp(ctx, options.stamp, box.width, box.height);
      else {
        const source = this.media.asset.element, sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
        if (sw && sh && (!('readyState' in source) || source.readyState >= 2)) {
          const scale = Math.max(box.width / sw, box.height / sh);
          ctx.drawImage(source, -sw * scale / 2, -sh * scale / 2, sw * scale, sh * scale);
        }
      }
      ctx.restore();
    }
    this.frame = requestAnimationFrame(time => this.draw(time));
  }
}
