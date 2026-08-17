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
  assert.match(html, /mystyle\.css\?v=41-review-audio-button/u);
  assert.match(html, /quiz\.js\?v=61-review-audio-button/u);
  assert.match(worker, /\/icons\/explain_quiz\.svg/u);
});

test("artwork spins only while shared audio is playing and pauses in place", () => {
  assert.match(styles, /\.quiz-audio-artwork\s*\{[\s\S]*?animation:\s*quizAudioArtworkSpin[^;]+;[\s\S]*?animation-play-state:\s*paused;/u);
  assert.match(styles, /\.quiz-audio-artwork\.is-spinning\s*\{\s*animation-play-state:\s*running;/u);
  assert.match(script, /function setSharedAudioPlaying\(isPlaying\)[\s\S]*?sharedAudioArtwork\?\.classList\.toggle\("is-spinning", isPlaying\)/u);
  assert.match(script, /sharedAudio\.addEventListener\("play", \(\) => \{ setSharedAudioPlaying\(true\)/u);
  assert.match(script, /sharedAudio\.addEventListener\("pause", \(\) => \{ setSharedAudioPlaying\(false\)/u);
  assert.match(script, /sharedAudio\.addEventListener\("ended", \(\) => \{ setSharedAudioPlaying\(false\)/u);
});

test("wrong-answer review cards receive a clickable audio control", () => {
  assert.match(script, /if \(stateClass === "is-wrong"\)[\s\S]*?audioButton\.className = "modal-review-audio-button";[\s\S]*?explainIcon\.src = "icons\/explain_quiz\.svg";/u);
  assert.match(script, /audioButton\.addEventListener\("click",[\s\S]*?toggleReviewAudio\(audioButton, item\)/u);
  assert.match(script, /async function toggleReviewAudio\(button, question\)[\s\S]*?requestSharedAudioBlob\(question\)[\s\S]*?reviewAudio\.play\(\)/u);
  assert.match(script, /reviewAudio\.addEventListener\("play", \(\) => setReviewAudioButtonState\(reviewAudioButton, "playing"\)\)/u);
  assert.match(script, /function closeModal\(result\) \{[\s\S]*?resetReviewAudioPlayer\(\)/u);
  assert.match(styles, /\.modal-review-figure-shell \.modal-review-audio-button\s*\{[\s\S]*?right:\s*-11px;[\s\S]*?transform:\s*translateY\(-50%\)/u);
  assert.match(styles, /\.modal-review-audio-button\.is-playing \.modal-review-explain-icon\s*\{\s*animation-play-state:\s*running;/u);
});
