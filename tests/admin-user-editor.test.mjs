import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const page = read("index.html"), css = read("admin-user-editor.css"), script = read("script.js");
const modal = page.slice(page.indexOf('<div id="adminUserModal"'), page.indexOf('<div id="adminConfirmModal"'));

test("editor assets load after shared foundations and before native owners, with precached handlers", () => {
  assert.ok(page.indexOf("admin-user-editor.css?v=1") > page.indexOf("style.css"));
  assert.ok(page.indexOf("admin-user-editor.css?v=1") < page.indexOf("android-app-theme.css"));
  assert.match(read("service-worker.js"), /\/admin-user-editor\.css\?v=1/);
  for (const source of [page, read("service-worker.js")]) assert.match(source, /script\.js\?v=85-admin-editor/);
});
test("one desktop header groups six independent accessible phone, duration and access controls", () => {
  assert.equal((modal.match(/class="admin-editor-columns"/g)||[]).length, 1);
  assert.equal((modal.match(/class="admin-bulk-row"/g)||[]).length, 6);
  for (let i=1;i<=6;i++) assert.ok(modal.includes(`aria-label="QuizBank per Telefono ${i}"`));
  assert.equal((modal.match(/class="admin-qb-control" aria-hidden="true"/g)||[]).length, 7);
  assert.match(modal, /type="checkbox" aria-label="Accesso QuizBank"/);
  assert.doesNotMatch(modal, /role="switch"|onclick=".*QuizBank/);
});
test("wide worksheet and responsive single-owner scroller keep actions outside the scrolling body", () => {
  assert.match(css, /width: min\(920px, 100%\)/);
  assert.match(css, /width: min\(680px, 100%\)/);
  assert.match(css, /\.admin-editor-body[^}]+overflow-y: auto/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(modal, /<footer class="admin-modal-actions">/);
  assert.doesNotMatch(read("style.css"), /\.admin-bulk-row\s*\{/);
});
test("icon semantics, native date input and shared dialog/loading owners are retained", () => {
  assert.ok((modal.match(/aria-hidden="true"/g)||[]).length>=12);
  assert.match(modal, /aria-label="Chiudi"/);
  assert.match(modal, /id="adminModalExpiry" type="date"/);
  assert.match(modal, /magic-loading-control/);
  assert.match(script, /window\.MagicBookPopup\.mount\(modal/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
});
test("local summary and validation helpers make no requests or entitlement writes", () => {
  const helpers = script.slice(script.indexOf("function adminUpdateUserFormSummary("), script.indexOf("function adminOpenUserModal("));
  assert.doesNotMatch(helpers, /fetch\(|adminRequest\(|localStorage|setInterval/);
  assert.match(helpers, /numeri inseriti/);
  assert.match(helpers, /aria-invalid/);
  assert.match(helpers, /aria-describedby/);
  assert.match(helpers, /inputs\[0\]\?\.focus\(\)/);
});
