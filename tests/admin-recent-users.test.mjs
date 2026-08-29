import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { selectRecentAdminUsers } from "../api/admin.js";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const script = read("script.js");
const page = read("index.html");
const styles = read("style.css");
const api = read("api/admin.js");

function readFunction(name, nextName) {
  const start = script.indexOf(`function ${name}`);
  const end = script.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return script.slice(start, end);
}

test("the recent-user response is bounded to the ten newest registrations", () => {
  const users = Array.from({ length: 14 }, (_, index) => ({
    phone: `3933300000${String(index).padStart(2, "0")}`,
    registration_date: new Date(Date.UTC(2026, 0, index + 1)).toISOString()
  }));
  const recent = selectRecentAdminUsers(users);

  assert.equal(recent.length, 10);
  assert.equal(recent[0].phone, users[13].phone);
  assert.equal(recent[9].phone, users[4].phone);

  const sheetOrderFallback = selectRecentAdminUsers(users.map(({ phone }) => ({ phone })), 3);
  assert.deepEqual(sheetOrderFallback.map(user => user.phone), [users[13].phone, users[12].phone, users[11].phone]);
});

test("Admin opens with recent users and loads the full list only on explicit demand", () => {
  const showAdmin = readFunction("showAdminPanel", "getAdminResponseUsers");
  const loadUsers = readFunction("adminLoadUsers", "adminLoadPromoUsers");
  const loadAll = readFunction("adminLoadAllUsers", "adminRefreshUsers");

  assert.match(showAdmin, /adminLoadUsers\(false, "recent"\)/u);
  assert.match(loadUsers, /mode === "all" \? "list" : mode === "search" \? "search" : "recent"/u);
  assert.match(loadAll, /adminLoadUsers\(true, "all"\)/u);
  assert.match(page, /id="adminDatasetTitle">Ultimi 10 utenti aggiunti/u);
  assert.match(page, /id="adminLoadAllUsers"[^>]*>Carica tutti gli utenti<\/button>/u);
  assert.match(styles, /\.admin-dataset-bar\s*\{[\s\S]*?justify-content:\s*space-between;/u);
});

test("phone lookup is debounced, remote and protected from stale responses", () => {
  const scheduleSearch = readFunction("scheduleAdminPhoneSearch", "clearAdminPhoneSearch");
  const loadUsers = readFunction("adminLoadUsers", "adminLoadPromoUsers");

  assert.match(script, /ADMIN_SEARCH_DEBOUNCE_MS = 300/u);
  assert.match(scheduleSearch, /adminState\.loadVersion \+= 1/u);
  assert.match(scheduleSearch, /adminLoadUsers\(true, "search"\)/u);
  assert.match(loadUsers, /adminRequest\(action, mode === "search" \? \{ phone \} : \{\}\)/u);
  assert.match(loadUsers, /if \(loadVersion !== adminState\.loadVersion\) return;/u);
  assert.match(page, /id="adminSearchInput"[^>]*aria-label="Cerca per numero di telefono"/u);
});

test("recent and search remain authenticated read-only server actions", () => {
  assert.match(api, /const ADMIN_RECENT_LIMIT = 10/u);
  assert.match(api, /"recent",[\s\S]*?"search"/u);
  assert.match(api, /if \(action === "recent"\) return "admin_list"/u);
  assert.match(api, /fields\.limit = ADMIN_RECENT_LIMIT;[\s\S]*?fields\.order = "registration_desc";/u);
  assert.match(script, /readOnlyAction = action === "recent" \|\| action === "list" \|\| action === "search" \|\| action === "promo_users"/u);
});

test("promo metadata stays lazy until the complete dataset is requested", () => {
  const setup = readFunction("setupAdminUI", "showAdminPanel");
  const loadUsers = readFunction("adminLoadUsers", "adminLoadPromoUsers");

  assert.match(setup, /adminState\.tab === "promo"[\s\S]*?adminState\.mode === "all"/u);
  assert.match(loadUsers, /mode === "all" && adminState\.tab === "promo"/u);
  assert.match(script, /Per vedere \$\{sectionName\} servono tutti i record\./u);
});
