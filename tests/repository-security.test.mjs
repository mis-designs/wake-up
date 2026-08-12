import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function productionSourceFiles(directory = ROOT) {
  const excludedDirectories = new Set([".git", "node_modules", "assets", "icons", "data", "tests"]);
  const allowedExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".sql"]);
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...productionSourceFiles(absolutePath));
    else if (allowedExtensions.has(path.extname(entry.name))) files.push(absolutePath);
  }

  return files;
}

test("local credentials and private keys are excluded from Git", () => {
  const gitignore = read(".gitignore");
  for (const pattern of [
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "credentials*.json",
    "service-account*.json",
    ".npmrc",
    "*_gas.js"
  ]) {
    assert.ok(gitignore.includes(pattern), `.gitignore must contain ${pattern}`);
  }
});

test("development files and Apps Script sources are excluded from Vercel", () => {
  const vercelignore = read(".vercelignore");
  for (const pattern of [
    ".env.*",
    "tests/",
    "scripts/",
    "skills/",
    "database/",
    "google-apps-script/",
    "*_gas.js",
    "*.pem",
    "*.key"
  ]) {
    assert.ok(vercelignore.includes(pattern), `.vercelignore must contain ${pattern}`);
  }
});

test("the environment template contains names only and no values", () => {
  const example = read(".env.example");
  for (const line of example.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    assert.match(line, /^[A-Z0-9_]+=$/, `.env.example value must stay empty: ${line.split("=", 1)[0]}`);
  }
});

test("server credential names never enter browser-delivered source files", () => {
  const browserFiles = [
    "index.html",
    "script.js",
    "quiz.js",
    "quiz-help.js",
    "study-quiz.js",
    "aggiungi-spiegazioni.js",
    "service-worker.js"
  ];
  const serverOnlyNames = [
    "GAS_SECRET",
    "GAS_ADMIN_KEY",
    "SESSION_SECRET",
    "ADMIN_LOGIN_PASSWORD",
    "TWILIO_AUTH_TOKEN",
    "QUIZ_PROXY_SECRET",
    "R2_SECRET_ACCESS_KEY",
    "DATABASE_URL",
    "PROMO_CODE_5_DAYS",
    "PROMO_CODE_5_DAYS_EXPIRES_AT",
    "PROMO_ALLOWED_HOSTS"
  ];

  for (const relativePath of browserFiles) {
    const source = read(relativePath);
    for (const name of serverOnlyNames) {
      assert.equal(source.includes(name), false, `${name} must remain server-only (${relativePath})`);
    }
  }
});

test("the local Apps Script reads its proxy secret from Script Properties", () => {
  const gasPath = path.join(ROOT, "quiz_gas.js");
  if (!fs.existsSync(gasPath)) return;
  const source = fs.readFileSync(gasPath, "utf8");
  assert.match(source, /PropertiesService\.getScriptProperties\(\)/);
  assert.match(source, /getProperty\(["']QUIZ_PROXY_SECRET["']\)/);
  assert.doesNotMatch(source, /QUIZ_PROXY_SECRET\s*=\s*["'][^"']+["']/);
});

test("production sources contain no hard-coded credential patterns", () => {
  const rules = new Map([
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
    ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{40,}/],
    ["Stripe secret", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/],
    ["credential URL", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+:[^\s"']+@/],
    [
      "sensitive literal assignment",
      /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|ADMIN_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*["'][^"']{6,}["']/i
    ]
  ]);

  for (const absolutePath of productionSourceFiles()) {
    const relativePath = path.relative(ROOT, absolutePath);
    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const [name, pattern] of rules) {
        assert.equal(pattern.test(line), false, `${name} detected at ${relativePath}:${index + 1}`);
      }
    });
  }
});
