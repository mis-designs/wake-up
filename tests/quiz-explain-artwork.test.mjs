import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const html = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const iconUrl = new URL("../icons/explain_quiz.svg", import.meta.url);

test("explanation artwork is rendered beside the shared audio player", () => {
  assert.equal(existsSync(iconUrl), true);
  assert.match(html, /id="quiz-audio-artwork"[^>]+src="icons\/explain_quiz\.svg"/u);
  assert.match(html, /mystyle\.css\?v=51-question-footer-reflow/u);
  assert.match(html, /quiz\.js\?v=80-numberless-figures/u);
  assert.match(worker, /\/icons\/explain_quiz\.svg/u);
});

test("artwork spins only while shared audio is playing and pauses in place", () => {
  assert.match(styles, /\.quiz-audio-artwork\s*\{[\s\S]*?animation:\s*quizAudioArtworkSpin[^;]+;[\s\S]*?animation-play-state:\s*paused;/u);
  assert.match(styles, /\.quiz-audio-artwork\.is-spinning\s*\{\s*animation-play-state:\s*running;/u);
  assert.match(script, /function setSharedAudioPlaying\(isPlaying\)[\s\S]*?sharedAudioArtwork\?\.classList\.toggle\("is-spinning", isPlaying\)/u);
  assert.match(script, /sharedAudio\.addEventListener\("play", \(\) => \{[\s\S]*?setSharedAudioPlaying\(true\)/u);
  assert.match(script, /sharedAudio\.addEventListener\("pause", \(\) => \{[\s\S]*?setSharedAudioPlaying\(false\)/u);
  assert.match(script, /sharedAudio\.addEventListener\("ended", \(\) => \{[\s\S]*?setSharedAudioPlaying\(false\)/u);
});

test("every correction card receives the clickable person audio control", () => {
  assert.match(script, /items\.forEach\(item => \{[\s\S]*?reviewAudioControl\.className = "modal-review-audio-button magic-loading-control";[\s\S]*?explainIcon\.src = "icons\/explain_quiz\.svg";/u);
  assert.doesNotMatch(script, /if \(stateClass === "is-wrong"\)[\s\S]*?modal-review-audio-button/u);
  assert.match(script, /reviewAudioControl\.addEventListener\("click",[\s\S]*?toggleReviewAudio\(reviewAudioControl, item\)/u);
  assert.match(script, /async function toggleReviewAudio\(button, question\)[\s\S]*?requestSharedAudioBlob\(question, \{ signal: controller\.signal \}\)[\s\S]*?reviewAudio\.play\(\)/u);
  assert.match(script, /reviewAudio\.addEventListener\("play", \(\) => \{[\s\S]*?setReviewAudioButtonState\(reviewAudioButton, "playing"\)/u);
  assert.match(script, /function closeModal\(result\) \{[\s\S]*?resetReviewAudioPlayer\(\)/u);
  assert.match(styles, /\.modal-review-item:not\(\.has-figure\)\s*\{[\s\S]*?padding-right:\s*82px;/u);
  assert.match(styles, /\.modal-review-figure-shell \.modal-review-audio-button\s*\{[\s\S]*?right:\s*-11px;[\s\S]*?transform:\s*translateY\(-50%\)/u);
  assert.match(styles, /\.modal-review-audio-button\.is-playing \.modal-review-explain-icon\s*\{\s*animation-play-state:\s*running;/u);
});

test("missing review audio is handled inline without the global toast", () => {
  assert.match(script, /reviewAudioStatus\.className = "modal-review-audio-status"/u);
  assert.match(script, /function showReviewAudioFailure\(button, error\)[\s\S]*?setReviewAudioStatus\(/u);
  assert.match(script, /button\.dataset\.audioUnavailable === "true"/u);
  assert.match(script, /quiz_audio_\(not_found\|requires_review\|legacy_not_found\|legacy_not_ambiguous\|not_configured\)/u);
  assert.match(styles, /\.modal-review-audio-button\.is-unavailable\s*\{/u);
  assert.match(styles, /\.modal-review-audio-status\s*\{/u);
  const toggleBlock = script.match(/async function toggleReviewAudio\(button, question\)[\s\S]*?\n\}\n\nreviewAudio\.addEventListener/u)?.[0] || "";
  assert.doesNotMatch(toggleBlock, /showAudioUnavailableToast\(/u);
});
