(function (root) {
  "use strict";

  // Keep drafts in the input; only an explicit submit changes results and URL.
  function bindSearch(form, input, clear, search) {
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    input.addEventListener("input", () => { clear.hidden = !input.value; });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!composing) search();
    });
    clear.addEventListener("click", () => { input.value = ""; search(); input.focus(); });
  }

  function answerMark(correct) {
    const group = document.createElement("div");
    group.className = "quizbank-solution";
    group.setAttribute("role", "img");
    group.setAttribute("aria-label", `Risposta corretta: ${correct ? "Vero" : "Falso"}`);
    for (const [value, label] of [[true, "V"], [false, "F"]]) {
      const cell = document.createElement("span");
      cell.className = "quizbank-answer-cell" + (correct === value ? " is-marked" : "");
      cell.setAttribute("aria-hidden", "true");
      const letter = document.createElement("span");
      letter.className = "quizbank-answer-letter";
      letter.textContent = label;
      const mark = document.createElement("span");
      mark.className = "quizbank-answer-mark";
      mark.textContent = correct === value ? "×" : "·";
      cell.append(letter, mark); group.appendChild(cell);
    }
    return group;
  }

  // Finite decoration: three individual figures per sheet visit, each at most once.
  // No image reloads, polling or persistent learner state.
  function observeFigures(container) {
    if (!root.IntersectionObserver) return () => {};
    const reduced = root.matchMedia("(prefers-reduced-motion: reduce)");
    const forced = root.matchMedia("(forced-colors: active)");
    const visible = new Set(), played = new WeakSet();
    let timer = 0, finishTimer = 0, active = null, count = 0, lastFlip = 0, disposed = false;
    const allowed = () => !disposed && !document.hidden && !reduced.matches && !forced.matches
      && !document.documentElement.hasAttribute("data-native-motion-paused")
      && !container.closest(".hidden, [hidden], [inert]")
      && !container.querySelector(".quiz-audio-recorder:not(.hidden)")
      && ![...document.querySelectorAll("audio, video")].some(media => !media.paused);
    function stop() {
      root.clearTimeout(timer); root.clearTimeout(finishTimer); timer = finishTimer = 0;
      active?.classList.remove("is-sheet-flipping"); active = null;
    }
    function schedule() {
      if (timer || active || count >= 3 || !visible.size || !allowed()) return;
      timer = root.setTimeout(() => {
        timer = 0;
        if (!allowed()) return;
        const frame = [...visible].find(el => !played.has(el) && el.getBoundingClientRect().height > 0
          && !el.closest(".hidden, [hidden]") && el.querySelector("img")?.complete
          && el.querySelector("img")?.naturalWidth > 0 && !el.querySelector("img")?.hidden);
        if (!frame) return;
        played.add(frame); count++; lastFlip = Date.now(); active = frame;
        frame.classList.add("is-sheet-flipping");
        finishTimer = root.setTimeout(() => {
          frame.classList.remove("is-sheet-flipping"); active = null; finishTimer = 0; schedule();
        }, 850);
      }, Math.max(3000, 24000 - (Date.now() - lastFlip)));
    }
    const observer = new root.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= .65) visible.add(entry.target);
        else { visible.delete(entry.target); if (active === entry.target) stop(); }
      }
      schedule();
    }, { threshold: [.65] });
    container.querySelectorAll(".study-figure-frame").forEach(frame => observer.observe(frame));
    const sync = () => { if (!allowed()) stop(); else schedule(); };
    const preferences = new MutationObserver(sync);
    preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-native-motion-paused"] });
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("play", sync, true); document.addEventListener("pause", sync, true);
    container.addEventListener("load", schedule, true);
    reduced.addEventListener("change", sync); forced.addEventListener("change", sync);
    root.addEventListener("pagehide", stop);
    return () => {
      disposed = true; stop(); observer.disconnect(); preferences.disconnect(); visible.clear();
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("play", sync, true); document.removeEventListener("pause", sync, true);
      container.removeEventListener("load", schedule, true);
      reduced.removeEventListener("change", sync); forced.removeEventListener("change", sync);
      root.removeEventListener("pagehide", stop);
    };
  }
  root.MagicQuizBankSheet = { answerMark, observeFigures, bindSearch };
})(window);
