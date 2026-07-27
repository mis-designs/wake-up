const CACHE_NAME = "magicbook-pwa-v28-quiz-audio-identity-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/quiz.html",
  "/style.css?v=37",
  "/homebg.css?v=3",
  "/mystyle.css?v=26",
  "/script.js?v=18",
  "/quiz-audio-identity.js?v=2",
  "/quiz.js?v=38-audio-identity-v2",
  "/quiz-help.css?v=20260714-magic-help-v4",
  "/quiz-help.js?v=20260714-magic-help-v4",
  "/data/patente/quiz-help-runtime-v2.json?v=20260713-magic-help-v2",
  "/manifest.webmanifest?v=16",
  "/icons/mg_logo.png",
  "/icons/intro01.jpg?v=20260701"
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
          return caches.match(url.pathname.startsWith("/quiz") ? "/quiz.html" : "/index.html")
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
          return caches.match(url.pathname.startsWith("/quiz") ? "/quiz.html" : "/index.html");
        }
        return caches.match(request);
      })
  );
});
