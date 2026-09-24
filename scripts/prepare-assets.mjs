import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const modelPath = new URL('../web/models/hand_landmarker.task', import.meta.url);
const vendor = new URL('../web/vendor/', import.meta.url);
const source = new URL('../node_modules/@mediapipe/tasks-vision/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedHash = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
await mkdir(new URL('../web/models/', import.meta.url), { recursive: true });
await mkdir(vendor, { recursive: true });
await copyFile(new URL('vision_bundle.mjs', source), new URL('vision_bundle.mjs', vendor));
await cp(new URL('wasm/', source), new URL('wasm/', vendor), { recursive: true });
let bytes;
try { bytes = await readFile(modelPath); } catch { /* First build. */ }
if (!bytes || (expectedHash && sha256(bytes) !== expectedHash)) {
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const hash = sha256(bytes);
if (expectedHash && hash !== expectedHash) throw new Error('Model checksum mismatch');
await writeFile(modelPath, bytes);
await writeFile(new URL('manifest.json', vendor), JSON.stringify({ mediapipe: '1.0.1', modelUrl, sha256: hash }, null, 2));
console.log(`Local assets ready. Model SHA-256: ${hash}`);
