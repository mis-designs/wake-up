(function magicBookSilentContentProtection() {
  "use strict";

  if (window.__MAGICBOOK_SCREEN_PROTECTION__) return;
  Object.defineProperty(window, "__MAGICBOOK_SCREEN_PROTECTION__", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const PROTECTED_PATHS = [
    /^\/(?:home|capitoli|dizionario|admin)(?:\/|$)/,
    /^\/magic-book(?:\/|$)/,
    /^\/quiz(?:\.html)?(?:\/|$)/,
    /^\/(?:studia-quiz|study-quiz(?:\.html)?)(?:\/|$)/,
    /^\/aggiungi-spiegazioni(?:\.html)?(?:\/|$)/,
    /^\/prova-gratis\/libro-(?:1|3)(?:\/|$)/
  ];
  const PUBLIC_PATHS = new Set(["/", "/login", "/join", "/about", "/prova-gratis"]);
  let active = false;

  function normalizePath(pathname = window.location.pathname) {
    return String(pathname || "/").replace(/\/+$/, "") || "/";
  }

  function routeNeedsProtection(pathname = window.location.pathname) {
    const path = normalizePath(pathname);
    if (PUBLIC_PATHS.has(path)) return false;
    return PROTECTED_PATHS.some(pattern => pattern.test(path));
  }

  function pageNeedsProtection() {
    const body = document.body;
    if (!body) return routeNeedsProtection();
    if (body.dataset.screenProtection === "always") return true;
    if (body.classList.contains("public-mode")) return false;
    if (body.classList.contains("app-mode") || body.classList.contains("admin-mode")) return true;
    return routeNeedsProtection();
  }

  function refreshProtection() {
    active = pageNeedsProtection();
    document.documentElement.dataset.screenProtected = String(active);
  }

  function isEditableTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [data-screen-protection-allow]"));
  }

  function blockProtectedAction(event) {
    if (!active || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  ["copy", "cut", "dragstart", "contextmenu", "selectstart"].forEach(type => {
    document.addEventListener(type, blockProtectedAction, true);
  });

  function isBlockedShortcut(event) {
    const key = String(event.key || "");
    const lowerKey = key.toLowerCase();
    const printScreen = key === "PrintScreen" || event.code === "PrintScreen";
    const macCapture = event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key);
    const saveOrPrint = (event.ctrlKey || event.metaKey) && ["p", "s"].includes(lowerKey);
    const snippingShortcut = event.ctrlKey && event.shiftKey && lowerKey === "s";
    return printScreen || macCapture || saveOrPrint || snippingShortcut;
  }

  function blockProtectedShortcut(event) {
    if (!active || !isBlockedShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  document.addEventListener("keydown", blockProtectedShortcut, true);
  document.addEventListener("keyup", event => {
    if (event.key === "PrintScreen" || event.code === "PrintScreen") {
      blockProtectedShortcut(event);
    }
  }, true);

  window.addEventListener("popstate", refreshProtection, true);
  window.addEventListener("hashchange", refreshProtection, true);
  window.addEventListener("pageshow", refreshProtection, true);

  if (typeof MutationObserver === "function" && document.body) {
    new MutationObserver(refreshProtection).observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-screen-protection"]
    });
  }

  refreshProtection();
})();
