(function(root) {
  'use strict';
  const base = '/vendor/quiz-video/ffmpeg-0.12.15-core-0.12.10/';
  let library;
  function loadLibrary() {
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { library = null; script.remove(); reject(new Error('compression_unavailable')); }, 30000);
      script.src = base + 'ffmpeg.js';
      script.onload = () => { clearTimeout(timer); resolve(root.FFmpegWASM.FFmpeg); };
      script.onerror = () => { clearTimeout(timer); library = null; script.remove(); reject(new Error('compression_unavailable')); };
      document.head.append(script);
    });
    return library;
  }
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
  async function optimize(file, { signal, progress = () => {} } = {}) {
    signal?.throwIfAborted();
    if (file.size > 128 * 1024 * 1024 || file.size < 32) throw new Error('video_size_invalid');
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (String.fromCharCode(...signature.slice(4, 8)) !== 'ftyp') throw new Error('video_mp4_required');
    const original = await inspect(file, signal);
    const normalized = new Blob([file], { type: 'video/mp4' });
    let ffmpeg;
    const abort = () => ffmpeg?.terminate();
    const deadline = setTimeout(abort, 5 * 60 * 1000);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      progress('Preparazione della compressione…');
      const FFmpeg = await loadLibrary();
      signal?.throwIfAborted();
      ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress: value }) => progress(`Ottimizzazione ${Math.min(99, Math.max(0, Math.round(value * 100)))}%`));
      await ffmpeg.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: base + 'ffmpeg-core.wasm' });
      signal?.throwIfAborted();
      await ffmpeg.writeFile('input.mp4', new Uint8Array(await file.arrayBuffer()));
      const code = await ffmpeg.exec(['-i', 'input.mp4', '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'output.mp4'], 240000);
      signal?.throwIfAborted();
      if (code !== 0) throw new Error('compression_unavailable');
      const bytes = await ffmpeg.readFile('output.mp4');
      const optimized = new Blob([bytes], { type: 'video/mp4' });
      const details = await inspect(optimized, signal);
      if (details.width !== original.width || details.height !== original.height || Math.abs(details.duration - original.duration) > 0.25 || optimized.size >= file.size) {
        return { blob: normalized, ...original, compressed: false, reason: 'original_better' };
      }
      return { blob: optimized, ...details, compressed: true };
    } catch (error) {
      signal?.throwIfAborted();
      return { blob: normalized, ...original, compressed: false, reason: 'compression_unavailable' };
    } finally {
      clearTimeout(deadline); signal?.removeEventListener('abort', abort); ffmpeg?.terminate();
    }
  }
  root.QuizVideoOptimizer = Object.freeze({ inspect, optimize });
})(window);
