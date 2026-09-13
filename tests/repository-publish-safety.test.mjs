import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateFiles = [
  ".env", ".env.production", "nested/.env.local", ".envrc", "secret.pem", "secret.key",
  "key.p8", "android/signing.keystore", "id_rsa", "id_ed25519", "id_ecdsa",
  "credentials-google.json", "service-account-prod.json", "service_account-prod.json",
  "application_default_credentials.json", ".clasprc.json", ".clasp.json", ".npmrc", ".netrc",
  ".ssh/config", ".aws/credentials", ".azure/accessTokens.json", ".config/gcloud/tokens.db",
  ".codex/config.toml", ".agents/settings.json", ".claude/settings.json",
  ".codex-remote-attachments/session/photo.jpg", ".attachments/pasted-text.txt",
  "attachments/invoice.pdf", "outputs/vercel-audit/logs.csv", "exports/users.csv",
  "artifacts/report.html", "logs/access.csv", "backup/snapshot.zip", "backups/snapshot.zip",
  "magicph-backup/current/index.html", "tmp/request.txt", "temp/request.txt",
  "Invoice-OTDLYDHC-0007.pdf", "magicapp-log-export-2026-09-13.csv",
  "network.har", "memory.heapsnapshot", "profile.cpuprofile", "learning.sqlite",
  "local.db", "local.db-wal", "premium-audit.json", "quiz_gas.js",
  "node_modules/unused/index.js", ".npm-cache/log.txt", "desktop.ini"
];
const requiredFiles = [
  "package.json", "package-lock.json", "vercel.json", "index.html", "quiz.html", "study-quiz.html",
  "service-worker.js", "learning-sync.js", "script.js", "quiz.js", "style.css",
  "api/learning-sync.mjs", "api/upstream-fetch.mjs", "api/quiz.js", "api/_quiz-bank.json",
  "lib/bounded-work-cache.mjs", "lib/quiz-audio-lookup.mjs",
  "src/learning-insights.js", "src/learning-insights.css", "src/daisyui.css",
  "data/patente/quiz-help-runtime-v2.json", "data/quiz-audio-legacy-collisions-v1.json",
  "assets/native-chapter-covers.json", "assets/chapter-covers/chapter-01.webp",
  "assets/fonts/norwester/norwester.woff", "assets/fonts/norwester/OFL.txt",
  "assets/fonts/adorsho-lipi/LICENSE-GPL-2.0.txt", "icons/mg_book.svg", "icons/more.gif"
];

function git(args, options = {}) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  } catch (error) {
    if (error.status === 1 && args.includes("check-ignore")) return String(error.stdout || "");
    throw error;
  }
}

// Exercise Git's real pattern engine, independently for each ignore file.
// No real credentials are created and the project index is never modified.
function matchRules(t, name, candidates) {
  const tempRoot = path.resolve(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(tempRoot, "magicbook-publish-ignore-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(fixture)), tempRoot);
    assert.ok(path.basename(fixture).startsWith("magicbook-publish-ignore-"));
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  git(["init", "--quiet", fixture]);
  fs.writeFileSync(path.join(fixture, ".gitignore"), fs.readFileSync(path.join(root, name)));
  return new Set(git(["-c", "core.excludesFile=", "check-ignore", "--no-index", "--stdin"], {
    cwd: fixture, input: candidates.join("\n") + "\n"
  }).trim().split(/\r?\n/).filter(Boolean));
}

for (const name of [".gitignore", ".vercelignore"]) {
  test(`${name} excludes private paths without blocking runtime/build dependencies`, t => {
    const matched = matchRules(t, name, [...privateFiles, ...requiredFiles]);
    for (const candidate of privateFiles) assert.ok(matched.has(candidate), `must exclude ${candidate}`);
    for (const candidate of requiredFiles) assert.equal(matched.has(candidate), false, `must keep ${candidate}`);
  });
}

test("development sources remain versioned but do not enter the Vercel deployment", t => {
  const developmentFiles = [
    "AGENTS.md", "CLAUDE.md", "DESIGN.md", "UX-CONTRACT.md", "premium-ui.json", ".env.example",
    "tests/repository-security.test.mjs", "scripts/update-local-backup.ps1", "skills/AI_PROJECT_RULES.md",
    "database/quiz_audio_sync.sql", "docs/QUIZ_AUDIO_IDENTITY_V2.md",
    "google-apps-script/magicbook_learning_db.gs", "google-apps-script/LEARNING-SYNC-UPDATE.md"
  ];
  const gitIgnored = matchRules(t, ".gitignore", developmentFiles);
  const deployIgnored = matchRules(t, ".vercelignore", developmentFiles);
  assert.equal(gitIgnored.size, 0);
  for (const candidate of developmentFiles) assert.ok(deployIgnored.has(candidate), `must not deploy ${candidate}`);
});

test("Git index contains no already-tracked files hidden by ignore rules", () => {
  const ignoredButTracked = git(["ls-files", "--cached", "--ignored", "--exclude-standard"]).trim();
  assert.equal(ignoredButTracked, "", "Use targeted git rm --cached, not disk deletion, for local-only tracked files");
});
