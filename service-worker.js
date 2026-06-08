const CACHE_NAME = "magicbook-pwa-v13";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/quiz.html",
  "/style.css?v=6",
  "/mystyle.css?v=24",
  "/script.js?v=6",
  "/quiz.js?v=28",
  "/manifest.webmanifest",
  "/icons/mg_logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
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

  event.respondWith(
    fetch(request)
      .then(response => {
        if (request.mode === "navigate" && !response.ok) {
          return caches.match(url.pathname.startsWith("/quiz") ? "/quiz.html" : "/index.html")
            .then(cached => cached || response);
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
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
