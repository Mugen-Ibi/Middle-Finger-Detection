import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

let browser, server, url;
before(async () => {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  url = `http://127.0.0.1:${port}`;
  const python = process.env.PYTHON || (existsSync('.venv/Scripts/python.exe') ? '.venv/Scripts/python.exe' : 'python');
  const command = process.env.LAUNCHER_EXE || python;
  server = spawn(command, [...(process.env.LAUNCHER_EXE ? [] : ['app.py']), '--no-browser', '--port', String(port), '--idle-seconds', '0'], { stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clearInterval(poll); reject(new Error('Server did not start')); }, 15000);
    const poll = setInterval(async () => {
      try { if ((await fetch(`${url}/api/session`)).ok) { clearInterval(poll); clearTimeout(timer); resolve(); } }
      catch { /* Wait for extraction/startup. */ }
    }, 100);
    server.once('error', error => { clearInterval(poll); clearTimeout(timer); reject(error); });
  });
  browser = await chromium.launch({ headless: true,
    channel: process.env.BROWSER_CHANNEL || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  await mkdir('test-results', { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server) {
    try {
      const { token } = await (await fetch(`${url}/api/session`)).json();
      await fetch(`${url}/api/quit`, { method: 'POST', headers: { Origin: url, 'X-Session-Token': token } });
      await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch { /* Failed startup. */ }
    if (server.exitCode === null) server.kill();
  }
});

async function pageFor(t, initialize) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  t.after(() => context.close());
  if (initialize) await initialize(context);
  const page = await context.newPage();
  await page.goto(url);
  return page;
}
async function waitText(page, id, text) {
  await page.waitForFunction(([id, text]) => document.getElementById(id).textContent.includes(text), [id, text], { timeout: 45000 });
}
async function start(page) {
  await page.getByRole('button', { name: 'カメラを開始' }).click();
  await waitText(page, 'camera-state', '映像を受信中');
}

test('real WASM model, preview, pause, stop and restart work without external requests', async t => {
  const page = await pageFor(t);
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith(url)) external.push(r.url()); });
  await waitText(page, 'model-state', '準備完了');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await start(page);
  await waitText(page, 'hand-state', '手を探しています');
  assert.equal(await page.locator('#image-warning').isVisible(), false);
  await page.getByRole('button', { name: '検出を一時停止' }).click();
  await waitText(page, 'hand-state', '一時停止中');
  await page.getByRole('button', { name: '検出を再開' }).click();
  await waitText(page, 'hand-state', '手を探しています');
  await page.locator('#stop').click();
  assert.equal(await page.locator('#video').evaluate(video => video.srcObject), null);
  assert.equal(await page.locator('#placeholder').isVisible(), true);
  await start(page);
  await waitText(page, 'hand-state', '手を探しています');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});

test('permission rejection is explained and start can be retried', async t => {
  const page = await pageFor(t, context => context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  }));
  await page.locator('#start').click();
  await waitText(page, 'message', 'カメラが許可されていません');
  assert.equal(await page.locator('#start').isEnabled(), true);
  assert.equal(await page.locator('#stop').isEnabled(), false);
});

test('real worker detects hands in the official fixture and rejects open palms as middle fingers', async t => {
  const page = await pageFor(t);
  const image = (await readFile('tests/fixtures/right_hands.jpg')).toString('base64');
  const output = await page.evaluate(async base64 => {
    const { isMiddleFinger } = await import('/gesture.js');
    const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    const frame = await createImageBitmap(image);
    const worker = new Worker('/inference-worker.js');
    let timer;
    try {
      const result = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Worker timed out')), 45000);
        worker.onerror = event => reject(new Error(event.message));
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready') worker.postMessage({ type: 'frame', frame, timestamp: 1, generation: 1, id: 1 }, [frame]);
          if (data.type === 'result') resolve(data);
          if (data.type === 'error') reject(new Error(data.message));
        };
        worker.postMessage({ type: 'init' });
      });
      return { hands: result.landmarks.length, points: result.landmarks.map(points => points.length),
        middle: result.worldLandmarks.some(isMiddleFinger) };
    } finally { clearTimeout(timer); worker.terminate(); frame.close(); }
  }, image);
  assert.equal(output.hands, 2); assert.deepEqual(output.points, [21, 21]); assert.equal(output.middle, false);
});

test('stop is responsive while the permission request is unresolved', async t => {
  const page = await pageFor(t, context => context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  }));
  await page.locator('#start').click();
  await page.locator('#stop').click();
  await waitText(page, 'message', 'カメラを停止しました');
  assert.equal(await page.locator('#start').isEnabled(), true);
});

test('black live frames are reported independently of successful connection', async t => {
  const page = await pageFor(t, context => context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext('2d');
      setInterval(() => { context.fillStyle = 'black'; context.fillRect(0, 0, 320, 240); }, 50);
      return canvas.captureStream(20);
    };
  }));
  await start(page);
  await page.locator('#image-warning').waitFor({ state: 'visible', timeout: 10000 });
  assert.match(await page.locator('#image-warning').textContent(), /ほぼ黒/);
  assert.match(await page.locator('#camera-state').textContent(), /映像を受信中/);
});

test('model load failure does not prevent camera preview and can be retried', async t => {
  const page = await pageFor(t, context => context.route('**/models/hand_landmarker.task', route => route.fulfill({ status: 404, body: 'test missing model' })));
  await waitText(page, 'model-state', '読み込み失敗');
  await start(page);
  assert.equal(await page.locator('#retry-model').isVisible(), true);
  await page.context().unroute('**/models/hand_landmarker.task');
  await page.locator('#retry-model').click();
  await waitText(page, 'model-state', '準備完了');
  await waitText(page, 'hand-state', '手を探しています');
});

test('narrow screens keep controls reachable without horizontal overflow', async t => {
  const page = await pageFor(t);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await start(page);
  await page.locator('#stop').click();
  await waitText(page, 'message', 'カメラを停止しました');
});

test('celebration modes preview all variations without camera access or counting', async t => {
  const page = await pageFor(t, context => context.addInitScript(() => {
    window.cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.cameraRequests++; throw new Error('Unexpected camera access'); };
  }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const titles = [], effects = [];
  for (let i = 0; i < 16; i++) {
    await page.locator('#preview-effect').click();
    titles.push(await page.locator('#celebration strong').textContent());
    effects.push(await page.locator('#celebration').getAttribute('data-effect'));
  }
  assert.equal(new Set(titles.slice(0, 8)).size, 8);
  assert.equal(new Set(titles.slice(8)).size, 8);
  for (let i = 1; i < titles.length; i++) assert.notEqual(titles[i], titles[i - 1]);
  for (let i = 0; i < 16; i += 4) assert.equal(new Set(effects.slice(i, i + 4)).size, 4);
  for (let i = 1; i < effects.length; i++) assert.notEqual(effects[i], effects[i - 1]);
  await page.locator('#message-mode').selectOption('preset');
  await page.locator('#message-preset').selectOption('2');
  for (const effect of ['confetti', 'stars', 'fireworks', 'rings']) {
    await page.locator('#effect-select').selectOption(effect);
    await page.locator('#preview-effect').click();
    assert.equal(await page.locator('#celebration strong').textContent(), 'MESSAGE RECEIVED.');
    assert.equal(await page.locator('#celebration').getAttribute('data-effect'), effect);
    await page.waitForFunction(() => {
      const canvas = document.getElementById('confetti');
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 0);
    });
  }
  await page.screenshot({ path: 'test-results/celebration-rings.png', fullPage: true });
  await page.locator('#message-mode').selectOption('custom');
  const literal = '<img src=x onerror=alert(1)>';
  await page.locator('#custom-title').fill(literal);
  await page.locator('#custom-subtitle').fill('自分だけのメッセージ');
  await page.locator('#preview-effect').click();
  assert.equal(await page.locator('#celebration strong').textContent(), literal);
  assert.equal(await page.locator('#celebration img').count(), 0);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator('#custom-title').fill('祝'.repeat(60));
  await page.locator('#custom-subtitle').fill('福'.repeat(100));
  await page.locator('#preview-effect').click();
  assert.equal(await page.evaluate(() => {
    const box = document.getElementById('stage').getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth && [...document.querySelector('#celebration').children].every(el => {
      const child = el.getBoundingClientRect();
      return child.top >= box.top && child.bottom <= box.bottom && child.left >= box.left && child.right <= box.right;
    });
  }), true);
  await page.locator('#stage').screenshot({ path: 'test-results/celebration-custom-mobile.png' });
  await page.locator('#custom-title').fill('');
  await page.locator('#custom-subtitle').fill('');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#preview-effect').click();
  assert.equal(await page.locator('#celebration strong').textContent(), 'GESTURE DETECTED!');
  assert.equal(await page.locator('#celebration strong').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('#confetti').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(v => v === 0)), true);
  await page.locator('#celebration').waitFor({ state: 'hidden', timeout: 5000 });
  assert.equal(await page.locator('#count').textContent(), '00');
  assert.equal(await page.evaluate(() => window.cameraRequests), 0);
  assert.deepEqual(errors, []);
  await page.reload();
  assert.equal(await page.locator('#message-mode').inputValue(), 'random');
  assert.equal(await page.locator('#custom-title').inputValue(), '');
});

test('accepted gestures use the selected custom text and effect; pause and stop clear particles', async t => {
  const page = await pageFor(t, context => context.addInitScript(() => {
    // Control inference results while exercising the actual camera, gate and UI path.
    window.raised = false;
    window.Worker = class {
      postMessage(data) {
        if (data.type === 'init') { queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); return; }
        data.frame.close();
        const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
        for (const base of [5, 9, 13, 17]) {
          const x = base / 10, extended = base === 9;
          points[base] = { x, y: 0, z: 0 };
          points[base + 1] = { x, y: 1, z: 0 };
          points[base + 2] = { x: x + (extended ? 0 : 0.3), y: extended ? 1.7 : 0.6, z: 0 };
          points[base + 3] = { x, y: extended ? 2.3 : 0.3, z: 0 };
        }
        setTimeout(() => this.onmessage?.({ data: { type: 'result', generation: data.generation, id: data.id,
          landmarks: [], worldLandmarks: window.raised ? [points] : [] } }), 0);
      }
      terminate() { this.onmessage = null; }
    };
  }));
  await page.locator('#message-mode').selectOption('custom');
  await page.locator('#custom-title').fill('ナイスジェスチャー！');
  await page.locator('#custom-subtitle').fill('届きました。');
  await page.locator('#effect-select').selectOption('fireworks');
  await start(page);
  await page.evaluate(() => { window.raised = true; });
  await waitText(page, 'count', '01');
  assert.equal(await page.locator('#celebration strong').textContent(), 'ナイスジェスチャー！');
  assert.equal(await page.locator('#celebration').getAttribute('data-effect'), 'fireworks');
  await page.getByRole('button', { name: '検出を一時停止' }).click();
  assert.equal(await page.locator('#celebration').isVisible(), false);
  assert.equal(await page.locator('#confetti').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(v => v === 0)), true);
  await page.locator('#preview-effect').click();
  await page.locator('#stop').click();
  assert.equal(await page.locator('#celebration').isVisible(), false);
  assert.equal(await page.locator('#count').textContent(), '01');
  assert.equal(await page.locator('#confetti').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every(v => v === 0)), true);
});
