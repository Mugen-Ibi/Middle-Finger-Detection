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
const effects = ['confetti', 'stars', 'fireworks', 'rings'];
const palettes = {
  confetti: ['#c4f878', '#c8afff', '#ffd596', '#ffffff'],
  stars: ['#ffe49a', '#fff6d8', '#ffc36b', '#ffffff'],
  fireworks: ['#ff96c5', '#b6a0ff', '#87d9ff', '#ffe49a'],
  rings: ['#80f5d3', '#81c9ff', '#c8afff', '#ffffff'],
};

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
  }

  play({ effect = 'random', mode = 'random', preset = 0, title = '', subtitle = '', preview = false } = {}) {
    this.stop();
    this.effect = effects.includes(effect) ? effect : this.nextEffect();
    let text;
    if (mode === 'custom') text = [title.trim().slice(0, 60) || 'GESTURE DETECTED!', subtitle.trim().slice(0, 100)];
    else if (mode === 'preset') text = messages[preset] || messages[0];
    else text = this.nextMessage();
    this.banner.classList.toggle('long-text', text[0].length > 24 || text[1].length > 60);
    this.banner.dataset.effect = this.effect;
    this.banner.querySelector('span').textContent = preview ? 'EFFECT PREVIEW' : 'GESTURE DETECTED';
    this.banner.querySelector('strong').textContent = text[0];
    this.banner.querySelector('p').textContent = text[1];
    this.banner.hidden = false;
    this.started = performance.now();
    this.particles = Array.from({ length: 64 }, (_, i) => ({
      x: Math.random(), y: Math.random(), angle: Math.random() * Math.PI * 2,
      speed: 0.12 + Math.random() * 0.25, size: 3 + Math.random() * 5,
      color: palettes[this.effect][i % 4], group: i % 3,
    }));
    this.timer = setTimeout(() => this.stop(), 3000);
    if (!this.motion.matches) this.draw(this.started);
  }

  stop() {
    clearTimeout(this.timer);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.timer = null;
    this.banner.hidden = true;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles = [];
  }

  draw(now) {
    const elapsed = (now - this.started) / 1000;
    if (elapsed >= 3) { this.stop(); return; }
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
    const fade = Math.min(1, (3 - elapsed) / 0.6);
    const unit = Math.min(width, height);
    if (this.effect === 'rings') {
      for (let i = 0; i < 4; i++) {
        const age = elapsed - i * 0.3;
        if (age < 0) continue;
        ctx.globalAlpha = Math.max(0, 1 - age / 2.2) * fade;
        ctx.strokeStyle = palettes.rings[i]; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(width / 2, height / 2, (0.1 + age * 0.35) * unit, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      for (const p of this.particles) {
        ctx.save(); ctx.fillStyle = p.color; ctx.globalAlpha = fade;
        if (this.effect === 'confetti') {
          ctx.translate((p.x + Math.sin(elapsed * 2 + p.angle) * 0.06) * width,
            (-0.3 + p.y * 0.9 + elapsed * p.speed) * height);
          ctx.rotate(p.angle + elapsed * 2);
          ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
        } else if (this.effect === 'stars') {
          ctx.translate(p.x * width, (1.15 - p.y - elapsed * p.speed * 0.5) * height);
          ctx.rotate(p.angle + elapsed * 0.4);
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5 - Math.PI / 2, radius = p.size * (i % 2 ? 0.45 : 1.2);
            ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          }
          ctx.closePath(); ctx.fill();
        } else {
          const age = elapsed - p.group * 0.4;
          if (age >= 0) {
            const radius = age * p.speed * unit;
            ctx.globalAlpha = Math.max(0, 1 - age / 2.2) * fade;
            ctx.translate((0.25 + p.group * 0.25) * width + Math.cos(p.angle) * radius,
              (p.group === 1 ? 0.28 : 0.48) * height + Math.sin(p.angle) * radius + age * age * unit * 0.06);
            ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    this.frame = requestAnimationFrame(time => this.draw(time));
  }
}
