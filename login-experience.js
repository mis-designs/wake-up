import { homeGreetings } from "./android-rotary-model.mjs?v=8-bangla-greetings";
import { renderGreeting } from "./greeting-view.mjs?v=1-shared-login";

// Shared web / Android presentation only. script.js retains all auth ownership.
const loginScreen = document.getElementById("login");
if (loginScreen) {
  let loginVisible = false;
  const syncLoginGreeting = () => {
    const visible = !loginScreen.classList.contains("hidden");
    if (visible && !loginVisible) {
      // Four resting frames, with a duplicate first row for the seamless loop.
      renderGreeting(document.getElementById("loginTitle"), ["Bentornato.", ...homeGreetings(new Date().getHours()), "Bentornato."], "login-greeting-rail", "Bentornato in MagicBook");
    }
    loginVisible = visible;
  };
  new MutationObserver(syncLoginGreeting).observe(loginScreen, { attributes: true, attributeFilter: ["class"] });
  const syncVisibility = () => loginScreen.toggleAttribute("data-login-background", document.hidden);
  document.addEventListener("visibilitychange", syncVisibility);
  window.addEventListener("pagehide", () => loginScreen.setAttribute("data-login-background", ""));
  window.addEventListener("pageshow", syncVisibility);
  syncVisibility();
  syncLoginGreeting();
}
