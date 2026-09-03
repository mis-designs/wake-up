import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const page = read("index.html");
const script = read("script.js");
const styles = read("style.css");
const worker = read("service-worker.js");

function readFunction(name, nextName) {
  const start = script.indexOf(`function ${name}`);
  const end = script.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return script.slice(start, end);
}

test("Admin phone search is an accessible icon-led pill without visible filler copy", () => {
  const searchInput = page.match(/<input id="adminSearchInput"[^>]*>/u)?.[0] || "";

  assert.match(page, /<div class="admin-search" role="search">/u);
  assert.match(page, /class="admin-search-icon" aria-hidden="true"[\s\S]*?<circle cx="11" cy="11" r="7"/u);
  assert.match(searchInput, /aria-label="Cerca per numero di telefono"/u);
  assert.doesNotMatch(searchInput, /placeholder=/u);
  assert.match(page, /id="adminSearchClear"[\s\S]*?M7 7L17 17M17 7L7 17/u);

  assert.match(styles, /\.admin-toolbar\s*\{[\s\S]*?--admin-pill-radius:\s*999px;[\s\S]*?--admin-pill-height:\s*56px;/u);
  assert.match(styles, /\.admin-search-box\s*\{[\s\S]*?border-radius:\s*var\(--admin-pill-radius\);/u);
  assert.match(styles, /\.admin-search-icon\s*\{[\s\S]*?radial-gradient[\s\S]*?var\(--admin-user-mid\)/u);
  assert.match(styles, /\.admin-search-box:focus-within\s*\{[\s\S]*?0 0 0 3px/u);
});

test("Admin filters share pill geometry, semantic accents and complete tab state", () => {
  assert.equal((page.match(/class="admin-tab(?: is-active)?"[^>]*role="tab"/gu) || []).length, 5);
  assert.match(page, /id="adminTabUsers"[^>]*aria-selected="true"[^>]*aria-controls="adminUserList"/u);
  assert.match(page, /id="adminUserList"[^>]*role="tabpanel"[^>]*aria-labelledby="adminTabUsers"/u);

  assert.match(styles, /\.admin-tab\s*\{[\s\S]*?border-radius:\s*var\(--admin-pill-radius\);/u);
  assert.match(styles, /data-admin-tab="users"[\s\S]*?--admin-tab-accent:\s*#10b981;/u);
  assert.match(styles, /data-admin-tab="promo"[\s\S]*?--admin-tab-accent:\s*#8b5cf6;/u);
  assert.match(styles, /data-admin-tab="expiring"[\s\S]*?--admin-tab-accent:\s*#f59e0b;/u);
  assert.match(styles, /data-admin-tab="expired"[\s\S]*?--admin-tab-accent:\s*#ef4444;/u);
  assert.match(styles, /data-admin-tab="duplicates"[\s\S]*?--admin-tab-accent:\s*#64748b;/u);
});

test("Admin filters support arrow, Home and End navigation without weakening search IME safety", () => {
  const setup = readFunction("setupAdminUI", "showAdminPanel");
  const setTab = readFunction("setAdminTab", "showAdminDuplicateUsers");

  assert.match(setup, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/u);
  assert.match(setup, /adminTabs\[nextIndex\]\?\.focus\(\);[\s\S]*?adminTabs\[nextIndex\]\?\.click\(\);/u);
  assert.match(setup, /event\.isComposing \|\| adminState\.searchComposing/u);
  assert.match(setTab, /setAttribute\("aria-selected", isActive \? "true" : "false"\)/u);
  assert.match(setTab, /btn\.tabIndex = isActive \? 0 : -1/u);
});

test("Admin control redesign ships through fresh PWA assets", () => {
  assert.match(page, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(page, /script\.js\?v=68-native-fluidity/u);
  assert.match(worker, /magicbook-pwa-v159-solid-profile-controls/u);
  assert.match(worker, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /script\.js\?v=68-native-fluidity/u);
});
