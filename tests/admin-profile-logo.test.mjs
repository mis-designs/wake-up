import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const profileAsset = new URL("../assets/admin/ADMIN_PROFILE_LOGO.jpg", import.meta.url);

test("the Admin entry and title share the supplied profile image", () => {
  const profileUses = page.match(/class="admin-profile-logo" src="assets\/admin\/ADMIN_PROFILE_LOGO\.jpg" alt=""/gu) || [];
  assert.equal(profileUses.length, 2);
  assert.doesNotMatch(page, /assets\/admin\/admin\.png/u);
  assert.ok(statSync(profileAsset).size > 0);
});

test("the Admin image fills both circular profile surfaces", () => {
  assert.match(styles, /\.admin-entry\s*\{[\s\S]*?border-radius:\s*50%;[\s\S]*?background:\s*#ffffff;[\s\S]*?backdrop-filter:\s*none;[\s\S]*?overflow:\s*hidden;/u);
  assert.match(styles, /\.admin-entry \.admin-profile-logo\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?border-radius:\s*inherit;[\s\S]*?object-fit:\s*cover;[\s\S]*?opacity:\s*1;[\s\S]*?mix-blend-mode:\s*normal;/u);
  assert.match(styles, /\.admin-title \.admin-profile-logo\s*\{[\s\S]*?width:\s*38px;[\s\S]*?height:\s*38px;[\s\S]*?border-radius:\s*50%;[\s\S]*?object-fit:\s*cover;[\s\S]*?opacity:\s*1;[\s\S]*?mix-blend-mode:\s*normal;/u);
});

test("the Admin and Profile buttons have opaque non-glass surfaces", () => {
  assert.match(styles, /\.profile-btn\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #d9e2ee;[\s\S]*?backdrop-filter:\s*none;[\s\S]*?-webkit-backdrop-filter:\s*none;/u);
  assert.match(styles, /\.admin-entry\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #d9e2ee;[\s\S]*?backdrop-filter:\s*none;[\s\S]*?-webkit-backdrop-filter:\s*none;/u);
});

test("the Admin profile image ships in the current PWA cache", () => {
  assert.match(page, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /CACHE_NAME = "magicbook-pwa-v159-solid-profile-controls"/u);
  assert.match(worker, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /assets\/admin\/ADMIN_PROFILE_LOGO\.jpg/u);
});
