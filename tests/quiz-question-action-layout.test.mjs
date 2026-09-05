import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const quizStyles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const helpStyles = readFileSync(new URL("../quiz-help.css", import.meta.url), "utf8");

function cssBlock(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} must exist`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `${selector} must have a closing brace`);
  return source.slice(start, end + 1);
}

test("question actions follow the question in semantic reading order", () => {
  const content = page.indexOf('class="quiz-question-content"');
  const figure = page.indexOf('id="figure-wrap"');
  const question = page.indexOf('id="question"');
  const recorder = page.indexOf('id="quiz-audio-recorder"');
  const actions = page.indexOf('class="quiz-question-actions"');
  const hint = page.indexOf('class="quiz-click-hint"');

  for (const [name, position] of Object.entries({ content, figure, question, recorder, actions, hint })) {
    assert.notEqual(position, -1, `${name} must exist`);
  }

  assert.ok(content < figure, "the scroll region must contain the question content");
  assert.ok(figure < question, "the figure must precede the question");
  assert.ok(question < recorder, "the Admin recorder must follow the question");
  assert.ok(recorder < actions, "question actions must remain after the question content");
  assert.ok(actions < hint, "the discoverability hint must live inside the action footer");
  assert.match(page, /class="quiz-click-hint-mark" aria-hidden="true"/u);
  assert.doesNotMatch(page, /👆/u);
});

test("question actions and hint stay in flow instead of covering long text", () => {
  const area = cssBlock(quizStyles, ".question-area");
  const content = cssBlock(quizStyles, ".quiz-question-content");
  const actions = cssBlock(quizStyles, ".quiz-question-actions");
  const recorder = cssBlock(quizStyles, ".quiz-audio-recorder");
  const hint = cssBlock(helpStyles, ".quiz-click-hint");

  assert.match(area, /display:\s*grid;/u);
  assert.match(area, /grid-template-rows:\s*minmax\(0, 1fr\) auto;/u);
  assert.match(area, /overflow:\s*hidden;/u);
  assert.match(content, /min-height:\s*0;/u);
  assert.match(content, /overflow-y:\s*auto;/u);

  assert.match(actions, /position:\s*static;/u);
  assert.match(actions, /width:\s*100%;/u);
  assert.match(actions, /flex-wrap:\s*wrap;/u);
  assert.match(actions, /margin-top:\s*0;/u);
  assert.doesNotMatch(actions, /position:\s*(?:absolute|fixed);/u);

  assert.match(recorder, /position:\s*relative;/u);
  assert.match(recorder, /width:\s*100%;/u);
  assert.doesNotMatch(recorder, /\b(?:bottom|left):/u);

  assert.match(hint, /position:\s*static;/u);
  assert.match(hint, /width:\s*max-content;/u);
  assert.match(hint, /max-width:\s*100%;/u);
  assert.match(hint, /flex:\s*0 0 auto;/u);
  assert.match(hint, /margin-left:\s*auto;/u);
  assert.doesNotMatch(hint, /\b(?:right|bottom):/u);
});

test("question copy reflows and the explanation action keeps an accessible target", () => {
  const question = cssBlock(quizStyles, "#question");
  const explanation = cssBlock(quizStyles, ".quiz-question-actions .explanation-btn");

  assert.match(question, /min-width:\s*0;/u);
  assert.match(question, /overflow-wrap:\s*break-word;/u);
  assert.match(question, /hyphens:\s*auto;/u);
  assert.match(explanation, /min-height:\s*44px;/u);
  assert.match(explanation, /height:\s*44px;/u);
  assert.match(quizStyles, /\.explanation-btn:focus-visible\s*\{[^}]*outline:\s*3px solid #263bd4;/su);
});
