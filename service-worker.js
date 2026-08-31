const CACHE_NAME = "magicbook-pwa-v153-transparent-svg-player";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/quiz.html",
  "/libreria-font.html",
  "/libreria-font.css?v=1-three-fonts",
  "/assets/fonts/magicbook-bangla-fonts.css?v=1-adorsho",
  "/assets/daisyui.css?v=2-learning-shell",
  "/loading-ui.css?v=1-shared-gif-loader",
  "/style.css?v=70-whatsapp-dialog",
  "/magic-dictionary.css?v=1.2.5-settings-layout",
  "/screen-protection.css?v=1.1.0",
  "/offline-notice.css?v=1.0.0",
  "/offline-notice.js?v=1.0.0",
  "/learning-sync.js?v=2",
  "/src/learning-insights.css?v=9-card-spacing&ui=10",
  "/src/learning-insights.js?v=5-figure-explanation-ui&ui=7-shared-gif-loader",
  "/homebg.css?v=3",
  "/mystyle.css?v=49-single-surface-loader",
  "/audio-player-ui.css?v=3-transparent-svg-only",
  "/script.js?v=67-promo-ui-disabled",
  "/study-quiz.html",
  "/study-quiz.css?v=24-shared-gif-loader",
  "/study-quiz.js?v=20-emerald-glass-svg",
  "/quiz-audio-identity.js?v=2-live-catalog-reconcile",
  "/quiz.js?v=75-audio-player-pill",
  "/quiz-help.css?v=20260829-a11y-trigger-label",
  "/quiz-help.js?v=20260831-shared-gif-loader",
  "/patenteGlossaryResolver.js?v=1.0.0",
  "/patenteContextResolverV3.js?v=4.0.0-glossary-display",
  "/quizHelpRuntimeV3Loader.js?v=3.0.2-translation-integrity",
  "/quiz-help-preview.js?v=1-personal-bangla-preview",
  "/magic-dictionary.js?v=1.2.5-shared-gif-loader",
  "/screen-protection.js?v=1.2.0",
  "/icons/no-internet.gif",
  "/icons/explain_quiz.svg",
  "/icons/loading.gif",
  "/icons/superato.png",
  "/icons/statistiche-patente.png",
  "/icons/errori-patente.png",
  "/icons/go-back.png",
  "/icons/next.png",
  "/assets/admin/update.png",
  "/data/patente/quiz-help-runtime-v2.json",
  "/manifest.webmanifest?v=16",
  "/icons/mg_logo.png",
  "/icons/ui%20mobile.svg",
  "/icons/intro01.jpg?v=20260701",
  "/assets/images/study_quiz_section_cover.png",
  "/assets/fonts/hadi-rounded/hadi-rounded-regular.woff2?v=1",
  "/assets/fonts/adorsho-lipi/adorsho-lipi-regular.woff2?v=1",
  "/assets/fonts/ekushey-lal-sabuj/ekushey-lal-sabuj-regular.woff2?v=1"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        STATIC_ASSETS.map(asset => cache.add(asset))
      ))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" && (url.pathname === "/index.html" || url.pathname === "/quiz.html")) {
    event.respondWith(Response.redirect("/", 302));
    return;
  }

  const fallbackPage = url.pathname.startsWith("/libreria-font")
    ? "/libreria-font.html"
    : url.pathname.startsWith("/studia-quiz")
      ? "/study-quiz.html"
      : url.pathname.startsWith("/quiz")
        ? "/quiz.html"
        : "/index.html";

  // The admin recorder must always receive the current Permissions-Policy
  // header. Never serve or store an older cached copy of this page.
  if (url.pathname === "/aggiungi-spiegazioni" || url.pathname === "/aggiungi-spiegazioni.html") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (request.mode === "navigate" && !response.ok) {
          return caches.match(fallbackPage)
            .then(cached => cached || response);
        }

        if (url.origin === self.location.origin && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => {
        if (request.mode === "navigate") {
          return caches.match(fallbackPage);
        }
        return caches.match(request);
      })
  );
});
