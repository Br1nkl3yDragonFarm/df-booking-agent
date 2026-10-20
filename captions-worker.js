// ============================================================
//  DRAGON FARM — CAPTIONS WORKER
//
//  Runs Whisper in the browser with Transformers.js (Apache-2.0, loaded
//  from the CDN), so the audio never leaves the computer. The model is
//  downloaded once and the browser keeps it.
//
//  In:  { type: 'load', lib, model }          → progress…, { type: 'ready' }
//       { type: 'block', id, audio }          → { type: 'result', id, chunks }
//  Out on failure: { type: 'error', message }
// ============================================================

let transcriber = null, loaded = '';

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      if (loaded !== data.model) {
        const { pipeline, env } = await import(data.lib);
        env.allowLocalModels = false;
        const files = {};
        transcriber = await pipeline('automatic-speech-recognition', data.model, {
          dtype: 'q8', device: 'wasm',
          progress_callback: p => {
            if (p.status !== 'progress' || !p.total) return;
            files[p.file] = [p.loaded, p.total];
            const sum = Object.values(files).reduce((a, [l, t]) => [a[0] + l, a[1] + t], [0, 0]);
            self.postMessage({ type: 'progress', loaded: sum[0], total: sum[1] });
          }
        });
        loaded = data.model;
      }
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'block') {
      const out = await transcriber(data.audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
      self.postMessage({ type: 'result', id: data.id, chunks: out.chunks || [{ timestamp: [0, null], text: out.text }] });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
