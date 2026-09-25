// Presentation only: existing public routing, authentication and package actions stay in script.js.
const landing = document.getElementById('landing');
const book = document.getElementById('welcomeBook');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const contrast = matchMedia('(forced-colors: active)');
let pageHidden = false;

function syncMotion() {
  const disabled = reduced.matches || contrast.matches || document.documentElement.dataset.nativeMotionPaused === 'true';
  const running = !disabled && !pageHidden && !document.hidden && !landing.classList.contains('hidden');
  landing.dataset.motion = running ? 'running' : 'paused';
}

reduced.addEventListener('change', syncMotion);
contrast.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', syncMotion);
window.addEventListener('pagehide', () => { pageHidden = true; syncMotion(); });
window.addEventListener('pageshow', () => { pageHidden = false; syncMotion(); });
new MutationObserver(syncMotion).observe(landing, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(syncMotion).observe(document.documentElement, { attributes: true, attributeFilter: ['data-native-motion-paused'] });

function bookFallback() {
  book.hidden = true;
  const fallback = landing.querySelector('.welcome-book-fallback');
  fallback.hidden = false;
  fallback.setAttribute('role', 'img');
  fallback.setAttribute('aria-label', book.alt);
}
book.addEventListener('error', bookFallback, { once: true });
if (book.complete && !book.naturalWidth) bookFallback();

// Native links retain new-tab/copy-link semantics; no delayed routing or extra requests.
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-public-route]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const navigate = { welcome: window.showLandingScreen, login: window.showLoginScreen, join: window.showJoinScreen }[link.dataset.publicRoute];
  if (!navigate) return;
  event.preventDefault();
  navigate();
  window.scrollTo({ top: 0, behavior: 'instant' });
});

// Shared public-route focus also covers existing package Back and browser history.
// Never autofocus the phone field (and unexpectedly summon a mobile keyboard).
for (const [id, headingId] of [['landing', 'welcomeTitle'], ['login', 'loginTitle'], ['join', 'joinPackagesTitle']]) {
  const screen = document.getElementById(id);
  let visible = !screen.classList.contains('hidden');
  new MutationObserver(() => {
    const next = !screen.classList.contains('hidden');
    if (next && !visible) {
      const heading = document.getElementById(headingId);
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    visible = next;
  }).observe(screen, { attributes: true, attributeFilter: ['class'] });
}
syncMotion();
