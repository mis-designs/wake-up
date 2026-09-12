/* Installed-app presentation of the existing Quiz/Exam mode owners. */
(function initializeNativeModeScreens(root) {
  const doc = root.document;
  if (!doc?.documentElement.classList.contains("android-webview")) return;
  const definitions = {
    quiz: { id: "quizModeOverlay", title: "Scegli il quiz", cards: [
      ["qmsCardMix", "Mix", "Mix Quiz 786"],
      ["qmsCardCap", "Capitolo", "Quiz capitolo"],
      ["qmsCardMulti", "Multi", "Multi quiz"]
    ] },
    exam: { id: "examModeOverlay", title: "Scegli Exam", cards: [
      ["examCard80", "80 quiz", "Mix Quiz 80"],
      ["examCard30", "30 quiz", "Mix Quiz 30"],
      ["examCardPdf", "PDF", "Exam PDF"]
    ] }
  };
  let active = null;
  let closing = false;
  const disabledBeforeLaunch = new Map();

  function selectTab(kind, index, focus = false) {
    const config = definitions[kind];
    config.index = index;
    config.cards.forEach(([id], i) => {
      const selected = i === index;
      config.tabs[i].setAttribute("aria-selected", String(selected));
      config.tabs[i].tabIndex = selected ? 0 : -1;
      doc.getElementById(id).hidden = !selected;
      if (config.startButtons) config.startButtons[i].hidden = !selected;
    });
    config.element.querySelector(".qms-body").scrollTop = 0;
    if (focus) config.tabs[index].focus({ preventScroll: true });
  }

  for (const [kind, config] of Object.entries(definitions)) {
    const element = doc.getElementById(config.id);
    if (!element) return;
    config.element = element;
    element.classList.add("native-mode-screen");
    element.setAttribute("role", "region");
    const heading = element.querySelector(".qms-title");
    heading.textContent = config.title;
    heading.id = `native-${kind}-heading`;
    heading.setAttribute("role", "heading");
    heading.setAttribute("aria-level", "1");
    heading.tabIndex = -1;
    element.setAttribute("aria-labelledby", heading.id);
    const tabs = doc.createElement("div");
    tabs.className = "native-mode-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", kind === "quiz" ? "Modalità quiz" : "Modalità Exam");
    config.tabs = config.cards.map(([id, label, title], index) => {
      const card = doc.getElementById(id);
      card.setAttribute("role", "tabpanel");
      card.setAttribute("aria-labelledby", `native-tab-${id}`);
      card.querySelector(".qms-card-title").textContent = title;
      const button = doc.createElement("button");
      button.type = "button";
      button.id = `native-tab-${id}`;
      button.textContent = label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", id);
      button.addEventListener("click", () => selectTab(kind, index));
      button.addEventListener("keydown", event => {
        const keys = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        selectTab(kind, keys[event.key], true);
      });
      tabs.append(button);
      return button;
    });
    if (kind === "quiz") {
      // Move the original action nodes, never clone their handlers or selection state.
      const footer = doc.createElement("div");
      footer.className = "native-mode-footer";
      footer.append(tabs);
      config.startButtons = config.cards.map(([id]) => {
        const start = doc.getElementById(id).querySelector(".qms-start");
        start.type = "button";
        start.setAttribute("aria-describedby", `native-copy-${id}`);
        footer.append(start);
        return start;
      });
      element.querySelector(".qms-sheet").append(footer);
    } else {
      element.querySelector(".qms-header").after(tabs);
    }
    selectTab(kind, 0);
  }

  // Study stays available through the dedicated native Home/chapter action.
  const study = doc.getElementById("qmsCardStudy");
  if (study) study.hidden = true;
  for (const [id, subtitle] of [
    ["qmsCardMix", "Allenati con 30 domande casuali da tutti i capitoli."],
    ["qmsCardCap", "Scegli il capitolo su cui allenarti."],
    ["qmsCardMulti", "Combina almeno 2 capitoli in un unico quiz."],
    ["examCard80", "Le domande più difficili: 80 quiz in 50 minuti."],
    ["examCard30", "Allenati con 30 domande in 20 minuti."],
    ["examCardPdf", "Consulta il materiale Exam nel lettore."]
  ]) doc.getElementById(id).querySelector(".qms-card-sub").textContent = subtitle;

  // Long-form counterpart to the chapter button language rail. Overlapping grid
  // cells reserve the larger translation's natural height, including text zoom.
  for (const [id, italian, bangla] of [
    ["qmsCardMix", ["Mix quiz", "Da tutto il catalogo di 786 quiz."], ["মিক্স কুইজ", "৭৮৬টি প্রশ্নের পুরো সংগ্রহ থেকে।"]],
    ["qmsCardCap", ["Quiz per capitolo", "Domande da un capitolo specifico."], ["অধ্যায়ভিত্তিক কুইজ", "একটি নির্দিষ্ট অধ্যায় থেকে প্রশ্ন।"]],
    ["qmsCardMulti", ["Multi quiz", "Domande da almeno 2 capitoli insieme."], ["একাধিক অধ্যায়ের কুইজ", "অন্তত ২টি অধ্যায় থেকে একসঙ্গে প্রশ্ন।"]]
  ]) {
    const info = doc.querySelector(`#${id} .qms-card-info`);
    const copy = doc.createElement("div");
    copy.id = `native-copy-${id}`;
    copy.className = "native-mode-copy";
    const accessible = doc.createElement("div");
    accessible.className = "native-mode-copy-accessible native-sr-only";
    const viewport = doc.createElement("div");
    viewport.className = "native-mode-copy-window";
    viewport.setAttribute("aria-hidden", "true");
    for (const [language, [title, detail]] of [["it", italian], ["bn", bangla]]) {
      const row = doc.createElement("div");
      row.lang = language;
      const heading = doc.createElement("div");
      heading.className = "qms-card-title";
      heading.textContent = title;
      const description = doc.createElement("p");
      description.className = "native-mode-description";
      description.textContent = detail;
      row.append(heading, description);
      accessible.append(row.cloneNode(true));
      viewport.append(row);
    }
    // Permission copy remains a separate, non-animated note owned by syncSelection.
    const permission = info.querySelector(".qms-card-sub");
    permission.classList.add("native-mode-permission");
    permission.hidden = true;
    copy.append(accessible, viewport);
    info.replaceChildren(copy, permission);
  }
  for (const [id, number, label] of [["qmsCardMix", "30", "domande casuali"], ["examCard80", "80", "domande · 50 minuti"], ["examCard30", "30", "domande · 20 minuti"]]) {
    const metric = doc.createElement("div");
    metric.className = "native-mode-metric";
    const value = doc.createElement("strong"); value.textContent = number;
    const caption = doc.createElement("span"); caption.textContent = label;
    if (id === "qmsCardMix") {
      value.textContent = "";
      const readable = doc.createElement("span");
      readable.className = "native-sr-only";
      readable.textContent = number;
      value.append(readable);
      const digits = doc.createElement("span");
      digits.className = "native-mode-digits";
      digits.setAttribute("aria-hidden", "true");
      for (const digit of number) {
        const item = doc.createElement("span");
        item.textContent = digit;
        digits.append(item);
      }
      value.append(digits);
      caption.textContent = "domande · ";
      const bn = doc.createElement("span");
      bn.lang = "bn";
      bn.textContent = "প্রশ্ন";
      caption.append(bn);
    }
    metric.append(value, caption);
    doc.getElementById(id).querySelector(".qms-card-header").after(metric);
  }
  const capHint = doc.createElement("p");
  capHint.id = "native-cap-selection";
  capHint.className = "native-selection-status";
  capHint.setAttribute("role", "status");
  doc.getElementById("qmsCapPills").after(capHint);
  doc.getElementById("qmsMultiHint").setAttribute("role", "status");

  function syncSelection() {
    const guest = doc.body.classList.contains("guest-trial-mode");
    doc.querySelectorAll(".native-mode-permission").forEach(note => { note.hidden = !guest; });
    if (guest) {
      doc.querySelector("#qmsCardMix .qms-card-sub").textContent = "La prova include fino a 2 Mix Quiz gratuiti.";
      doc.querySelector("#qmsCardCap .qms-card-sub").textContent = "Capitoli 01 e 03 inclusi nella prova. Gli altri richiedono l’accesso.";
      doc.querySelector("#qmsCardMulti .qms-card-sub").textContent = "Il quiz con più capitoli richiede l’accesso completo.";
    }
    for (const id of ["qmsCapPills", "qmsMultiPills"]) {
      doc.querySelectorAll(`#${id} .qms-pill`).forEach(button => {
        button.type = "button";
        button.setAttribute("aria-pressed", String(button.classList.contains("is-selected")));
        const locked = button.classList.contains("guest-qms-locked");
        button.setAttribute("aria-label", `Capitolo ${Number(button.dataset.ch)}${locked ? ", accesso richiesto" : ""}`);
      });
    }
    const selected = doc.querySelector("#qmsCapPills .is-selected");
    capHint.textContent = selected ? `Capitolo ${selected.textContent} selezionato` : "Seleziona un capitolo per iniziare";
  }

  function reset() {
    for (const config of Object.values(definitions)) {
      config.element.classList.add("hidden");
      config.element.classList.remove("qms-visible");
      config.element.removeAttribute("aria-busy");
      delete config.element.dataset.launching;
    }
    disabledBeforeLaunch.forEach((disabled, button) => { button.disabled = disabled; });
    disabledBeforeLaunch.clear();
    doc.body.classList.remove("qms-open", "native-mode-open");
    active = null;
    closing = false;
  }

  function open(kind) {
    const config = definitions[kind];
    const previous = getRouteStateFromLocation();
    config.returnState = !["quizMode", "examMode", "welcome"].includes(previous.screen) ? previous : { screen: "chapters" };
    config.canGoBack = !["quizMode", "examMode"].includes(previous.screen) && !applyingRouteFromHistory;
    active = kind;
    closing = false;
    doc.body.classList.add("native-mode-open");
    config.element.removeAttribute("aria-busy");
    delete config.element.dataset.launching;
    selectTab(kind, 0);
    syncSelection();
    setAppRoute({ screen: `${kind}Mode` });
    root.requestAnimationFrame(() => {
      if (active === kind && !config.element.closest("[inert]")) config.element.querySelector(".qms-title").focus({ preventScroll: true });
    });
  }

  function close(kind, { forNavigation = false } = {}) {
    if (active !== kind) return false;
    const config = definitions[kind];
    if (forNavigation) {
      config.element.dataset.launching = "true";
      config.element.setAttribute("aria-busy", "true");
      config.element.querySelectorAll("button").forEach(button => {
        if (!disabledBeforeLaunch.has(button)) disabledBeforeLaunch.set(button, button.disabled);
        button.disabled = true;
      });
      return true;
    }
    if (closing || appActionGate.isBusy()) return true;
    closing = true;
    if (config.canGoBack) root.history.back();
    else openRouteState(config.returnState);
    return true;
  }

  doc.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !active || event.defaultPrevented) return;
    if (!definitions[active].element.contains(doc.activeElement)) return;
    event.preventDefault();
    close(active);
  });
  root.addEventListener("pagehide", reset);
  root.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    const state = getRouteStateFromLocation();
    if (["quizMode", "examMode"].includes(state.screen)) openRouteState(state);
  });
  root.MagicBookModeScreens = Object.freeze({ open, close, reset, syncSelection });
})(window);
