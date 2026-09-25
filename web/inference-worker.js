// A classic worker allows MediaPipe's WASM loader to use importScripts.
let model;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location).href);
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', self.location).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.55,
        canvas: new OffscreenCanvas(1, 1),
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  } else if (data.type === 'frame') {
    try {
      if (!model) throw new Error('Model is not ready');
      const started = performance.now();
      const result = model.detectForVideo(data.frame, data.timestamp);
      const inferenceMs = performance.now() - started;
      self.postMessage({ type: 'result', generation: data.generation, id: data.id,
        epoch: data.epoch, timestamp: data.timestamp, inferenceMs,
        landmarks: result.landmarks, worldLandmarks: result.worldLandmarks });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
    finally { data.frame.close(); }
  }
};
