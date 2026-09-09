import { LOGIN_SIGNS, SIGN_HOLD_MS, signEntrance, signAssetUrl } from "./login-signs.mjs?v=1";

// Presentation only. script.js remains the single authentication/validation owner.
const loginScreen = document.getElementById("login");
if (loginScreen) {
  const sign = document.getElementById("loginSign");
  const art = sign.querySelector("img");
  const caption = sign.querySelector("figcaption");
  const toggle = document.getElementById("loginMotionToggle");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const loaded = new Map();
  const failed = new Set();
  let selected = -1, step = 0, timer = 0, frame = 0, viewportTimer = 0, revision = 0;
  let pending = null, motion = null, userPaused = false, pageHidden = false;
  let active = false, runnable = false;
  const visible = () => !loginScreen.classList.contains("hidden") && !document.hidden && !pageHidden;
  const canRun = () => visible() && !userPaused && !reduced.matches && !loginScreen.querySelector(".login-form").contains(document.activeElement) && !document.documentElement.hasAttribute("data-native-motion-paused");

  function cancelWork() {
    revision++;
    clearTimeout(timer); timer = 0;
    pending?.abort(); pending = null;
    motion?.cancel(); motion = null;
  }
  function loadImage(index, signal) {
    if (loaded.has(index)) return Promise.resolve(loaded.get(index));
    return new Promise((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        image.onload = image.onerror = null;
        if (error) { image.removeAttribute("src"); reject(error); }
        else { loaded.set(index, image); resolve(image); }
      };
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      const timeout = setTimeout(() => finish(new Error("Image unavailable")), 6000);
      image.onload = () => image.decode().then(() => finish(), finish);
      image.onerror = () => finish(new Error("Image unavailable"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) return abort();
      image.src = signAssetUrl(LOGIN_SIGNS[index]);
    });
  }
  async function animate(frames, duration) {
    if (!canRun() || !sign.animate) return;
    motion = sign.animate(frames, { duration, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" });
    try { await motion.finished; } catch { /* Navigation/focus cancels presentation. */ }
  }
  function schedule() {
    clearTimeout(timer);
    if (canRun() && selected >= 0 && failed.size < LOGIN_SIGNS.length - 1)
      timer = setTimeout(() => showNext((selected + 1) % LOGIN_SIGNS.length), SIGN_HOLD_MS);
  }
  async function showNext(start) {
    const ticket = ++revision;
    const controller = new AbortController();
    pending?.abort(); pending = controller;
    for (let offset = 0; offset < LOGIN_SIGNS.length; offset++) {
      const index = (start + offset) % LOGIN_SIGNS.length;
      if (failed.has(index) || index === selected) continue;
      try {
        const image = await loadImage(index, controller.signal);
        if (ticket !== revision || !visible()) return;
        if (selected >= 0) {
          await animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-7px) scale(.98)" }], 320);
          if (ticket !== revision || !visible()) return;
        }
        motion?.cancel(); motion = null;
        selected = index;
        art.src = image.src;
        caption.textContent = LOGIN_SIGNS[index].meaning;
        sign.setAttribute("aria-label", LOGIN_SIGNS[index].title);
        sign.setAttribute("data-ready", "");
        sign.removeAttribute("data-unavailable");
        const variant = signEntrance(step++);
        await animate([
          { opacity: 0, transform: `translate(${variant.x}px, ${variant.y}px) rotate(${variant.angle}deg) scale(.96)` },
          { opacity: 1, transform: "none" }
        ], 620);
        if (ticket !== revision) return;
        motion?.cancel(); motion = null; pending = null;
        schedule();
        return;
      } catch (error) {
        if (ticket !== revision || error.name === "AbortError") return;
        failed.add(index);
      }
    }
    pending = null;
    // Keep the real meaning readable; never a broken image or loader blocking login.
    if (selected < 0) sign.setAttribute("data-unavailable", "");
  }
  function sync() {
    const nextActive = visible(), nextRunnable = canRun();
    loginScreen.toggleAttribute("data-login-paused", !nextRunnable);
    if (active === nextActive && runnable === nextRunnable) return;
    const entering = nextActive && !active;
    active = nextActive; runnable = nextRunnable;
    cancelWork();
    if (!active) { cancelAnimationFrame(frame); clearTimeout(viewportTimer); return; }
    if (entering) failed.clear();
    if (selected < 0 && (entering || runnable)) showNext(0);
    else schedule();
  }
  // The document owns scroll. No fixed-height login/form or hidden page overflow.
  function keepFormVisible() {
    cancelAnimationFrame(frame);
    clearTimeout(viewportTimer);
    const viewport = window.visualViewport;
    const inputFocused = visible() && loginScreen.contains(document.activeElement) && document.activeElement.matches("input");
    const inset = inputFocused && viewport && Math.abs(viewport.scale - 1) < .05
      ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
    // Some keyboards resize only visualViewport, not the layout viewport.
    loginScreen.style.setProperty("--login-keyboard-inset", `${inset}px`);
    const alignForm = () => {
      if (!visible() || !loginScreen.contains(document.activeElement) || !document.activeElement.matches("input")) return;
      const viewport = window.visualViewport;
      if (viewport && Math.abs(viewport.scale - 1) > .05) return;
      const top = (viewport?.offsetTop || 0) + 16;
      const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 16;
      const field = document.activeElement.getBoundingClientRect();
      const button = loginScreen.querySelector(".login-submit").getBoundingClientRect();
      const end = button.bottom - field.top <= bottom - top ? button.bottom : field.bottom;
      const delta = field.top < top ? field.top - top : Math.max(0, end - bottom);
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
    };
    frame = requestAnimationFrame(alignForm);
    // WebView may restore its own scroll after the first resize frame. Recheck once,
    // after keyboard settling, without a polling loop or fighting manual scrolling.
    if (inputFocused) viewportTimer = setTimeout(() => { frame = requestAnimationFrame(alignForm); }, 140);
  }
  toggle.addEventListener("click", () => {
    userPaused = !userPaused;
    toggle.setAttribute("aria-pressed", String(userPaused));
    const label = userPaused ? "Riprendi animazioni" : "Pausa animazioni";
    toggle.setAttribute("aria-label", label); toggle.title = label;
    sync();
  });
  loginScreen.addEventListener("focusin", () => { sync(); keepFormVisible(); });
  loginScreen.addEventListener("focusout", () => queueMicrotask(() => { sync(); keepFormVisible(); }));
  new MutationObserver(sync).observe(loginScreen, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-native-motion-paused"] });
  new MutationObserver(keepFormVisible).observe(document.getElementById("adminPasswordGroup"), { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => { pageHidden = true; sync(); });
  window.addEventListener("pageshow", () => { pageHidden = false; sync(); });
  window.addEventListener("online", () => { failed.clear(); if (visible()) selected < 0 ? showNext(0) : schedule(); });
  window.addEventListener("resize", keepFormVisible);
  window.visualViewport?.addEventListener("resize", keepFormVisible);
  reduced.addEventListener("change", sync);
  sync();
}
