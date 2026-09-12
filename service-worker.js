const CACHE_NAME = "magicbook-pwa-v195-web-open-paper";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/quiz.html",
  "/libreria-font.html",
  "/libreria-font.css?v=3-glass-specimen",
  "/magic-styles.css?v=3-liquid-glass",
  "/icons/magic-sparkles.svg",
  "/privacypolicy.html",
  "/privacy-policy.css?v=1-editorial-policy",
  "/privacy-policy.js?v=1-index-navigation",
  "/assets/fonts/magicbook-bangla-fonts.css?v=1-adorsho",
  "/assets/daisyui.css?v=2-learning-shell",
  "/loading-ui.css?v=1-shared-gif-loader",
  "/style.css?v=73-open-hand",
  "/mobile-experience.css?v=4-admin-scroll",
  "/login-experience.css?v=3-shared-font",
  "/login-experience.js?v=2-unibody",
  "/login-signs.mjs?v=1",
  "/greeting-view.mjs?v=1-shared-login",
  "/icons/mdesignstextlogo.png",
  "/android-webview-mode.js?v=7-native-only",
  "/android-app-theme.css?v=10-shared-login",
  "/android-app-theme.css?v=11-shared-quiz",
  "/assets/fonts/magicbook-latin-fonts.css?v=1",
  "/android-study-shell.css?v=19-open-hand",
  "/android-study-shell.js?v=13-shared-login",
  "/android-mode-screens.css?v=2-thumb",
  "/android-mode-screens.js?v=2-thumb",
  "/icons/native-chapter-clover.svg",
  "/android-rotary-model.mjs?v=8-bangla-greetings",
  "/assets/native-chapter-covers.json",
  "/assets/fonts/norwester/norwester.woff",
  "/assets/fonts/el-messiri/ElMessiri.ttf",
  "/icons/mg_book.svg",
  "/icons/clich_here.svg",
  "/icons/Arrow%20bent%20upword%20icon.svg",
  "/icons/Arrow%20bent%20downward%20icon.svg",
  "/icons/native/lines_left_side.svg",
  "/icons/native/lines_right_side.svg",
  "/icons/native/roudabout.svg",
  "/icons/study_quiz.svg",
  "/icons/native-action-scallop.svg",
  "/icons/do_quiz.svg",
  "/icons/dictionary.svg",
  "/icons/exam.svg",
  "/icons/Statistics.png",
  "/icons/errors.png",
  "/magic-dictionary.css?v=1.2.5-settings-layout",
  "/screen-protection.css?v=1.1.0",
  "/offline-notice.css?v=1.0.0",
  "/offline-notice.js?v=1.0.0",
  "/learning-sync.js?v=2",
  "/italian-display.js?v=1",
  "/audio-focus.js?v=1-resumable-tts",
  "/src/learning-insights.css?v=9-card-spacing&ui=10",
  "/src/learning-insights.js?v=9-session-storage-recovery&ui=9-intact-figures",
  "/homebg.css?v=3",
  "/mystyle.css?v=56-web-open-paper",
  "/audio-player-ui.css?v=6-admin-unified",
  "/audio-player-ui.css?v=8-native-quiz",
  "/script.js?v=74-quiz-thumb",
  "/study-quiz.html",
  "/study-quiz.css?v=26-numberless-figures",
  "/study-quiz.js?v=27-audio-speed",
  "/quiz-audio-identity.js?v=2-live-catalog-reconcile",
  "/quiz.js?v=85-audio-speed",
  "/quiz-help.css?v=20260912-thumb-close",
  "/quiz-help.js?v=20260910-phone-help",
  "/patenteGlossaryResolver.js?v=1.0.0",
  "/patenteContextResolverV3.js?v=4.0.0-glossary-display",
  "/quizHelpRuntimeV3Loader.js?v=3.0.2-translation-integrity",
  "/quiz-help-preview.js?v=1-personal-bangla-preview",
  "/magic-dictionary.js?v=1.2.6-audio-focus",
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
  "/assets/admin/ADMIN_PROFILE_LOGO.jpg",
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

  const fallbackPage = url.pathname.startsWith("/privacypolicy")
    ? "/privacypolicy.html"
    : url.pathname.startsWith("/libreria-font")
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
