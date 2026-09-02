import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Admin utility actions use semantic icon pills with three distinct palettes", () => {
  const page = read("index.html");
  const styles = read("style.css");
  const worker = read("service-worker.js");

  assert.match(page, /class="admin-utility-actions" role="group" aria-label="Azioni amministrative"/u);
  assert.match(page, /<button class="admin-new-btn admin-action-pill admin-action-pill--user"[^>]*onclick="adminOpenUserModal\('create'\)"/u);
  assert.match(page, /<a class="admin-new-btn admin-action-pill admin-action-pill--audio" href="\/aggiungi-spiegazioni">/u);
  assert.match(page, /<a class="admin-new-btn admin-action-pill admin-action-pill--font" href="\/libreria-font">/u);
  assert.equal((page.match(/class="admin-action-pill__icon"/gu) || []).length, 3);
  assert.equal((page.match(/class="admin-action-pill__label"/gu) || []).length, 3);
  assert.match(page, /M20 12V13C20 17\.4183/u);
  assert.match(page, /M12 15\.5H7\.5/u);
  assert.match(page, /M18\.5 8V3M5\.5 21V16/u);

  assert.match(styles, /\.admin-action-pill\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?border-radius:\s*999px;/u);
  assert.match(styles, /\.admin-toolbar\s*\{[\s\S]*?--admin-user-mid:\s*#10b981;/u);
  assert.match(styles, /\.admin-action-pill--user\s*\{[\s\S]*?--admin-action-mid:\s*var\(--admin-user-mid\);/u);
  assert.match(styles, /\.admin-action-pill--audio\s*\{[\s\S]*?--admin-action-mid:\s*#ef4444;/u);
  assert.match(styles, /\.admin-action-pill--font\s*\{[\s\S]*?--admin-action-mid:\s*#8b5cf6;/u);
  assert.match(styles, /\.admin-action-pill:focus-visible\s*\{[\s\S]*?outline:\s*3px solid #263bd4;/u);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.admin-action-pill\s*\{\s*width:\s*100%;/u);
  assert.match(page, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /style\.css\?v=72-solid-profile-controls/u);
});
