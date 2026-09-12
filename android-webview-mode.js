(function activateAndroidWebViewMode() {
  "use strict";

  const userAgent = navigator.userAgent || "";
  // Android's generic "wv" flag also belongs to Facebook, Messenger and other
  // embedded browsers. Only our wrapper's explicit product token opts into this UI.
  // This is a presentation signal, never an authentication or access check.
  const isMagicBookAndroidApp = /Android/i.test(userAgent)
    && /(?:^|\s)MagicBookViewer\/\d+(?:\.\d+)*(?=\s|$)/i.test(userAgent);

  if (!isMagicBookAndroidApp) return;

  const root = document.documentElement;
  root.classList.add("android-webview");
  root.dataset.appPalette = "aura-fluid";

  const syncThemeColor = () => {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    // The theme stylesheet owns the color; the marker also preserves the existing drag mode.
    const primary = getComputedStyle(root).getPropertyValue("--app-palette-primary").trim();
    if (themeColor && primary) themeColor.setAttribute("content", primary);
  };

  const attachThemeColor = () => {
    const stylesheet = document.querySelector('link[href*="/android-app-theme.css"]');
    // DOMContentLoaded can precede the stylesheet on a cold connection.
    if (stylesheet && !stylesheet.sheet) {
      stylesheet.addEventListener("load", syncThemeColor, { once: true });
    }
    syncThemeColor();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachThemeColor, { once: true });
  } else {
    attachThemeColor();
  }
})();
