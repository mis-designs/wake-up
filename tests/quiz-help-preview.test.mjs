import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const page = fs.readFileSync(new URL("../aggiungi-spiegazioni.html", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../aggiungi-spiegazioni.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../aggiungi-spiegazioni.css", import.meta.url), "utf8");

test("admin explanations expose the personal Bangla help disclosure", () => {
  const resolverPosition = page.indexOf("patenteContextResolverV3.js");
  const loaderPosition = page.indexOf("quizHelpRuntimeV3Loader.js");
  const previewPosition = page.indexOf("quiz-help-preview.js");
  const clientPosition = page.indexOf("aggiungi-spiegazioni.js");

  assert.ok(resolverPosition >= 0 && resolverPosition < loaderPosition && loaderPosition < previewPosition && previewPosition < clientPosition);
  assert.match(page, /QUIZ_HELP_RUNTIME_V3_DEFAULT_ENABLED\s*=\s*true/u);
  assert.match(client, /audio-admin-help-toggle/u);
  assert.match(client, /aria-controls/u);
  assert.match(client, /QuizHelpPreview\?\.getQuestionHelp/u);
  assert.match(client, /requestId !== state\.helpRequestId/u);
  assert.match(styles, /audio-admin-help-panel/u);
  assert.match(styles, /audio-admin-help-panel\[hidden\]\s*\{\s*display:\s*none/u);
  assert.match(styles, /prefers-reduced-motion/u);
});

test("admin preview resolves local personal Bangla keywords without automatic translation", async () => {
  const library = JSON.parse(fs.readFileSync(new URL("../data/patente/quiz-help-runtime-v2.json", import.meta.url), "utf8"));
  const sandbox = {
    fetch: async () => ({ ok: true, json: async () => library })
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(new URL("../quiz-help-preview.js", import.meta.url), "utf8"), { globalThis: sandbox });

  const help = await sandbox.QuizHelpPreview.getQuestionHelp({
    question: "In una carreggiata del tipo rappresentato si può sorpassare anche in curva",
    figure: "/img_sign/550.png"
  });

  assert.equal(help.source, "runtime_v2");
  assert.ok(help.words.length > 0);
  assert.ok(help.words.every(word => word.italian && word.bangla));
});
