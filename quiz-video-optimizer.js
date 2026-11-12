(function(root) {
  'use strict';
  async function inspect(file, signal) {
    const url = URL.createObjectURL(file), video = document.createElement('video');
    try {
      return await new Promise((resolve, reject) => {
        const finish = (error, result) => {
          clearTimeout(timer); signal?.removeEventListener('abort', abort);
          video.onloadedmetadata = video.onerror = null;
          error ? reject(error) : resolve(result);
        };
        const abort = () => finish(new DOMException('Aborted', 'AbortError'));
        const timer = setTimeout(() => finish(new Error('video_unreadable')), 15000);
        video.onloadedmetadata = () => {
          if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 600) return finish(new Error('video_unreadable'));
          finish(null, { width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        };
        video.onerror = () => finish(new Error('video_unreadable'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) return abort();
        video.preload = 'metadata'; video.src = url;
      });
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }
  function convert(file, mode, signal, progress) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/quiz-video-optimizer-worker.js?v=2-management', { type: 'module' });
      const finish = (error, result) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate();
        error ? reject(error) : resolve(result);
      };
      const abort = () => finish(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('compression_timeout')), mode === 'quality' ? 180000 : 30000);
      worker.onmessage = ({ data }) => {
        if (data.progress != null) progress(`Ottimizzazione ${Math.min(99, Math.round(data.progress * 100))}%`);
        else if (data.error) finish(new Error(data.error));
        else if (data.blob instanceof Blob) finish(null, data);
        else finish(new Error('compression_unavailable'));
      };
      worker.onerror = event => { event.preventDefault(); finish(new Error('compression_unavailable')); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) return abort();
      worker.postMessage({ file, mode });
    });
  }
  async function optimize(file, { signal, progress = () => {}, mode = 'lossless' } = {}) {
    signal?.throwIfAborted();
    if (file.size > 128 * 1024 * 1024 || file.size < 32) throw new Error('video_size_invalid');
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (String.fromCharCode(...signature.slice(4, 8)) !== 'ftyp') throw new Error('video_mp4_required');
    const original = await inspect(file, signal), normalized = new Blob([file], { type: 'video/mp4' });
    try {
      progress(mode === 'quality' ? 'Riduzione del video ad alta qualità…' : 'Ottimizzazione senza perdita…');
      const result = await convert(file, mode === 'quality' ? mode : 'lossless', signal, progress);
      signal?.throwIfAborted();
      const details = await inspect(result.blob, signal);
      if (details.width !== original.width || details.height !== original.height || Math.abs(details.duration - original.duration) > 0.1) throw new Error('compression_unavailable');
      // Never increase storage or report a sub-1% container change as useful compression.
      if (result.blob.size >= file.size * 0.99) return { blob: normalized, ...original, compressed: false, reason: 'original_better' };
      return { blob: result.blob, ...details, compressed: true, reason: mode === 'quality' ? 'compressed' : 'lossless' };
    } catch (error) {
      signal?.throwIfAborted();
      return { blob: normalized, ...original, compressed: false, reason: error.message === 'compression_timeout' ? error.message : 'compression_unavailable' };
    }
  }
  root.QuizVideoOptimizer = Object.freeze({ inspect, optimize });
})(window);
