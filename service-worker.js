const CACHE_NAME = "magicbook-pwa-v222-liquid-actions";
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
  "/loading-ui.css?v=2-compact",
  "/style.css?v=74-compact-loading",
  "/web-study-actions.css?v=2-liquid",
  "/web-study-actions.js?v=1",
  "/web-action-effects.js?v=1",
  "/icons/easy_video.gif",
  "/assets/easy-video-still.png",
  "/assets/new-class.gif",
  "/mobile-experience.css?v=4-admin-scroll",
  "/login-experience.css?v=4-pending-access",
  "/login-experience.js?v=2-unibody",
  "/login-signs.mjs?v=1",
  "/greeting-view.mjs?v=1-shared-login",
  "/icons/mdesignstextlogo.png",
  "/android-webview-mode.js?v=7-native-only",
  "/android-app-theme.css?v=12-study-contrast",
  "/assets/fonts/magicbook-latin-fonts.css?v=1",
  "/android-study-shell.css?v=20-liquid",
  "/android-study-shell.js?v=14-liquid",
  "/native-liquid-progress.mjs?v=1",
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
  "/video-class.css?v=7",
  "/video-class.js?v=5-indicator&art=2e0d6787e201",
  "/video-class-model.mjs?v=2",
  "/car-indicator.mjs?v=1",
  "/car-indicator.css?v=1",
  "/video-progress.mjs?v=1",
  "/video-player.mjs?v=1",
  "/assets/video-class/teacher.webp?v=2e0d6787e201",
  "/assets/video-class/road-basics.webp",
  "/assets/video-class/danger-signs.webp",
  "/assets/video-class/section-theory.webp",
  "/assets/video-class/section-quiz.webp",
  "/icons/save_before.svg",
  "/icons/save_after.svg",
  "/icons/link_interface_icon.svg",
  "/icons/favorite_section_icon_heart.png",
  "/icons/native-action-scallop.svg",
  "/icons/do_quiz.svg",
  "/icons/dictionary.svg",
  "/icons/human_talking.png",
  "/icons/more.gif",
  "/icons/exam.svg",
  "/icons/Statistics.png",
  "/icons/errors.png",
  "/magic-dictionary.css?v=1.4.1-dictionary-cleanup",
  "/screen-protection.css?v=1.1.0",
  "/offline-notice.css?v=1.0.0",
  "/offline-notice.js?v=1.1.0",
  "/learning-sync.js?v=6-local-review",
  "/italian-display.js?v=1",
  "/audio-focus.js?v=1-resumable-tts",
  "/app-popup.js?v=2",
  "/figure-detail.js?v=2",
  "/figure-detail.css?v=2",
  "/figure-catalog.mjs?v=1",
  "/src/learning-insights.css?v=11-study-results&ui=10",
  "/src/learning-insights.js?v=12-study-results&ui=9-intact-figures",
  "/homebg.css?v=3",
  "/mystyle.css?v=60-web-quiz-layout",
  "/audio-player-ui.css?v=10-web-quiz-slim",
  "/script.js?v=78-web-study-actions",
  "/study-quiz.html",
  "/study-quiz.css?v=28-compact",
  "/study-quiz.js?v=36-car-indicator&art=2e0d6787e201",
  "/figure-study.css?v=2",
  "/figure-study.js?v=2",
  "/figure-study-catalog.mjs?v=2",
  "/figure-study-data.mjs?v=2",
  "/figure-study-notes.mjs?v=1",
  "/quiz-audio-identity.js?v=2-live-catalog-reconcile",
  "/quiz.js?v=87-local-review",
  "/quiz-help.css?v=20260920-web-layout-2",
  "/quiz-help.js?v=20260920-web-inline",
  "/patenteGlossaryResolver.js?v=1.0.0",
  "/patenteContextResolverV3.js?v=4.0.0-glossary-display",
  "/quizHelpRuntimeV3Loader.js?v=3.0.2-translation-integrity",
  "/quiz-help-preview.js?v=1-personal-bangla-preview",
  "/magic-dictionary.js?v=1.4.1-dictionary-cleanup",
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

// Only explicitly versioned, bundled public files are immutable for a release.
// HTML, APIs, manifests, mutable images and explicit reload/no-store requests
// keep their existing network-first behavior.
const VERSIONED_STATIC_ASSETS = new Set(STATIC_ASSETS.filter(asset => {
  const url = new URL(asset, self.location.origin);
  return url.searchParams.has("v") && /\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|svg|webp|gif)$/i.test(url.pathname);
}));
function reusableStaticResponse(response) {
  return response?.ok && !/\b(?:private|no-store)\b/i.test(response.headers.get("Cache-Control") || "");
}

async function installStaticAssets() {
  const cache = await caches.open(CACHE_NAME);
  const previous = (await caches.keys()).filter(key => key.startsWith("magicbook-pwa-") && key !== CACHE_NAME);
  await Promise.allSettled(STATIC_ASSETS.map(async asset => {
    if (VERSIONED_STATIC_ASSETS.has(asset)) {
      for (const key of previous) {
        const saved = await (await caches.open(key)).match(asset);
        if (reusableStaticResponse(saved)) {
          await cache.put(asset, saved);
          return;
        }
      }
    }
    await cache.add(asset);
  }));
}

self.addEventListener("install", event => {
  event.waitUntil(
    installStaticAssets().catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith("magicbook-pwa-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (url.origin === self.location.origin && request.mode !== "navigate"
    && !["reload", "no-store", "no-cache"].includes(request.cache)
    && !request.headers.has("Authorization")
    && VERSIONED_STATIC_ASSETS.has(url.pathname + url.search)) {
    event.respondWith((async () => {
      let cache;
      let saved;
      try {
        cache = await caches.open(CACHE_NAME);
        saved = await cache.match(request);
      } catch (_) { /* Private mode/quota errors must not prevent an online load. */ }
      if (reusableStaticResponse(saved)) return saved;
      const response = await fetch(request);
      if (cache && reusableStaticResponse(response)) {
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      }
      return response;
    })());
    return;
  }

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
