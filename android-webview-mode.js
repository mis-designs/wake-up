(function activateAndroidWebViewMode() {
  "use strict";

  const userAgent = navigator.userAgent || "";
  const isAndroidWebView = /Android/i.test(userAgent)
    && (/\bwv\b/i.test(userAgent) || /MagicBookViewer/i.test(userAgent));

  if (!isAndroidWebView) return;

  const root = document.documentElement;
  root.classList.add("android-webview");
  root.dataset.appPalette = "aura-fluid";

  const syncThemeColor = () => {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", "#5B1E91");
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncThemeColor, { once: true });
  } else {
    syncThemeColor();
  }
})();
