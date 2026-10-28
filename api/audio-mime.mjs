const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav"
]);

export function normalizeQuizAudioMimeType(value) {
  const mimeType = String(value || "audio/webm").split(";", 1)[0].trim().toLowerCase();
  return SUPPORTED_AUDIO_MIME_TYPES.has(mimeType) ? mimeType : "audio/webm";
}

export function detectQuizAudioMimeType(value, fallback = "audio/webm") {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  if (bytes.length >= 4
    && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "audio/webm";
  }
  if (bytes.length >= 4
    && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return "audio/ogg";
  }
  if (bytes.length >= 12
    && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "audio/mp4";
  }
  if (bytes.length >= 3
    && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return "audio/mpeg";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
    return "audio/wav";
  }
  return normalizeQuizAudioMimeType(fallback);
}

// Upload validation is deliberately separate from the permissive playback
// fallback. These signatures identify containers, not their spoken contents.
export function sniffQuizAudioUploadMimeType(value) {
  const bytes = Buffer.from(value || []);
  if (bytes.length < 12) return null;
  const starts = text => bytes.subarray(0, text.length).toString("latin1") === text;
  if (starts("RIFF") && bytes.toString("ascii", 8, 12) === "WAVE") {
    if (bytes.length < 44 || bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
    let offset = 12, format = false, samples = false;
    while (offset + 8 <= bytes.length) {
      const kind = bytes.toString("ascii", offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      if (offset + 8 + size > bytes.length) return null;
      if (kind === "fmt " && size >= 16) format = true;
      if (kind === "data" && size > 0) samples = true;
      offset += 8 + size + (size % 2);
    }
    return format && samples ? "audio/wav" : null;
  }
  if (bytes.readUInt32BE(0) === 0x1a45dfa3
    && bytes.subarray(4, 4096).includes(Buffer.from("webm"))) return "audio/webm";
  if (starts("OggS") && bytes.length >= 28 && bytes[4] === 0
    && (bytes.subarray(27, 4096).includes(Buffer.from("OpusHead"))
      || bytes.subarray(27, 4096).includes(Buffer.from("\x01vorbis", "latin1")))) return "audio/ogg";
  if (bytes.toString("ascii", 4, 8) === "ftyp" && bytes.length >= 20) {
    const size = bytes.readUInt32BE(0);
    if (size >= 16 && size <= bytes.length && size % 4 === 0
      && /^(M4A |M4B |isom|iso[2-9]|mp4[12]|qt  )$/.test(bytes.toString("ascii", 8, 12))) return "audio/mp4";
  }
  let frame = 0;
  if (starts("ID3")) {
    if (![2, 3, 4].includes(bytes[3]) || bytes.subarray(6, 10).some(byte => byte > 127)) return null;
    frame = 10 + bytes[6] * 2097152 + bytes[7] * 16384 + bytes[8] * 128 + bytes[9];
    if (bytes[3] === 4 && (bytes[5] & 0x10)) frame += 10;
  }
  // Reject reserved MPEG versions/layers/rates, including AAC's ADTS sync.
  if (frame + 4 < bytes.length && bytes[frame] === 0xff && (bytes[frame + 1] & 0xe0) === 0xe0
    && ((bytes[frame + 1] >> 3) & 3) !== 1 && ((bytes[frame + 1] >> 1) & 3) !== 0
    && (bytes[frame + 2] >> 4) > 0 && (bytes[frame + 2] >> 4) < 15
    && ((bytes[frame + 2] >> 2) & 3) !== 3) return "audio/mpeg";
  return null;
}

export function validateQuizAudioUploadMimeType(bytes, claimedType = "") {
  const detected = sniffQuizAudioUploadMimeType(bytes);
  const raw = String(claimedType || "").split(";", 1)[0].trim().toLowerCase();
  const claimed = ({ "audio/x-m4a": "audio/mp4", "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav" })[raw] || raw;
  if (!detected || (claimed && (!SUPPORTED_AUDIO_MIME_TYPES.has(claimed)
    || claimed !== detected))) {
    throw Object.assign(new Error("invalid_audio_type"), { statusCode: 415 });
  }
  return detected;
}
