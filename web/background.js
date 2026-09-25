const imageExtensions = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
const videoExtensions = /\.(mp4|webm|ogv|mov|m4v)$/i;

function release(asset) {
  if (!asset) return;
  if (asset.kind === 'video') {
    asset.element.onerror = null;
    asset.element.pause();
    asset.element.removeAttribute('src');
    asset.element.load();
  } else asset.element.removeAttribute('src');
  if (asset.url) URL.revokeObjectURL(asset.url);
}

// Local files are decoded by the browser; neither bytes nor names reach the server.
export class MediaBackground {
  constructor(container, status, label = '背景') {
    this.container = container;
    this.status = status;
    this.label = label;
    this.asset = null;
    this.pending = null;
    this.generation = 0;
    this.visible = false;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', () => {
      if (this.visible && this.asset?.kind === 'video') this.playVideo(this.asset);
    });
  }

  async load(file) {
    const generation = ++this.generation;
    this.pending?.abort();
    this.pending = null;
    if (!file) return false;
    const kind = file.type.startsWith('image/') || (!file.type && imageExtensions.test(file.name)) ? 'image'
      : file.type.startsWith('video/') || (!file.type && videoExtensions.test(file.name)) ? 'video' : null;
    if (!kind) { this.status('画像または動画のファイルを選んでください。', true); return false; }
    const controller = new AbortController();
    this.pending = controller;
    const element = document.createElement(kind === 'image' ? 'img' : 'video');
    const candidate = { element, kind, url: URL.createObjectURL(file) };
    if (kind === 'video') {
      element.muted = true; element.defaultMuted = true; element.loop = true; element.playsInline = true;
      element.preload = 'auto';
    }
    this.status(`${this.label}を読み込んでいます…`);
    try {
      await new Promise((resolve, reject) => {
        const event = kind === 'image' ? 'load' : 'loadeddata';
        const finish = error => {
          clearTimeout(timer);
          element.removeEventListener(event, ready);
          element.removeEventListener('error', failed);
          controller.signal.removeEventListener('abort', abort);
          error ? reject(error) : resolve();
        };
        const ready = () => finish();
        const failed = () => finish(new Error('decode'));
        const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(new Error('timeout')), 15000);
        element.addEventListener(event, ready);
        element.addEventListener('error', failed);
        controller.signal.addEventListener('abort', abort, { once: true });
        element.src = candidate.url;
      });
      if (generation !== this.generation) { release(candidate); return false; }
      if (kind === 'image') {
        // Keep a static frame, including for animated image formats.
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 4096 / Math.max(element.naturalWidth, element.naturalHeight));
        canvas.width = Math.max(1, Math.round(element.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
        canvas.getContext('2d').drawImage(element, 0, 0, canvas.width, canvas.height);
        candidate.element = canvas;
        URL.revokeObjectURL(candidate.url); candidate.url = null;
      }
      this.hide();
      release(this.asset);
      this.asset = candidate;
      this.container.replaceChildren(candidate.element);
      if (kind === 'video') element.onerror = () => {
        if (this.asset !== candidate) return;
        this.clear();
        this.status('動画を再生できません。別の動画を選んでください。', true);
      };
      this.status(`${kind === 'image' ? '画像' : '動画'}を選択済み：${file.name}`);
      return true;
    } catch (error) {
      release(candidate);
      if (generation === this.generation && error.name !== 'AbortError') {
        this.status(`このファイルを読み込めません。別の画像・動画を選んでください。${this.asset ? `前の${this.label}は保持しています。` : ''}`, true);
      }
      return false;
    } finally {
      if (this.pending === controller) this.pending = null;
    }
  }

  show(fit = 'cover') {
    if (!this.asset) return;
    this.container.dataset.fit = fit === 'contain' ? 'contain' : 'cover';
    if (this.visible) return;
    this.visible = true;
    this.container.hidden = false;
    if (this.asset.kind === 'video') {
      this.asset.element.currentTime = 0;
      this.playVideo(this.asset);
    }
  }

  playVideo(asset) {
    if (this.motion.matches) { asset.element.pause(); return; }
    asset.element.play().catch(() => {
      if (this.asset === asset && this.visible) this.status('動画を再生できません。「演出を試す」で再試行するか、別の動画を選んでください。', true);
    });
  }

  hide() {
    this.visible = false;
    this.container.hidden = true;
    if (this.asset?.kind === 'video') this.asset.element.pause();
  }

  clear() {
    this.generation++;
    this.pending?.abort(); this.pending = null;
    this.hide();
    release(this.asset); this.asset = null;
    this.container.replaceChildren();
    this.status(`${this.label}ファイルは未選択です。`);
  }
}
