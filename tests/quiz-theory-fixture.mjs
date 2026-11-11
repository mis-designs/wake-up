// Offline fixture loader. Supports the isolated before/after delivery without
// writing a checkout or copying dependencies. Normal repo runs use direct imports.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const overlay = fileURLToPath(new URL("../", import.meta.url));
export const sourceRoot = process.env.MAGIC_THEORY_SOURCE_ROOT || overlay;
const dataRoot = process.env.MAGIC_THEORY_DATA_ROOT || overlay;
export const fixtureRequire = createRequire(path.join(sourceRoot, "package.json"));
export const records = JSON.parse(readFileSync(path.join(dataRoot, "api/_quiz-theory.json"), "utf8"));
const urls = new Map();
const staged = new Set(["api/quiz.js", "api/quizbank.js", "api/trial.js", "lib/quiz-theory-response.mjs"]);
const asModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

function moduleUrl(name, enableTrial = false) {
  const key = name + (enableTrial ? "?trial-fixture" : "");
  if (urls.has(key)) return urls.get(key);
  if (name === "lib/quiz-theory.cjs") {
    const module = { exports: {} };
    const require = specifier => specifier === "../api/_quiz-theory.json" ? records
      : fixtureRequire(path.resolve(sourceRoot, "lib", specifier));
    new Function("require", "module", "exports", readFileSync(path.join(dataRoot, name), "utf8"))(require, module, module.exports);
    globalThis[Symbol.for("magic.quizTheory.fixtureResolver")] = module.exports;
    const url = asModule('export default globalThis[Symbol.for("magic.quizTheory.fixtureResolver")];');
    urls.set(key, url); return url;
  }
  if (!staged.has(name)) return pathToFileURL(path.join(sourceRoot, name)).href;
  let source = readFileSync(path.join(overlay, name), "utf8");
  if (enableTrial) {
    source = source.replace("  GUEST_TRIAL_ENABLED,", "  GUEST_TRIAL_ENABLED as disabledTrialPolicy,");
    source += "\nconst GUEST_TRIAL_ENABLED = true; // test-only dormant-path fixture\n";
  }
  source = source.replaceAll("createRequire(import.meta.url)", `createRequire(${JSON.stringify(pathToFileURL(path.join(sourceRoot, name)).href)})`);
  source = source.replace(/from\s+(["'])([^"']+)\1/g, (match, quote, specifier) => {
    if (specifier.startsWith("node:") || ["crypto", "module"].includes(specifier)) return match;
    const url = specifier.startsWith(".")
      ? moduleUrl(path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier)))
      : pathToFileURL(fixtureRequire.resolve(specifier).replace(specifier === "@neondatabase/serverless" ? /index\.js$/ : /$^/, "index.mjs")).href;
    return `from ${JSON.stringify(url)}`;
  });
  const url = asModule(source); urls.set(key, url); return url;
}

export async function loadTheoryModule(name, { enableTrial = false } = {}) {
  if (!process.env.MAGIC_THEORY_SOURCE_ROOT && !enableTrial) return import(pathToFileURL(path.join(overlay, name)).href);
  return import(moduleUrl(name, enableTrial));
}

export function readProductFile(name) {
  return readFileSync(path.join(existsSync(path.join(overlay, name)) ? overlay : sourceRoot, name), "utf8");
}
