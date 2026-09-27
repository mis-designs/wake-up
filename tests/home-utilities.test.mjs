import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
test('browser Home has one clean footer row and sponsor below, not a header promotion', () => {
  const home = read('index.html').split('<div class="card hidden" id="home">')[1].split('<template id="offerPopupTemplate">')[0];
  assert.doesNotMatch(home, /member-offers-link|Offerte|↗/);
  assert.match(home, /class="member-products" href="\/join" data-public-route="join">Our Products<\/a>/);
  assert.match(home, /member-profile-slot[^]*member-products[^]*member-whatsapp-slot[^]*member-sponsor/);
  assert.match(home, /member-sponsor[^]*facebook.com\/share\/14aaeMyWJGw/);
  assert.match(read('index.html'), /<button id="whatsappBtn"[^]*?aria-label="Contattaci su WhatsApp"/);
});
test('Home utility adapter reuses original nodes and leaves account/contact logic and native dock owned', () => {
  const owner = read('home-utilities.js');
  for (const id of ['profileBtn', 'profilePanel', 'whatsappBtn', 'adminEntryBtn']) assert.ok(owner.includes(`getElementById('${id}')`));
  assert.match(owner, /anchor.after\(node\)/);
  assert.match(owner, /android-webview/);
  assert.match(owner, /pagehide/);
  assert.match(owner, /visualViewport/);
  assert.match(owner, /event.key !== 'Escape'/);
  assert.doesNotMatch(owner, /cloneNode|innerHTML|fetch\(|localStorage|sessionStorage|setInterval|logout\(|openExternalUrl\(/);
  assert.match(read('script.js'), /profileVisible = isVisible\(profile\) && !profile.closest\('\.member-utilities'\)/);
  assert.match(read('script.js'), /adminVisible = isVisible\(adminEntry\) && !adminEntry.closest\('\.member-utilities'\)/);
  assert.match(read('script.js'), /if \(whatsappBtn.closest\('\.member-utilities'\)\) return/);
  assert.ok(read('home-offers.js').includes("'./home-utilities.js?v=2-admin'"));
  assert.ok(read('service-worker.js').includes('"/home-utilities.js?v=2-admin"'));
});
test('footer keeps neutral outlined products, in-flow controls and inherited keyboard/high-contrast states', () => {
  const css = read('home-offers.css');
  assert.match(css, /--member-utility-ink: #000/);
  assert.match(css, /\.member-products \{[^}]*border: 1.5px solid currentColor[^}]*background: transparent/);
  assert.match(css, /\.member-utilities #profileBtn, \.member-utilities #whatsappBtn, \.member-utilities #adminEntryBtn \{ position: static/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /focus-visible/);
  assert.match(css, /\.member-products \{ color: LinkText; \}/);
});
