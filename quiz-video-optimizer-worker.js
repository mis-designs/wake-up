import { Input, BlobSource, MP4, Output, Mp4OutputFormat, BufferTarget, Conversion, Quality, EncodedPacketSink } from './vendor/quiz-video/mediabunny-1.65.2/mediabunny.min.mjs';

// Packet equality proves that lossless mode did not re-encode pictures or audio.
// The optional smaller-file mode also requires untouched audio and frame count.
async function samePackets(first, second) {
  const a = new EncodedPacketSink(first).packets(), b = new EncodedPacketSink(second).packets();
  try {
    while (true) {
      const [x, y] = await Promise.all([a.next(), b.next()]);
      if (x.done || y.done) return x.done === y.done;
      if (x.value.data.length !== y.value.data.length) return false;
      for (let i = 0; i < x.value.data.length; i++) if (x.value.data[i] !== y.value.data[i]) return false;
    }
  } finally { await a.return?.(); await b.return?.(); }
}
self.onmessage = async ({ data: { file, mode } }) => {
  let input, check;
  try {
    input = new Input({ source: new BlobSource(file), formats: [MP4] });
    const tracks = await input.getTracks(), videos = await input.getVideoTracks();
    if (videos.length !== 1 || tracks.some(t => !['video', 'audio'].includes(t.type))) throw Error('compression_unavailable');
    const stats = await videos[0].computePacketStats();
    if (mode === 'quality') {
      const color = await videos[0].getColorSpace();
      // Preserve HDR sources rather than silently converting their range to SDR.
      if (['smpte2084', 'arib-std-b67'].includes(color.transfer)) throw Error('compression_unavailable');
    }
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, showWarnings: false,
      ...(mode === 'quality' ? { video: { codec: 'avc', quality: new Quality({ bitrate: Math.max(256000, Math.round(stats.averageBitrate * 0.75)) }), hardwareAcceleration: 'no-preference' } } : { copy: { mode: 'forced' } }) });
    if (!conversion.isValid || conversion.discardedTracks.length || conversion.utilizedTracks.length !== tracks.length) { await conversion.cancel(); throw Error('compression_unavailable'); }
    let last = -1;
    conversion.onProgress = p => { const percentage = Math.floor(p * 100); if (percentage !== last) { last = percentage; self.postMessage({ progress: p * 0.9 }); } };
    await conversion.execute();
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
    check = new Input({ source: new BlobSource(blob), formats: [MP4] });
    const written = await check.getTracks();
    if (written.length !== tracks.length) throw Error('compression_unavailable');
    for (let i = 0; i < tracks.length; i++) {
      const original = tracks[i], converted = written[i];
      if (original.type !== converted.type) throw Error('compression_unavailable');
      if (mode !== 'quality' || original.type === 'audio') {
        if (await original.getCodec() !== await converted.getCodec() || !await samePackets(original, converted)) throw Error('compression_unavailable');
      } else if ((await converted.computePacketStats()).packetCount !== stats.packetCount) throw Error('compression_unavailable');
    }
    self.postMessage({ blob });
  } catch { self.postMessage({ error: 'compression_unavailable' }); }
  finally { input?.dispose(); check?.dispose(); }
};
