import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const page=read("index.html"), css=read("admin-panel.css"), script=read("script.js");

test("owner correction retains original identity, pill controls and two-column cards",()=>{
  assert.match(page,/<span>Admin Panel<\/span>/);
  assert.match(page,/data-admin-tab="users">Users<\/button>/);
  assert.match(page,/admin-action-pill__label">Nuovo utente/);
  assert.match(page,/admin-action-pill__label">Aggiungi spiegazioni audio/);
  assert.doesNotMatch(page,/admin-record-head|adminPanelHeading/);
  assert.doesNotMatch(script,/function adminRecordIcon\(/);
  for(const file of ['edit','renew','reset','trash']) assert.ok(script.includes(`assets/admin/${file}.png`));
  assert.match(read('style.css'),/\.admin-user-list\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
test("spacing adapter cannot replace the palette, fonts, shadows or component language",()=>{
  assert.doesNotMatch(css,/(?:^|[;{\s])(?:color|background(?:-color|-image)?|font(?:-family|-size|-weight)?|box-shadow|border-color)\s*:/m);
  assert.match(css,/--admin-content-inset: 20px/);
  assert.match(css,/\.admin-toolbar \{ padding: var\(--admin-content-inset\); gap: 18px/);
  assert.match(css,/\.admin-tools-row \{ gap: 20px/);
  assert.match(css,/@media \(max-width: 1040px\)/);
  assert.match(css,/@media \(max-width: 640px\)/);
  assert.doesNotMatch(css,/height:\s*100(?:d?v)h|overflow-y:\s*(?:auto|scroll)/);
});
test("spacing assets are versioned after the editor and before native owners",()=>{
  assert.ok(page.indexOf('admin-panel.css?v=2-spacing')>page.indexOf('admin-user-editor.css?v=1'));
  assert.ok(page.indexOf('admin-panel.css?v=2-spacing')<page.indexOf('android-app-theme.css'));
  assert.match(read('service-worker.js'),/\/admin-panel\.css\?v=2-spacing/);
  assert.match(read('service-worker.js'),/magicbook-pwa-v254-quizbank-header/);
  assert.match(css,/\.admin-search-clear\.hidden \{ display: none/);
});
