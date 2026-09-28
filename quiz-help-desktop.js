/* All Books desktop presentation of the existing quiz-help workspace.
   No fetching, translation, playback or quiz state is owned here. */
(() => {
  "use strict";
  window.MagicQuizDesktopHelp = Object.freeze({ create });

  function create({ workspace, home, content, words, detail, context, translation, status, onChange, onPageChange }) {
    const media = window.matchMedia("(min-width: 951px) and (hover: hover) and (pointer: fine)");
    const heading = workspace.querySelector(".quiz-help-heading");
    const title = workspace.querySelector("#quiz-help-title");
    const originalTitle = title.textContent;
    const originalNodes = [...content.childNodes];
    const meanings = new WeakMap();
    let active = false, track, pager, pages = [], tabs = [], drag = null;

    function registerWord(button, word) {
      meanings.set(button, word.bangla || "");
      if (active) decorateWord(button);
    }

    function decorateWord(button) {
      if (button.querySelector(".quiz-help-word-bn")) return;
      const meaning = document.createElement("span");
      meaning.className = "quiz-help-word-bn";
      meaning.lang = "bn";
      meaning.textContent = meanings.get(button) || "Traduzione non disponibile";
      if (!meanings.get(button)) meaning.lang = "it";
      button.appendChild(meaning);
    }

    function selectPage(index, focus = false) {
      if (!active) return;
      onPageChange();
      track.style.setProperty("--help-page", String(index));
      title.textContent = index ? "Parole chiave" : "Traduzione del quiz";
      pages.forEach((page, i) => {
        page.inert = i !== index;
        page.setAttribute("aria-hidden", String(i !== index));
      });
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
      });
      if (focus) tabs[index].focus({ preventScroll: true });
    }

    function mount() {
      active = true;
      document.body.appendChild(workspace);
      workspace.classList.add("is-desktop-help");
      workspace.setAttribute("role", "dialog");
      workspace.setAttribute("aria-modal", "false");
      workspace.tabIndex = -1;
      heading.tabIndex = 0;
      heading.setAttribute("role", "group");
      heading.setAttribute("aria-label", "Sposta la finestra: trascina oppure usa Alt e le frecce");
      heading.title = "Trascina per spostare · Alt + frecce da tastiera";
      track = document.createElement("div");
      track.className = "quiz-help-desktop-track";
      pager = document.createElement("div");
      pager.className = "quiz-help-desktop-pager";
      pager.setAttribute("role", "tablist");
      pager.setAttribute("aria-label", "Contenuto della traduzione");
      pages = ["Traduzione completa", "Parole chiave"].map((label, index) => {
        const page = document.createElement("div");
        page.className = "quiz-help-desktop-page";
        page.id = `quiz-help-desktop-page-${index}`;
        page.setAttribute("role", "tabpanel");
        page.setAttribute("aria-labelledby", `quiz-help-desktop-tab-${index}`);
        page.tabIndex = 0;
        const tab = document.createElement("button");
        tab.type = "button";
        tab.id = `quiz-help-desktop-tab-${index}`;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-label", label);
        tab.setAttribute("aria-controls", page.id);
        tab.title = label;
        tab.addEventListener("click", () => selectPage(index, true));
        tab.addEventListener("keydown", event => {
          const next = { ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: 1 }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          selectPage(next, true);
        });
        pager.appendChild(tab);
        track.appendChild(page);
        return page;
      });
      tabs = [...pager.children];
      pages[0].append(translation, status);
      const loading = document.createElement("p");
      loading.className = "quiz-help-desktop-loading magic-loading-inline-status is-loading";
      loading.setAttribute("role", "status");
      loading.textContent = "Caricamento parole…";
      pages[1].append(loading, words, detail, context);
      content.appendChild(track);
      workspace.appendChild(pager);
      words.querySelectorAll("button").forEach(decorateWord);
      selectPage(0);
      workspace.querySelector("[data-help-close]").focus({ preventScroll: true });
    }

    function stopDrag() {
      if (!drag) return;
      const id = drag.id;
      drag = null;
      if (heading.hasPointerCapture(id)) heading.releasePointerCapture(id);
      workspace.classList.remove("is-dragging");
    }

    function close() {
      if (!active) return;
      stopDrag();
      active = false;
      // Restore the exact original nodes/order; phones gain no new wrappers.
      originalNodes.forEach(node => content.appendChild(node));
      track.remove();
      pager.remove();
      words.querySelectorAll(".quiz-help-word-bn").forEach(node => node.remove());
      workspace.classList.remove("is-desktop-help");
      for (const attribute of ["role", "aria-modal", "tabindex"]) workspace.removeAttribute(attribute);
      for (const attribute of ["tabindex", "role", "aria-label", "title"]) heading.removeAttribute(attribute);
      for (const property of ["--help-left", "--help-top"]) workspace.style.removeProperty(property);
      title.textContent = originalTitle;
      home.after(workspace);
      pages = []; tabs = [];
    }

    function place(left, top) {
      const rect = workspace.getBoundingClientRect();
      workspace.style.setProperty("--help-left", `${Math.max(12, Math.min(left, window.innerWidth - rect.width - 12))}px`);
      workspace.style.setProperty("--help-top", `${Math.max(12, Math.min(top, window.innerHeight - rect.height - 12))}px`);
    }

    heading.addEventListener("pointerdown", event => {
      if (!active || event.button !== 0 || event.target.closest("button")) return;
      const rect = workspace.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      heading.setPointerCapture(event.pointerId);
      workspace.classList.add("is-dragging");
    });
    heading.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      place(event.clientX - drag.x, event.clientY - drag.y);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) heading.addEventListener(type, stopDrag);
    heading.addEventListener("keydown", event => {
      if (!active || !event.altKey) return;
      const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
      if (!delta) return;
      event.preventDefault(); event.stopPropagation();
      const rect = workspace.getBoundingClientRect();
      place(rect.left + delta[0], rect.top + delta[1]);
    });
    media.addEventListener("change", onChange);
    window.addEventListener("resize", () => {
      stopDrag();
      if (!active || !workspace.style.getPropertyValue("--help-left")) return;
      const rect = workspace.getBoundingClientRect();
      place(rect.left, rect.top);
    });
    window.addEventListener("blur", stopDrag);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopDrag(); });

    return Object.freeze({
      get active() { return active; },
      sync() {
        if (media.matches && !workspace.classList.contains("hidden")) { if (!active) mount(); }
        else close();
      },
      close,
      registerWord
    });
  }
})();
