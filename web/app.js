import { CameraController, cameraError, isDarkRGBA } from './camera.js';
import { GestureGate, isMiddleFinger } from './gesture.js';
import { Celebration, messages } from './celebration.js';
import { MediaBackground } from './background.js';
import { FingerMask } from './mask.js';

const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('landmarks'), context = overlay.getContext('2d');
const sample = document.createElement('canvas');
sample.width = 64; sample.height = 48;
const sampleContext = sample.getContext('2d', { willReadFrequently: true });
const gate = new GestureGate();
const party = new Celebration($('celebration'), $('confetti'));
const background = new MediaBackground($('media-background'), (text, error = false) => {
  $('background-status').textContent = text;
  $('background-status').classList.toggle('error', error);
});
const fingerMask = new FingerMask($('finger-mask'), $('mask-source'), (text, error = false) => {
  $('mask-status').textContent = text;
  $('mask-status').classList.toggle('error', error);
});
let poseActive = false, backgroundPreviewTimer = null, poseWatchdog = null;
let session = 0, active = false, starting = false, paused = false, closed = false;
let worker, modelReady = false, modelTimer, workerTimer, inFlight = null, requestId = 0;
let frameHandle, frameCount = 0, lastFrameAt = 0, lastSampleAt = 0, darkSince = null;
let fpsAt = 0, fpsFrames = 0, cameraName = '', lastError = '', modelStatus = '準備中';
let partyCount = 0, sessionToken = null, heartbeat;
const supportsCamera = Boolean(navigator.mediaDevices?.getUserMedia && video.requestVideoFrameCallback);
const camera = new CameraController(navigator.mediaDevices, () => {
  stopCamera();
  message('カメラとの接続が切れました。接続を確認して、もう一度開始してください。', 'error');
});

function message(text, kind = '') { $('message').textContent = text; $('message').className = `message ${kind}`; }
function diagnostics() {
  $('diagnostics').textContent = [
    'Gesture Party 2.0 / Browser Camera API',
    `カメラ: ${cameraName || '未接続'}`,
    `映像: ${active ? `${video.videoWidth} × ${video.videoHeight}` : '停止中'}`,
    `受信フレーム: ${frameCount}`,
    `認識モデル: ${modelStatus}`,
    `状態: ${$('message').textContent}`,
    `詳細: ${lastError || 'エラーなし'}`,
    '映像・音声・機器 ID は診断情報に含みません。',
  ].join('\n');
}
function controls() {
  $('start').disabled = starting || active || closed || !supportsCamera;
  $('stop').disabled = (!starting && !active) || closed;
  $('pause').disabled = !active || !modelReady;
  $('pause').textContent = paused ? '検出を再開' : '検出を一時停止';
  $('camera-select').disabled = starting || closed;
  $('refresh').disabled = starting || closed;
  $('effect-select').disabled = closed;
  $('preview-effect').disabled = closed;
  for (const id of ['message-mode', 'message-preset', 'custom-title', 'custom-subtitle']) $(id).disabled = closed;
  for (const id of ['background-mode', 'background-file', 'background-fit', 'clear-background']) $(id).disabled = closed;
  for (const id of ['mask-mode', 'mask-stamp', 'mask-file', 'mask-size', 'clear-mask']) $(id).disabled = closed;
  $('live-dot').classList.toggle('off', !active || frameCount === 0);
  $('camera-state').textContent = starting ? '接続しています' : active ? 'カメラ接続中' : 'カメラ停止中';
}

async function refreshDevices() {
  if (!supportsCamera) return;
  const selected = camera.stream?.getVideoTracks()[0]?.getSettings().deviceId || $('camera-select').value;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  $('camera-select').replaceChildren(new Option('ブラウザーの既定カメラ', ''));
  devices.forEach((device, i) => $('camera-select').add(new Option(device.label || `カメラ ${i + 1}（許可後に名前を表示）`, device.deviceId)));
  if (devices.some(d => d.deviceId === selected)) $('camera-select').value = selected;
}

function clearOverlay() { context.clearRect(0, 0, overlay.width, overlay.height); }
function stopCamera() {
  session++;
  camera.stop();
  if (frameHandle !== undefined) video.cancelVideoFrameCallback?.(frameHandle);
  frameHandle = undefined;
  active = false; starting = false; paused = false;
  video.srcObject = null;
  gate.reset(); clearOverlay();
  darkSince = null; stopScene();
  $('image-warning').hidden = true;
  $('placeholder').hidden = false;
  $('hand-state').textContent = '待機中'; $('gesture-state').textContent = '待機中';
  $('fps').textContent = '— fps'; $('resolution').textContent = '— × —';
  controls(); diagnostics();
}

async function waitForVideo() {
  let timer;
  try {
    await Promise.race([video.play(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new DOMException('No video frames received', 'TimeoutError')), 10000);
    })]);
  } finally { clearTimeout(timer); }
}

async function startCamera() {
  if (starting || closed) return;
  stopCamera();
  const current = session;
  starting = true; controls();
  message('カメラに接続しています。ブラウザーの許可表示が出たら、カメラへのアクセスを許可してください。');
  try {
    const stream = await camera.start($('camera-select').value);
    if (current !== session) return;
    video.srcObject = stream;
    await waitForVideo();
    if (current !== session) return;
    active = true; starting = false; frameCount = 0; fpsFrames = 0;
    lastFrameAt = fpsAt = performance.now(); lastSampleAt = 0; darkSince = null;
    cameraName = stream.getVideoTracks()[0].label || '選択したカメラ';
    $('active-camera').textContent = cameraName;
    $('placeholder').hidden = true;
    lastError = '';
    message('映像を受信しています。手全体をカメラに向けてください。', 'good');
    controls();
    frameHandle = video.requestVideoFrameCallback((now, metadata) => onFrame(current, now, metadata));
    await refreshDevices();
  } catch (error) {
    if (current !== session) return;
    stopCamera(); lastError = `${error.name}: ${error.message}`;
    message(cameraError(error), 'error'); diagnostics();
  }
}

function onFrame(current, now) {
  if (!active || session !== current) return;
  frameCount++; lastFrameAt = now;
  $('camera-state').textContent = '映像を受信中'; $('live-dot').classList.remove('off');
  if (now - fpsAt >= 1000) {
    $('fps').textContent = `${Math.round((frameCount - fpsFrames) * 1000 / (now - fpsAt))} fps`;
    $('resolution').textContent = `${video.videoWidth} × ${video.videoHeight}`;
    fpsAt = now; fpsFrames = frameCount; diagnostics();
  }
  if (now - lastSampleAt >= 500) {
    lastSampleAt = now;
    sampleContext.drawImage(video, 0, 0, 64, 48);
    const dark = isDarkRGBA(sampleContext.getImageData(0, 0, 64, 48).data);
    darkSince = dark ? darkSince ?? now : null;
    const muted = camera.stream?.getVideoTracks()[0]?.muted;
    $('image-warning').hidden = !muted && !(darkSince !== null && now - darkSince >= 3000);
    $('image-warning').textContent = muted ? 'カメラからの映像が一時停止しています。接続元の機器を確認してください。'
      : '映像は届いていますが、ほぼ黒です。選択したカメラ・カメラカバー・スマートフォン側の映像を確認してください。';
  }
  if (modelReady && !paused && inFlight === null && !document.hidden) submitFrame(current, now);
  frameHandle = video.requestVideoFrameCallback((time, metadata) => onFrame(current, time, metadata));
}

async function submitFrame(generation, timestamp) {
  const id = ++requestId, target = worker;
  inFlight = id;
  try {
    const width = Math.min(video.videoWidth, 640);
    const frame = await createImageBitmap(video, { resizeWidth: width,
      resizeHeight: Math.max(1, Math.round(video.videoHeight * width / video.videoWidth)) });
    if (generation !== session || paused || target !== worker || !modelReady) {
      frame.close(); if (inFlight === id) inFlight = null; return;
    }
    target.postMessage({ type: 'frame', frame, timestamp, generation, id }, [frame]);
    workerTimer = setTimeout(() => modelFailed('認識処理が応答しません。再読み込みをお試しください。'), 15000);
  } catch (error) {
    if (inFlight === id) inFlight = null;
    if (generation === session) modelFailed(error.message);
  }
}

function modelFailed(detail) {
  gate.reset(); stopScene();
  clearTimeout(modelTimer); clearTimeout(workerTimer);
  worker?.terminate(); worker = null; modelReady = false; inFlight = null;
  modelStatus = '読み込み失敗'; $('model-state').textContent = modelStatus;
  $('retry-model').hidden = false;
  $('hand-state').textContent = '検出できません';
  lastError = `Model: ${detail}`;
  clearOverlay(); controls(); diagnostics();
}
function initModel() {
  stopScene();
  clearTimeout(modelTimer); clearTimeout(workerTimer); worker?.terminate();
  modelReady = false; inFlight = null; gate.reset();
  modelStatus = '準備中'; $('model-state').textContent = modelStatus; $('retry-model').hidden = true;
  controls();
  try {
    const current = new Worker('./inference-worker.js');
    worker = current;
    modelTimer = setTimeout(() => modelFailed('モデル初期化がタイムアウトしました。'), 45000);
    current.onerror = event => { if (worker === current) modelFailed(event.message); };
    current.onmessage = ({ data }) => {
      if (worker !== current) return;
      if (data.type === 'ready') {
        clearTimeout(modelTimer); modelReady = true;
        modelStatus = '準備完了'; $('model-state').textContent = modelStatus; controls(); diagnostics();
      } else if (data.type === 'error') modelFailed(data.message);
      else if (data.type === 'result') {
        if (inFlight === data.id) { inFlight = null; clearTimeout(workerTimer); }
        if (data.generation !== session || !active || paused || document.hidden) return;
        const hands = data.landmarks.length;
        $('hand-state').textContent = hands ? `${hands} 手を検出` : '手を探しています';
        drawLandmarks(data.landmarks);
        const detected = data.worldLandmarks.some(isMiddleFinger);
        fingerMask.update(data.landmarks.filter((_, i) => isMiddleFinger(data.worldLandmarks[i])), video.videoWidth, video.videoHeight);
        $('gesture-state').textContent = detected ? '中指を検出' : '待機中';
        if (gate.update(detected, performance.now())) { poseActive = true; celebrate(); }
        if (gate.armed) poseActive = false;
        syncBackground();
        clearTimeout(poseWatchdog);
        poseWatchdog = setTimeout(() => { gate.reset(); poseActive = false; syncBackground(); }, 1200);
      }
    };
    current.postMessage({ type: 'init' });
  } catch (error) { modelFailed(error.message); }
}

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawLandmarks(hands) {
  const width = video.videoWidth, height = video.videoHeight;
  if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
  clearOverlay();
  if (!$('show-landmarks').checked) return;
  context.strokeStyle = '#c4f878'; context.fillStyle = '#eaffd7'; context.lineWidth = Math.max(2, width / 420);
  hands.forEach(points => {
    context.beginPath();
    connections.forEach(([a, b]) => { context.moveTo(points[a].x * width, points[a].y * height); context.lineTo(points[b].x * width, points[b].y * height); });
    context.stroke();
    points.forEach(p => { context.beginPath(); context.arc(p.x * width, p.y * height, Math.max(3, width / 230), 0, Math.PI * 2); context.fill(); });
  });
}

function celebrate() {
  partyCount++; $('count').textContent = String(partyCount).padStart(2, '0');
  party.play(partyOptions());
}

function partyOptions() {
  return { effect: $('effect-select').value, mode: $('message-mode').value,
    preset: Number($('message-preset').value), title: $('custom-title').value, subtitle: $('custom-subtitle').value };
}

function syncBackground() {
  if ($('background-mode').value === 'media' && (poseActive || backgroundPreviewTimer !== null)) {
    background.show($('background-fit').value);
  } else background.hide();
}
function stopScene() {
  party.stop(); poseActive = false;
  clearTimeout(poseWatchdog); clearTimeout(backgroundPreviewTimer);
  poseWatchdog = backgroundPreviewTimer = null;
  background.hide();
  fingerMask.hide();
}
$('background-mode').onchange = () => {
  $('background-fields').hidden = $('background-mode').value !== 'media';
  syncBackground();
};
$('background-fit').onchange = syncBackground;
$('background-file').onchange = async () => {
  const file = $('background-file').files[0];
  if (!file) return;
  if (await background.load(file)) syncBackground();
  // Allow choosing the same file again after a decoding error.
  $('background-file').value = '';
};
$('clear-background').onclick = () => { background.clear(); $('background-file').value = ''; };
function maskSettings() {
  $('mask-stamp-fields').hidden = $('mask-mode').value !== 'stamp';
  $('mask-media-fields').hidden = $('mask-mode').value !== 'media';
  $('mask-size-fields').hidden = $('mask-mode').value === 'off';
  $('mask-size-value').textContent = `${$('mask-size').value}%`;
  fingerMask.configure({ mode: $('mask-mode').value, stamp: $('mask-stamp').value,
    size: Number($('mask-size').value) / 100, mirrored: $('mirror').checked });
}
$('mask-mode').onchange = maskSettings;
$('mask-stamp').onchange = maskSettings;
$('mask-size').oninput = maskSettings;
$('mask-file').onchange = async () => {
  const file = $('mask-file').files[0];
  if (!file) return;
  if (await fingerMask.media.load(file)) maskSettings();
  $('mask-file').value = '';
};
$('clear-mask').onclick = () => { fingerMask.media.clear(); fingerMask.hide(); $('mask-file').value = ''; };
maskSettings();
messages.forEach(([title, subtitle], i) => $('message-preset').add(new Option(`${title} / ${subtitle}`, String(i))));
function messageMode() {
  $('preset-fields').hidden = $('message-mode').value !== 'preset';
  $('custom-fields').hidden = $('message-mode').value !== 'custom';
}
$('message-mode').onchange = messageMode;
messageMode();
$('preview-effect').onclick = () => {
  $('stage').scrollIntoView({ block: 'nearest', behavior: 'instant' });
  party.play({ ...partyOptions(), preview: true });
  clearTimeout(backgroundPreviewTimer);
  background.hide();
  backgroundPreviewTimer = setTimeout(() => { backgroundPreviewTimer = null; syncBackground(); }, 3000);
  syncBackground();
  fingerMask.preview();
};

$('start').onclick = startCamera;
$('stop').onclick = () => { stopCamera(); message('カメラを停止しました。映像の取得も停止しています。'); };
$('refresh').onclick = () => refreshDevices().catch(error => { message(cameraError(error), 'error'); });
$('camera-select').onchange = () => {
  if (active) { stopCamera(); message('カメラを変更しました。「カメラを開始」で選択した機器を接続します。'); }
};
$('pause').onclick = () => {
  paused = !paused; gate.reset(); clearOverlay(); stopScene();
  $('hand-state').textContent = paused ? '一時停止中' : '手を探しています'; $('gesture-state').textContent = '待機中';
  controls();
};
$('mirror').onchange = () => {
  $('video-stack').classList.toggle('mirrored', $('mirror').checked);
  maskSettings();
};
$('show-landmarks').onchange = clearOverlay;
$('retry-model').onclick = initModel;
$('copy-diagnostics').onclick = async () => {
  diagnostics();
  try { await navigator.clipboard.writeText($('diagnostics').textContent); $('copy-diagnostics').textContent = 'コピーしました'; }
  catch { $('copy-diagnostics').textContent = '上の診断情報を選択してコピーしてください'; }
};

async function serverPost(path) {
  if (!sessionToken) throw new Error('Local server session unavailable');
  const response = await fetch(path, { method: 'POST', headers: { 'X-Session-Token': sessionToken } });
  if (!response.ok) throw new Error(`Local server: ${response.status}`);
}
$('quit').onclick = async () => {
  stopCamera(); worker?.terminate(); clearInterval(heartbeat); clearTimeout(modelTimer); clearTimeout(workerTimer);
  background.clear(); $('background-file').value = '';
  fingerMask.media.clear(); $('mask-file').value = '';
  closed = true; controls(); $('quit').disabled = true;
  try { await serverPost('/api/quit'); message('終了しました。このタブを閉じてください。'); }
  catch { message('カメラは停止しました。このタブを閉じてください。ローカルサーバーは無操作で自動終了します。'); }
};
window.addEventListener('pagehide', () => { stopCamera(); background.clear(); fingerMask.media.clear(); worker?.terminate(); clearInterval(heartbeat); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
document.addEventListener('visibilitychange', () => {
  gate.reset();
  if (document.hidden) stopScene();
  if (!document.hidden) lastFrameAt = performance.now();
});
navigator.mediaDevices?.addEventListener('devicechange', () => refreshDevices().catch(() => {}));
setInterval(() => {
  if (active && !document.hidden && performance.now() - lastFrameAt > 10000) {
    stopCamera(); message('映像の更新が止まりました。接続先を確認し、もう一度開始してください。', 'error');
  }
}, 1000);

if (!supportsCamera) message('このブラウザーは対応していません。最新の Microsoft Edge または Google Chrome で開いてください。', 'error');
else refreshDevices().catch(error => message(cameraError(error), 'error'));
controls(); initModel(); diagnostics();
fetch('/api/session').then(r => r.json()).then(data => {
  sessionToken = data.token;
  heartbeat = setInterval(() => serverPost('/api/heartbeat').catch(() => {
    message('ローカルサーバーとの接続が切れました。アプリを起動し直してください。', 'error');
  }), 15000);
}).catch(() => message('ローカルサーバーに接続できません。exe または起動スクリプトから開いてください。', 'error'));
