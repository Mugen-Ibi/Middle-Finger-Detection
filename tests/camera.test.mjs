import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraController, cameraError, isDarkRGBA } from '../web/camera.js';

function stream() {
  const track = new EventTarget();
  track.stops = 0; track.stop = () => track.stops++;
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('selected device uses its exact ID without resolution or audio constraints', async () => {
  const capture = stream(); let constraints;
  const camera = new CameraController({ getUserMedia: async value => { constraints = value; return capture; } });
  assert.equal(await camera.start('test-camera'), capture);
  assert.deepEqual(constraints, { audio: false, video: { deviceId: { exact: 'test-camera' } } });
  camera.stop(); assert.equal(capture.track.stops, 1);
});

test('switching devices releases the old stream before requesting the next', async () => {
  const first = stream(), second = stream(); let calls = 0;
  const camera = new CameraController({ getUserMedia: async () => {
    if (calls++) { assert.equal(first.track.stops, 1); return second; }
    return first;
  }});
  await camera.start(); await camera.start('phone');
  assert.equal(camera.stream, second); camera.stop();
});

test('stop cancels pending permission and releases a late granted stream', async () => {
  const pending = deferred(), capture = stream();
  const camera = new CameraController({ getUserMedia: () => pending.promise });
  const request = camera.start(); const rejected = assert.rejects(request, { name: 'AbortError' });
  camera.stop(); await rejected;
  pending.resolve(capture); await new Promise(r => setImmediate(r));
  assert.equal(capture.track.stops, 1); assert.equal(camera.stream, null);
});

test('late permission response cannot replace a newer camera', async () => {
  const pending = deferred(), first = stream(), second = stream(); let calls = 0;
  const camera = new CameraController({ getUserMedia: () => calls++ ? Promise.resolve(second) : pending.promise });
  const request = camera.start(); const rejected = assert.rejects(request, { name: 'AbortError' });
  await Promise.resolve(); await camera.start('other'); await rejected;
  pending.resolve(first); await new Promise(r => setImmediate(r));
  assert.equal(camera.stream, second); assert.equal(first.track.stops, 1); camera.stop();
});

test('timeout releases a stream even if Windows resolves much later', async () => {
  const pending = deferred(), capture = stream();
  const camera = new CameraController({ getUserMedia: () => pending.promise }, () => {}, 10);
  await assert.rejects(camera.start(), { name: 'TimeoutError' });
  pending.resolve(capture); await new Promise(r => setImmediate(r));
  assert.equal(capture.track.stops, 1); assert.equal(camera.stream, null);
});

test('physical disconnect releases the stream and reports the event', async () => {
  const capture = stream(); let ended = 0;
  const camera = new CameraController({ getUserMedia: async () => capture }, () => ended++);
  await camera.start(); capture.track.dispatchEvent(new Event('ended'));
  assert.equal(ended, 1); assert.equal(camera.stream, null); assert.equal(capture.track.stops, 1);
});

test('permission failures remain actionable errors', async () => {
  const camera = new CameraController({ getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } });
  await assert.rejects(camera.start(), { name: 'NotAllowedError' });
  assert.match(cameraError({ name: 'NotAllowedError' }), /許可/);
});

test('black frame check ignores alpha and sparse driver noise', () => {
  const pixels = new Uint8ClampedArray(64 * 48 * 4);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  pixels[0] = 255;
  assert.equal(isDarkRGBA(pixels), true);
  pixels.fill(70); assert.equal(isDarkRGBA(pixels), false);
});
