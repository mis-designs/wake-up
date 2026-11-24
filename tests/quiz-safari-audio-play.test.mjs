import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../quiz.js', import.meta.url), 'utf8');
const play = source.match(/async function playSharedAudio\(\) \{[^]*?\n\}/u)[0];

test('Safari activation rejection retains the blob and repeat tap plays synchronously without another download', async () => {
  let downloads = 0;
  let plays = 0;
  let revoked = 0;
  let messages = [];
  const context = {
    sharedAudioQuestion: { id: '1' },
    sharedAudioPlayer: { dataset: { audioState: 'active' } },
    sharedAudioPlay: null, sharedAudioPlayPending: false,
    sharedAudioRequestId: 1, sharedAudioPlayRequestId: 0,
    sharedAudioLoading: null, sharedAudioFailure: null,
    audioFocus: null,
    sharedAudio: {
      src: '', paused: true,
      play() {
        plays++;
        if (plays === 1) return Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }));
        this.paused = false;
        return Promise.resolve();
      },
      pause() { this.paused = true; },
      removeAttribute() { this.src = ''; }, load() {}
    },
    async loadSharedAudioSource() { downloads++; context.sharedAudio.src = 'blob:private-audio'; },
    setSharedAudioVisualState(state) { context.sharedAudioPlayer.dataset.audioState = state; },
    setSharedAudioPlaying() {},
    showAudioUnavailableToast(message) { messages.push(message); },
    revokeSharedAudioObjectUrl() { revoked++; },
    setSharedAudioFailure() { assert.fail('activation is not an unavailable recording'); },
    reportSharedAudioFailure() { assert.fail('must allow recovery'); }
  };
  vm.runInNewContext(play, context);
  await context.playSharedAudio();
  assert.equal(downloads, 1);
  assert.equal(revoked, 0);
  assert.equal(context.sharedAudio.src, 'blob:private-audio');
  assert.equal(context.sharedAudioPlayPending, false);
  assert.match(messages[0], /Tocca di nuovo Play/);
  const retry = context.playSharedAudio();
  assert.equal(plays, 2, 'play runs before any await on the fresh gesture');
  await retry;
  assert.equal(downloads, 1);
  assert.equal(context.sharedAudio.paused, false);
  await context.playSharedAudio();
  assert.equal(context.sharedAudio.paused, true);
});

function ownerFunction(source, name) {
  const fn = source.match(new RegExp('^(?:async )?function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(fn, name);
  return fn[0];
}

test('Italian question retries playback during the click with one TTS request', async () => {
  let downloads = 0, plays = 0;
  const messages = [];
  const ctx = {
    quiz: [{ id: 'cap1_q2', question: 'Domanda' }], current: 0, QUIZBANK_MODE: false,
    italianAudioId: 0, italianAudioBtn: null, italianAudioFocusToken: null, isTtsPlaying: false,
    italianAudioCache: new Map(), hasTrialAudioPreview: () => true, beginQuizTtsFocus: () => 1,
    isCurrentQuizTts: () => true, audioUrlFromBase64: () => 'blob:tts',
    completeQuizTts() { ctx.isTtsPlaying = false; return true; },
    showAudioUnavailableToast: message => messages.push(message),
    async fetchItalianAudio(text, key) {
      downloads++;
      const data = { audio: 'test' };
      ctx.italianAudioCache.set(key, data);
      return data;
    },
    Audio: class {
      async play() { if (++plays === 1) throw new DOMException('Click required', 'NotAllowedError'); }
    }
  };
  vm.runInNewContext(ownerFunction(source, 'speakItalian'), ctx);
  await ctx.speakItalian();
  assert.match(messages[0], /Tocca di nuovo/);
  const retry = ctx.speakItalian();
  assert.equal(plays, 2);
  await retry;
  assert.equal(downloads, 1);
});

test('review of a wrong answer reuses the recording after a denied play', async () => {
  let downloads = 0, plays = 0;
  const messages = [];
  const ctx = {
    reviewAudio: { src: '', paused: true, async play() {
      if (++plays === 1) throw new DOMException('Click required', 'NotAllowedError');
      this.paused = false;
    } },
    reviewAudioPending: false, reviewAudioKey: '', reviewAudioRequestId: 0, reviewAudioButton: null,
    AbortController, URL: { createObjectURL: () => 'blob:saved' }, audioFocus: null,
    reviewAudioIdentityKey: () => 'fixture', setReviewAudioButtonState() {}, clearReviewAudioStatus() {},
    setReviewAudioStatus: (_, message) => messages.push(message), stopAllAudio() {},
    resetReviewAudioPlayer() { ctx.reviewAudioRequestId++; ctx.reviewAudio.src = ''; },
    async requestSharedAudioBlob() { downloads++; return {blob: new Blob(['fixture'])}; },
    showReviewAudioFailure() { assert.fail('audio is present'); }
  };
  vm.runInNewContext(['handleReviewPlaybackFailure', 'toggleReviewAudio'].map(name => ownerFunction(source, name)).join('\n'), ctx);
  const button = { dataset: {} };
  await ctx.toggleReviewAudio(button, {});
  assert.match(messages[0], /Audio pronto/);
  const retry = ctx.toggleReviewAudio(button, {});
  assert.equal(plays, 2);
  await retry;
  assert.equal(downloads, 1);
});

test('Studia distinguishes a missing recording from a failed fallback', async () => {
  const study = readFileSync(new URL('../study-quiz.js', import.meta.url), 'utf8').replace(/^  /gm, '');
  for (const [second, expected] of [['timeout', 'timeout'], ['quiz_audio_not_found', 'quiz_audio_not_found']]) {
    let calls = 0;
    const ctx = { audioApi: async () => { throw new Error(++calls === 1 ? 'quiz_audio_not_found' : second); } };
    vm.runInNewContext(ownerFunction(study, 'fetchExplanationBlob'), ctx);
    await assert.rejects(ctx.fetchExplanationBlob({}), error => error.message === expected);
    assert.equal(calls, 2);
  }
});
