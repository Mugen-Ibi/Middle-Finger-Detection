export const messages = [
  ['OH! YOU DID IT!', '本日の主役、決定。'],
  ['BOLD MOVE!', 'その一手、インパクト大。'],
  ['MESSAGE RECEIVED.', '言葉はいらない。伝わった。'],
  ['MAIN CHARACTER.', '主役の登場です。'],
  ['NO WORDS NEEDED.', '無言のメッセージ、受信完了。'],
  ['WHAT A MOMENT!', '今の一瞬に、拍手。'],
  ['LEVEL UP!', '自己主張レベルが上がった。'],
  ['STAY BOLD.', 'その勢いで、いこう。'],
];
// "Random" cycles through these four. Rainbow and "all" are chosen explicitly.
const effects = ['confetti', 'stars', 'fireworks', 'rings'];
const extraEffects = ['rainbow', 'all'];
export const effectNames = [...effects, ...extraEffects];
const palettes = {
  confetti: ['#ff2e93', '#27f0ff', '#ffe534', '#b6ff3d', '#ffffff'],
  stars: ['#ffe534', '#fff6a8', '#ffb347', '#ffffff'],
  fireworks: ['#ff6ec4', '#a98bff', '#5fe3ff', '#ffe534'],
  rings: ['#27f0ff', '#b6ff3d', '#a98bff', '#ff2e93', '#ffffff'],
};
const INTENSITY = [0.5, 0.8, 1, 1.4, 2];
const DURATION = 3;

// Each cycle uses every variation, including a non-repeating cycle boundary.
function shuffleDeck(values) {
  let queue = [], previous;
  return () => {
    if (!queue.length) {
      queue = [...values];
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      if (queue[0] === previous) [queue[0], queue[1]] = [queue[1], queue[0]];
    }
    previous = queue.shift();
    return previous;
  };
}

function star(ctx, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = i * Math.PI / points - Math.PI / 2, radius = i % 2 ? inner : outer;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
}

export class Celebration {
  constructor(banner, canvas) {
    this.banner = banner;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.nextMessage = shuffleDeck(messages);
    this.nextEffect = shuffleDeck(effects);
    this.frame = null;
    this.timer = null;
    this.layers = [];
  }

  // intensity: 1 to 5. combo adds a few more particles per chained gesture.
  play({ effect = 'random', mode = 'random', preset = 0, title = '', subtitle = '', preview = false, intensity = 3, combo = 1, max = false } = {}) {
    this.stop();
    this.effect = effectNames.includes(effect) ? effect : this.nextEffect();
    // Maximum Dopamine Mode always plays every effect, in three waves.
    if (max) this.effect = 'all';
    let text;
    if (mode === 'custom') text = [title.trim().slice(0, 60) || 'GESTURE DETECTED!', subtitle.trim().slice(0, 100)];
    else if (mode === 'preset') text = messages[preset] || messages[0];
    else text = this.nextMessage();
    this.banner.classList.toggle('long-text', text[0].length > 24 || text[1].length > 60);
    this.banner.dataset.effect = this.effect;
    this.banner.dataset.max = max ? 'true' : 'false';
    this.banner.dataset.combo = combo >= 10 ? 'max' : combo >= 5 ? 'high' : combo >= 2 ? 'chain' : 'none';
    this.banner.querySelector('span').textContent = preview ? 'EFFECT PREVIEW'
      : max ? (combo >= 2 ? `MAX DOPAMINE ×${combo}` : 'MAX DOPAMINE')
      : combo >= 2 ? `COMBO ×${combo}` : 'GESTURE DETECTED';
    this.banner.querySelector('strong').textContent = text[0];
    this.banner.querySelector('p').textContent = text[1];
    this.banner.hidden = false;
    this.started = performance.now();
    const level = INTENSITY[Math.min(Math.max(Math.round(intensity), 1), 5) - 1];
    const bonus = 1 + Math.min(Math.max(combo - 1, 0), 6) * 0.12;
    const share = max ? 0.4 : this.effect === 'all' ? 0.55 : 1;
    const names = this.effect === 'all' ? [...effects, 'rainbow'] : [this.effect];
    // Later waves are smaller so the frame rate holds up.
    const waves = max ? [[0, 1], [0.7, 0.6], [1.4, 0.6]] : [[0, 1]];
    this.layers = waves.flatMap(([delay, size]) => names.map(name => ({ name, delay, size }))).map(({ name, delay, size }) => ({
      name, delay,
      particles: Array.from({ length: name === 'rings' ? 0 : Math.min(160, Math.round(64 * level * bonus * share * size)) }, (_, i) => ({
        x: Math.random(), y: Math.random(), angle: Math.random() * Math.PI * 2,
        speed: 0.12 + Math.random() * 0.25, size: 3 + Math.random() * 5,
        color: (palettes[name] || palettes.rings)[i % (palettes[name] || palettes.rings).length], group: i % 3,
        hue: Math.random() * 360,
      })),
      rings: Math.round(4 * level * (this.effect === 'all' ? 0.7 : 1) * size),
    }));
    this.timer = setTimeout(() => this.stop(), DURATION * 1000);
    if (!this.motion.matches) this.draw(this.started);
    return { effect: this.effect, text };
  }

  stop() {
    clearTimeout(this.timer);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.timer = null;
    this.banner.hidden = true;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.layers = [];
  }

  draw(now) {
    const elapsed = (now - this.started) / 1000;
    if (elapsed >= DURATION) { this.stop(); return; }
    const { canvas, context: ctx } = this;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth; canvas.height = pixelHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Also honor motion preferences changed while an effect is running.
    if (this.motion.matches) { this.frame = null; return; }
    const fade = Math.min(1, (DURATION - elapsed) / 0.6);
    const unit = Math.min(width, height);
    for (const layer of this.layers) {
      const time = elapsed - layer.delay;
      if (time < 0) continue;
      if (layer.name === 'rings') this.drawRings(ctx, layer, time, width, height, unit, fade);
      else if (layer.name === 'rainbow') this.drawRainbow(ctx, layer, time, width, height, unit, fade);
      else this.drawParticles(ctx, layer, time, width, height, unit, fade);
    }
    ctx.globalAlpha = 1;
    this.frame = requestAnimationFrame(time => this.draw(time));
  }

  drawRings(ctx, layer, elapsed, width, height, unit, fade) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < layer.rings; i++) {
      const age = elapsed - i * 0.22;
      if (age < 0) continue;
      ctx.globalAlpha = Math.max(0, 1 - age / 2.2) * fade;
      ctx.strokeStyle = palettes.rings[i % palettes.rings.length];
      ctx.lineWidth = Math.max(2, 9 - age * 3);
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(width / 2, height / 2, (0.08 + age * 0.4) * unit, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // A spinning rainbow sunburst with sparks thrown from the middle.
  drawRainbow(ctx, layer, elapsed, width, height, unit, fade) {
    const cx = width / 2, cy = height * 0.48, reach = Math.hypot(width, height) * Math.min(1, elapsed * 2.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.rotate(elapsed * 1.2);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / 1.4) * 0.7 * fade;
    const rays = 24;
    for (let i = 0; i < rays; i++) {
      const a0 = (Math.PI * 2 * i) / rays, a1 = a0 + Math.PI / rays;
      ctx.fillStyle = `hsl(${Math.round(i * 360 / rays + elapsed * 120)} 100% 58%)`;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a0) * reach, Math.sin(a0) * reach); ctx.lineTo(Math.cos(a1) * reach, Math.sin(a1) * reach);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of layer.particles) {
      const radius = elapsed * (0.2 + p.speed * 1.6) * unit;
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 2.4) * fade;
      ctx.fillStyle = `hsl(${Math.round(p.hue + elapsed * 160)} 100% 62%)`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(p.angle) * radius, cy + Math.sin(p.angle) * radius + elapsed * elapsed * unit * 0.1, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(ctx, layer, elapsed, width, height, unit, fade) {
    for (const p of layer.particles) {
      ctx.save(); ctx.fillStyle = p.color; ctx.globalAlpha = fade;
      if (layer.name === 'confetti') {
        ctx.translate((p.x + Math.sin(elapsed * 2 + p.angle) * 0.06) * width,
          (-0.3 + p.y * 0.9 + elapsed * p.speed) * height);
        ctx.rotate(p.angle + elapsed * 3);
        ctx.scale(1, Math.cos(elapsed * 7 + p.angle));
        ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
      } else if (layer.name === 'stars') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * (0.7 + 0.3 * Math.sin(elapsed * 10 + p.angle));
        ctx.translate(p.x * width, (1.15 - p.y - elapsed * p.speed * 0.5) * height);
        ctx.rotate(p.angle + elapsed * 0.6);
        star(ctx, p.size * 1.8, p.size * 0.7); ctx.fill();
      } else {
        const age = elapsed - p.group * 0.4;
        if (age >= 0) {
          const origin = [(0.25 + p.group * 0.25) * width, (p.group === 1 ? 0.28 : 0.48) * height];
          const at = time => {
            const radius = time * p.speed * unit;
            return [origin[0] + Math.cos(p.angle) * radius, origin[1] + Math.sin(p.angle) * radius + time * time * unit * 0.06];
          };
          const head = at(age), tail = at(Math.max(0, age - 0.07));
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, 1 - age / 2.2) * fade;
          ctx.strokeStyle = p.color; ctx.lineCap = 'round'; ctx.lineWidth = p.size * 0.5;
          ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(head[0], head[1]); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}
