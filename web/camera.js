export function cameraError(error) {
  const messages = {
    NotAllowedError: 'カメラが許可されていません。アドレスバーのカメラ設定で許可し、もう一度開始してください。',
    NotFoundError: 'カメラが見つかりません。接続を確認して「一覧を更新」を押してください。',
    NotReadableError: 'カメラを開始できません。Windows カメラ・会議アプリを閉じ、接続を確認して再試行してください。',
    OverconstrainedError: '選択したカメラは現在利用できません。一覧を更新して選び直してください。',
    TimeoutError: 'カメラの開始がタイムアウトしました。ブラウザーの許可表示と接続先のカメラを確認してください。',
    AbortError: 'カメラの開始が中断されました。もう一度開始してください。',
  };
  return messages[error?.name] || `カメラを開始できませんでした（${error?.name || 'UnknownError'}）。再接続をお試しください。`;
}

export const releaseStream = stream => stream?.getTracks().forEach(track => track.stop());

export class CameraController {
  constructor(mediaDevices, onEnded = () => {}, timeoutMs = 15000) {
    this.mediaDevices = mediaDevices;
    this.onEnded = onEnded;
    this.timeoutMs = timeoutMs;
    this.generation = 0;
    this.stream = null;
  }
  stop() {
    this.generation++;
    this.cancel?.();
    this.cancel = null;
    releaseStream(this.stream);
    this.stream = null;
  }
  async start(deviceId = '') {
    this.stop();
    const generation = this.generation;
    let expired = false;
    let timer;
    const abandoned = new Promise((_, reject) => {
      this.cancel = () => { expired = true; reject(new DOMException('Cancelled', 'AbortError')); };
      timer = setTimeout(() => {
        expired = true;
        reject(new DOMException('Camera request timed out', 'TimeoutError'));
      }, this.timeoutMs);
    });
    const request = Promise.resolve().then(() => this.mediaDevices.getUserMedia({
      audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true,
    })).then(stream => {
      if (expired || generation !== this.generation) {
        releaseStream(stream);
        throw new DOMException('Cancelled', 'AbortError');
      }
      return stream;
    });
    try {
      const stream = await Promise.race([request, abandoned]);
      if (generation !== this.generation) {
        releaseStream(stream);
        throw new DOMException('Cancelled', 'AbortError');
      }
      this.stream = stream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (this.stream === stream) { this.stop(); this.onEnded(); }
      }, { once: true }));
      return stream;
    } finally {
      clearTimeout(timer);
      if (generation === this.generation) this.cancel = null;
    }
  }
}

export function isDarkRGBA(pixels) {
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 16) visible++;
  }
  return visible / (pixels.length / 4) < 0.005;
}
