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
