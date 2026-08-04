import test from "node:test";
import assert from "node:assert/strict";
import { detectQuizAudioMimeType, normalizeQuizAudioMimeType } from "../api/audio-mime.mjs";

test("audio playback detects the real container instead of trusting stale database MIME", () => {
  assert.equal(detectQuizAudioMimeType(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), "audio/mp4"), "audio/webm");
  assert.equal(detectQuizAudioMimeType(Uint8Array.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]), "audio/webm"), "audio/mp4");
  assert.equal(detectQuizAudioMimeType(Uint8Array.from([0x49, 0x44, 0x33, 4]), "audio/webm"), "audio/mpeg");
  assert.equal(detectQuizAudioMimeType(Uint8Array.from([0x4f, 0x67, 0x67, 0x53]), "audio/webm"), "audio/ogg");
});

test("supported recorder MIME types are preserved without codec parameters", () => {
  assert.equal(normalizeQuizAudioMimeType("audio/mp4;codecs=mp4a.40.2"), "audio/mp4");
  assert.equal(normalizeQuizAudioMimeType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeQuizAudioMimeType("text/plain"), "audio/webm");
});
