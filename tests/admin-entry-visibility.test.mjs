import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const scriptSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const workerSource = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = scriptSource.indexOf(`function ${name}`);
  const end = scriptSource.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return scriptSource.slice(start, end);
}

test("the admin entry is hidden while the admin panel is already open", () => {
  const visibility = functionSource("updateAdminEntryVisibility", "refreshAdminEntryOnResume");
  assert.match(visibility, /adminPanelIsOpen/);
  assert.match(visibility, /!adminPanel\.classList\.contains\("hidden"\)/);
  assert.match(visibility, /isCurrentSessionAdmin\(\)[\s\S]*?!adminPanelIsOpen/);

  const openPanel = functionSource("showAdminPanel", "adminLoadUsers");
  assert.match(openPanel, /currentScreen = "admin";[\s\S]*?updateAdminEntryVisibility\(\)/);
});

test("leaving the admin panel restores the entry and ships the new script version", () => {
  const hideAll = functionSource("hideAll", "showHome");
  assert.match(hideAll, /adminPanel[\s\S]*?classList\.add\("hidden"\)[\s\S]*?updateAdminEntryVisibility\(\)/);
  assert.match(htmlSource, /script\.js\?v=58-reader-continuation/);
  assert.match(workerSource, /script\.js\?v=58-reader-continuation/);
  assert.match(workerSource, /CACHE_NAME = "magicbook-pwa-v125-card-spacing"/);
});
