(function initializeLearningInsights(root) {
  "use strict";

  const CONFIG = Object.freeze({
    endpoint: "/api/learning-insights",
    timeoutMs: 14_000,
    pageSize: 8,
    maxLocalEvents: 250,
    validLenses: ["figure", "quiz", "parole", "argomenti", "recuperati"]
  });
  const state = {
    mode: "statistics",
    lens: "figure",
    model: null,
    cachedAt: 0,
    isCached: false,
    isRefreshing: false,
    selectedKey: "",
    selectedChapter: 0,
    visibleCount: CONFIG.pageSize,
    userId: "",
    requestId: 0,
    controller: null,
    focusHeading: false
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function replaceSafeContent(element, html) {
    if (!element) return;
    const parsed = new root.DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    element.replaceChildren(...Array.from(parsed.body.childNodes));
  }

  function normalizedUserId(value) {
    let userId = String(value || "").replace(/\D/g, "");
    if (userId.startsWith("39") && userId.length === 12) userId = userId.slice(2);
    return userId;
  }

  function readAuth() {
    try {
      const sessions = ["user_session", "session"].map(key => {
        try { return JSON.parse(root.localStorage?.getItem(key) || "null"); } catch { return null; }
      });
      const session = sessions.find(value => value?.phone) || {};
      const userId = normalizedUserId(session.phone || root.localStorage?.getItem("phone"));
      const deviceId = String(session.deviceId || root.localStorage?.getItem("deviceId") || "");
      const accessToken = String(root.localStorage?.getItem("accessToken") || session.accessToken || "");
      return userId && deviceId && accessToken ? { userId, deviceId, accessToken } : null;
    } catch {
      return null;
    }
  }

  function isModel(value) {
    return Boolean(value?.success === true && value?.summary && Array.isArray(value?.chapters) && value?.errors);
  }

  function announce(message) {
    const status = root.document?.getElementById("learningInsightsStatus");
    if (status) status.textContent = String(message || "");
  }

  function formatPercent(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function plural(value, singular, pluralValue) {
    return Number(value) === 1 ? singular : pluralValue;
  }

  function stateClass(status) {
    const allowed = new Set(["attenzione", "in_miglioramento", "recuperato", "solido", "pochi_dati", "in_pratica", "non_iniziato"]);
    const normalized = allowed.has(status) ? status : "in_pratica";
    return `is-${normalized.replace(/_/g, "-")}`;
  }

  function iconForMode(mode) {
    return mode === "errors" ? "icons/errori-patente.png" : "icons/statistiche-patente.png";
  }

  function renderTop(mode) {
    const isErrors = mode === "errors";
    return `
      <header class="li-topbar">
        <button class="li-icon-button" type="button" data-li-action="home" onclick="MagicBookLearningInsights.handleClick(event)" aria-label="Torna alla Home">←</button>
        <a class="li-brand" href="/home" data-li-action="home" onclick="MagicBookLearningInsights.handleClick(event)">
          <img src="${iconForMode(mode)}" alt="">
          <span><strong>Magic Book</strong><small>Il tuo percorso</small></span>
        </a>
        <button class="li-refresh" type="button" data-li-action="refresh" onclick="MagicBookLearningInsights.handleClick(event)" ${state.isRefreshing ? "disabled" : ""}>
          <span aria-hidden="true">↻</span><span>${state.isRefreshing ? "Aggiorno" : "Aggiorna"}</span>
        </button>
      </header>
      <nav class="li-route-nav" aria-label="Percorso di apprendimento">
        <button type="button" data-li-route="statistics" onclick="MagicBookLearningInsights.handleClick(event)" ${!isErrors ? 'aria-current="page"' : ""}>Statistiche</button>
        <button type="button" data-li-route="errors" onclick="MagicBookLearningInsights.handleClick(event)" ${isErrors ? 'aria-current="page"' : ""}>Errori</button>
      </nav>`;
  }

  function freshnessBanner() {
    if (!state.model) return "";
    const pending = Number(state.model.summary?.pendingLocalEvents || 0);
    const lines = [];
    if (state.isCached) {
      lines.push(`<strong>Dati salvati sul dispositivo.</strong> Ultimo aggiornamento ${escapeHtml(formatDate(state.cachedAt || state.model.generatedAt))}.`);
    }
    if (pending) {
      lines.push(state.model.summary?.pendingLocalIncluded
        ? `${pending} ${plural(pending, "risposta recente è", "risposte recenti sono")} già inclus${pending === 1 ? "a" : "e"} e in attesa di sincronizzazione.`
        : `${pending} ${plural(pending, "risposta recente è", "risposte recenti sono")} in attesa: entrer${pending === 1 ? "à" : "anno"} nei dati appena torni online.`);
    }
    if (state.model.dataQuality?.sourceTruncated) {
      lines.push("La lettura usa i 10.000 eventi più recenti.");
    }
    if (!lines.length) return "";
    return `<div class="li-data-banner" role="note"><span aria-hidden="true">●</span><p>${lines.join(" ")}</p></div>`;
  }

  function renderSkeleton() {
    return `
      <div class="li-shell">
        ${renderTop(state.mode)}
        <div class="li-skeleton" aria-hidden="true">
          <span class="li-skeleton-line is-short"></span>
          <span class="li-skeleton-line is-title"></span>
          <div class="li-skeleton-grid"><span></span><span></span><span></span></div>
          <span class="li-skeleton-road"></span>
          <div class="li-skeleton-map">${Array.from({ length: 15 }, () => "<span></span>").join("")}</div>
        </div>
        <p class="li-loading-copy">Leggo il tuo percorso…</p>
      </div>`;
  }

  function metric(label, value, note) {
    return `<div class="li-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
  }

  function renderJourney(model) {
    const journey = model.journey;
    const summary = model.summary;
    const nextCopy = journey.nextMilestone
      ? `${journey.answersToNext} ${plural(journey.answersToNext, "risposta", "risposte")} al prossimo segnale`
      : "Tre tappe di evidenza completate";
    return `
      <article class="li-journey-panel">
        <div class="li-journey-intro">
          <div>
            <p class="li-kicker">Il tuo percorso, risposta dopo risposta</p>
            <h1 id="learningInsightsHeading" tabindex="-1">Non un voto. Una strada da leggere.</h1>
            <p>Le indicazioni nascono dai quiz che hai davvero svolto, con più peso ai risultati recenti.</p>
          </div>
          <span class="li-answer-count"><strong>${summary.totalAnswers}</strong> risposte</span>
        </div>
        <div class="li-metric-row" aria-label="Riepilogo del percorso">
          ${metric("Precisione totale", formatPercent(summary.overallAccuracyPct), `${summary.totalCorrect} corrette`)}
          ${metric("Ultime risposte", formatPercent(summary.recentAccuracyPct), `finestra di ${summary.recentWindowSize}`)}
          ${metric("Quiz esplorati", `${summary.uniqueQuizSeen}`, `${formatPercent(summary.quizCoveragePct)} dei 788`)}
        </div>
        <div class="li-road" aria-label="Tappe di affidabilità dei dati">
          <div class="li-road-head"><span>${escapeHtml(nextCopy)}</span><span>${journey.progressPct}%</span></div>
          <progress max="100" value="${journey.progressPct}">${journey.progressPct}%</progress>
          <ol>
            ${journey.waypoints.map((point, index) => `<li class="${point.reached ? "is-reached" : ""}"><span>${index + 1}</span><strong>${escapeHtml(point.label)}</strong><small>${point.value} risposte</small></li>`).join("")}
          </ol>
        </div>
      </article>`;
  }

  function renderInsight(model) {
    const insight = model.insight;
    return `
      <aside class="li-insight ${insight.tone ? `is-${escapeHtml(insight.tone)}` : ""}">
        <p class="li-kicker">${escapeHtml(insight.eyebrow)}</p>
        <h2>${escapeHtml(insight.title)}</h2>
        <p>${escapeHtml(insight.body)}</p>
        ${model.state === "empty" ? '<button type="button" data-li-action="start-quiz" data-chapter="1" onclick="MagicBookLearningInsights.handleClick(event)">Inizia dal capitolo 1 <span aria-hidden="true">→</span></button>' : ""}
        ${model.state === "insufficient" ? `<small>${Math.max(0, model.minimumAnswers - model.summary.totalAnswers)} risposte per sbloccare indicazioni più affidabili.</small>` : ""}
      </aside>`;
  }

  function chapterDetail(chapter) {
    if (!chapter) return "";
    const accuracy = chapter.accuracyPct === null ? "Non ancora disponibile" : `${chapter.accuracyPct}% di precisione`;
    return `
      <aside id="liChapterDetail" class="li-chapter-detail" aria-label="Dettaglio capitolo ${chapter.chapter}">
        <div><span class="li-state ${stateClass(chapter.status)}">${escapeHtml(chapter.statusLabel)}</span><p>Capitolo ${chapter.chapter}</p></div>
        <h3>${escapeHtml(chapter.title)}</h3>
        ${chapter.titleBn ? `<p lang="bn">${escapeHtml(chapter.titleBn)}</p>` : ""}
        <dl><div><dt>Tentativi</dt><dd>${chapter.attempts}</dd></div><div><dt>Copertura</dt><dd>${formatPercent(chapter.coveragePct)}</dd></div><div><dt>Andamento</dt><dd>${accuracy}</dd></div></dl>
        <div class="li-detail-actions">
          <button class="li-primary-action" type="button" data-li-action="start-quiz" data-chapter="${chapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Fai il quiz del capitolo</button>
          <button class="li-secondary-action" type="button" data-li-action="open-book" data-chapter="${chapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Apri il capitolo</button>
        </div>
      </aside>`;
  }

  function renderChapterMap(model) {
    const selected = model.chapters.find(chapter => chapter.chapter === state.selectedChapter);
    return `
      <section class="li-chapters" aria-labelledby="liChaptersTitle">
        <div class="li-section-heading">
          <div><p class="li-kicker">Mappa dei 25 capitoli</p><h2 id="liChaptersTitle">Dove sei passato. Dove tornare.</h2></div>
          <div class="li-legend" aria-label="Legenda"><span class="is-solido">Solido</span><span class="is-in-miglioramento">Migliora</span><span class="is-attenzione">Da rivedere</span><span class="is-non-iniziato">Non iniziato</span></div>
        </div>
        <ol class="li-chapter-route">
          ${model.chapters.map(chapter => `
            <li>
              <button type="button" class="${stateClass(chapter.status)} ${state.selectedChapter === chapter.chapter ? "is-selected" : ""}" data-li-chapter="${chapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)" aria-expanded="${state.selectedChapter === chapter.chapter}" aria-controls="liChapterDetail">
                <span class="li-chapter-number">${String(chapter.chapter).padStart(2, "0")}</span>
                <span class="li-chapter-copy"><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.statusLabel)} · ${chapter.attempts} tentativi</small></span>
              </button>
            </li>`).join("")}
        </ol>
        ${chapterDetail(selected)}
      </section>`;
  }

  function renderStatistics(model) {
    return `
      ${freshnessBanner()}
      <div class="li-stat-layout">
        ${renderJourney(model)}
        ${renderInsight(model)}
      </div>
      ${renderChapterMap(model)}
      <footer class="li-method-note"><strong>Come leggiamo i dati</strong><span>Gli ultimi risultati pesano di più. Un singolo errore non diventa automaticamente un punto debole.</span></footer>`;
  }

  const LENSES = Object.freeze([
    { id: "figure", label: "Figure", key: "figures" },
    { id: "quiz", label: "Quiz", key: "questions" },
    { id: "parole", label: "Parole", key: "words" },
    { id: "argomenti", label: "Argomenti", key: "topics" },
    { id: "recuperati", label: "Recuperati", key: "recovered" }
  ]);

  function activeLens() {
    return LENSES.find(item => item.id === state.lens) || LENSES[0];
  }

  function itemKey(item) {
    return `${item.type}:${item.id}`;
  }

  function renderRelatedQuiz(item) {
    const rows = Array.isArray(item.relatedQuiz) ? item.relatedQuiz : [];
    if (!rows.length) return "";
    return `<div class="li-related"><h4>Quiz collegati</h4>${rows.map(row => `<p><span>${escapeHtml(row.quizId)}</span>${escapeHtml(row.question)}</p>`).join("")}</div>`;
  }

  function renderErrorDetail(item) {
    if (!item) return "";
    const chapter = Number(item.chapter || item.relatedQuiz?.[0]?.chapter || 0);
    return `
      <div class="li-error-detail" id="liErrorDetail-${escapeHtml(item.type)}-${escapeHtml(item.id)}">
        ${item.figureId ? `<figure><img class="li-figure-image" loading="lazy" src="/api/asset?kind=figure&amp;figure=${encodeURIComponent(item.figureId)}" alt="${escapeHtml(item.title)}"><figcaption>Figura collegata ai tuoi quiz</figcaption></figure>` : ""}
        <div class="li-error-explanation">
          <p class="li-kicker">Perché compare qui</p>
          <h3 tabindex="-1">${escapeHtml(item.title)}</h3>
          ${item.titleBn ? `<p lang="bn" class="li-bangla-title">${escapeHtml(item.titleBn)}</p>` : ""}
          <p>${escapeHtml(item.reason)}</p>
          ${item.simpleItalian ? `<p>${escapeHtml(item.simpleItalian)}</p>` : ""}
          ${item.simpleBangla ? `<p lang="bn">${escapeHtml(item.simpleBangla)}</p>` : ""}
          ${renderRelatedQuiz(item)}
          <div class="li-detail-actions">
            ${item.type === "word" ? `<button class="li-primary-action" type="button" data-li-action="dictionary" data-query="${escapeHtml(item.title)}" onclick="MagicBookLearningInsights.handleClick(event)">Apri nel dizionario</button>` : ""}
            ${chapter ? `<button class="li-primary-action" type="button" data-li-action="start-quiz" data-chapter="${chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Fai il quiz del capitolo</button><button class="li-secondary-action" type="button" data-li-action="open-book" data-chapter="${chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Apri il capitolo</button>` : ""}
          </div>
        </div>
      </div>`;
  }

  function renderErrorItem(item) {
    const key = itemKey(item);
    const expanded = state.selectedKey === key;
    const detailId = `liErrorDetail-${item.type}-${item.id}`;
    return `
      <li class="li-error-row ${expanded ? "is-expanded" : ""}">
        <button type="button" data-li-detail="${escapeHtml(key)}" onclick="MagicBookLearningInsights.handleClick(event)" aria-expanded="${expanded}" aria-controls="${escapeHtml(detailId)}">
          ${item.figureId ? `<img loading="lazy" src="/api/asset?kind=figure&amp;figure=${encodeURIComponent(item.figureId)}" alt="">` : `<span class="li-error-index">${escapeHtml(item.typeLabel.slice(0, 1))}</span>`}
          <span class="li-error-copy"><small>${escapeHtml(item.typeLabel)} · Capitolo ${item.chapter || "—"}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.reason)}</span></span>
          <span class="li-state ${stateClass(item.status)}">${escapeHtml(item.statusLabel)}</span>
          <span class="li-disclosure" aria-hidden="true">${expanded ? "−" : "+"}</span>
        </button>
        ${expanded ? renderErrorDetail(item) : ""}
      </li>`;
  }

  function renderErrorList(model) {
    const lens = activeLens();
    const all = Array.isArray(model.errors?.[lens.key]) ? model.errors[lens.key] : [];
    const visible = all.slice(0, state.visibleCount);
    if (!all.length) {
      const recovered = lens.id === "recuperati";
      return `<div class="li-empty-list"><span aria-hidden="true">${recovered ? "✓" : "·"}</span><h3>${recovered ? "I recuperi appariranno qui" : "Nessun pattern affidabile in questa categoria"}</h3><p>${model.state === "ready" ? "Continua a esercitarti: mostreremo solo segnali sostenuti da più risposte." : "Servono più risposte per distinguere un caso isolato da un pattern."}</p><button type="button" data-li-action="start-quiz" data-chapter="1" onclick="MagicBookLearningInsights.handleClick(event)">Continua con un quiz</button></div>`;
    }
    return `
      <ol class="li-error-list">${visible.map(renderErrorItem).join("")}</ol>
      ${visible.length < all.length ? `<button class="li-more" type="button" data-li-action="more" onclick="MagicBookLearningInsights.handleClick(event)">Mostra altri ${Math.min(CONFIG.pageSize, all.length - visible.length)}</button>` : ""}`;
  }

  function renderPlan(model) {
    const plan = Array.isArray(model.plan) ? model.plan : [];
    if (!plan.length) {
      return `<aside class="li-plan"><p class="li-kicker">Piano di recupero</p><h2>Prima raccogliamo evidenze.</h2><p>Il piano apparirà quando i risultati indicano azioni abbastanza precise da essere utili.</p><button type="button" data-li-action="start-quiz" data-chapter="1" onclick="MagicBookLearningInsights.handleClick(event)">Continua a esercitarti</button></aside>`;
    }
    const minutes = plan.reduce((sum, item) => sum + Number(item.estimatedMinutes || 0), 0);
    return `
      <aside class="li-plan">
        <div class="li-plan-head"><div><p class="li-kicker">Piano di recupero</p><h2>${minutes} minuti, tre passi al massimo.</h2></div><span>${plan.length}</span></div>
        <ol>${plan.map(item => `
          <li><span>${item.position}</span><div><strong>${escapeHtml(item.title)}</strong>${item.titleBn ? `<small lang="bn">${escapeHtml(item.titleBn)}</small>` : ""}<p>${escapeHtml(item.reason)}</p><button type="button" data-li-plan-action="${escapeHtml(item.action)}" data-entity-id="${escapeHtml(item.entityId)}" data-chapter="${Number(item.chapter || 0)}" data-title="${escapeHtml(item.title)}" onclick="MagicBookLearningInsights.handleClick(event)">${item.action === "dictionary" ? "Apri nel dizionario" : item.action === "figure" ? "Rivedi la figura" : "Vai al quiz"} <span aria-hidden="true">→</span></button></div></li>`).join("")}</ol>
      </aside>`;
  }

  function renderErrors(model) {
    const lens = activeLens();
    return `
      ${freshnessBanner()}
      <header class="li-errors-heading">
        <div><p class="li-kicker">Recupero guidato</p><h1 id="learningInsightsHeading" tabindex="-1">Gli errori utili sono quelli che sai affrontare.</h1><p>Separiamo episodi, pattern e recuperi. Nessuna causa viene attribuita senza evidenza.</p></div>
        <dl><div><dt>Da rivedere</dt><dd>${model.summary.activeErrors}</dd></div><div><dt>Recuperati recenti</dt><dd>${model.summary.recoveredThisWeek}</dd></div></dl>
      </header>
      <div class="li-errors-layout">
        <section class="li-error-explorer" aria-labelledby="liLensHeading">
          <div class="li-lens-head"><div><p class="li-kicker">Lenti di lettura</p><h2 id="liLensHeading">${escapeHtml(lens.label)}</h2></div><span>${(model.errors?.[lens.key] || []).length} risultati</span></div>
          <div class="li-lenses" role="tablist" aria-label="Categorie di errore">
            ${LENSES.map(item => `<button type="button" role="tab" id="li-tab-${item.id}" aria-selected="${item.id === state.lens}" tabindex="${item.id === state.lens ? "0" : "-1"}" data-li-lens="${item.id}" onclick="MagicBookLearningInsights.handleClick(event)">${escapeHtml(item.label)}<span>${(model.errors?.[item.key] || []).length}</span></button>`).join("")}
          </div>
          <div role="tabpanel" aria-labelledby="li-tab-${state.lens}">${renderErrorList(model)}</div>
        </section>
        ${renderPlan(model)}
      </div>
      <footer class="li-method-note"><strong>Regole conservative</strong><span>Una figura richiede errori su almeno due quiz diversi. Una parola appare solo se è nettamente sotto la tua media.</span></footer>`;
  }

  function renderErrorState(kind, details = "") {
    const auth = kind === "auth";
    const offline = kind === "offline";
    const title = auth ? "La sessione non è più valida." : offline ? "Sei offline e non ci sono ancora dati salvati." : "Non riesco a leggere il percorso adesso.";
    const body = auth ? "Accedi di nuovo per proteggere le tue statistiche personali." : offline ? "Torna online una volta per creare la prima copia locale delle statistiche." : "I quiz continuano a funzionare. Puoi riprovare senza perdere le risposte già registrate.";
    return `
      <div class="li-shell">
        ${renderTop(state.mode)}
        <section class="li-failure" aria-labelledby="learningInsightsHeading">
          <span aria-hidden="true">${auth ? "↪" : offline ? "⌁" : "!"}</span>
          <p class="li-kicker">${auth ? "Accesso" : offline ? "Modalità offline" : "Interruzione temporanea"}</p>
          <h1 id="learningInsightsHeading" tabindex="-1">${escapeHtml(title)}</h1>
          <p>${escapeHtml(body)}</p>
          ${details ? `<small>Dettaglio: ${escapeHtml(details)}</small>` : ""}
          <div><button class="li-primary-action" type="button" data-li-action="${auth ? "login" : "refresh"}" onclick="MagicBookLearningInsights.handleClick(event)">${auth ? "Accedi di nuovo" : "Riprova"}</button><button class="li-secondary-action" type="button" data-li-action="home" onclick="MagicBookLearningInsights.handleClick(event)">Torna alla Home</button></div>
        </section>
      </div>`;
  }

  function render() {
    const content = root.document?.getElementById("learningInsightsContent");
    if (!content) return;
    if (!state.model) {
      replaceSafeContent(content, renderSkeleton());
      bindRenderedMedia();
      return;
    }
    replaceSafeContent(content, `<div class="li-shell">${renderTop(state.mode)}<div class="li-main">${state.mode === "errors" ? renderErrors(state.model) : renderStatistics(state.model)}</div></div>`);
    bindRenderedMedia();
    if (state.focusHeading) {
      state.focusHeading = false;
      root.requestAnimationFrame?.(() => content.querySelector("#learningInsightsHeading")?.focus({ preventScroll: true }));
    }
  }

  function bindRenderedMedia() {
    root.document?.querySelectorAll(".li-figure-image").forEach(image => {
      image.addEventListener("error", () => {
        image.closest("figure")?.classList.add("is-unavailable");
        image.alt = "Figura temporaneamente non disponibile";
      }, { once: true });
    });
  }

  async function localPendingEvents(userId) {
    try {
      const records = await root.MagicBookLearningSync?.getLocalEvents?.();
      return (Array.isArray(records) ? records : [])
        .filter(record => normalizedUserId(record.user_id) === userId)
        .filter(record => record.event_type === "answer_event")
        .filter(record => ["pending", "retry", "sending"].includes(record.status))
        .slice(-CONFIG.maxLocalEvents)
        .map(({ event_id, event_type, user_id, payload }) => ({ event_id, event_type, user_id, payload }));
    } catch {
      return [];
    }
  }

  async function readCache(userId) {
    try {
      return await root.MagicBookLearningSync?.getInsightsCache?.(userId) || null;
    } catch {
      return null;
    }
  }

  async function load({ force = false } = {}) {
    const auth = readAuth();
    if (!auth) {
      const content = root.document?.getElementById("learningInsightsContent");
      replaceSafeContent(content, renderErrorState("auth"));
      return;
    }
    if (state.userId && state.userId !== auth.userId) {
      state.model = null;
      state.cachedAt = 0;
      state.isCached = false;
    }
    state.userId = auth.userId;
    const requestId = ++state.requestId;
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;

    if (!force && !state.model) {
      const cache = await readCache(auth.userId);
      if (requestId !== state.requestId) return;
      if (isModel(cache?.model)) {
        state.model = cache.model;
        state.cachedAt = Number(cache.cached_at || 0);
        state.isCached = true;
        render();
      }
    }

    const localEvents = await localPendingEvents(auth.userId);
    if (requestId !== state.requestId) return;
    if (root.navigator?.onLine === false) {
      state.isRefreshing = false;
      if (state.model) {
        state.model = {
          ...state.model,
          summary: {
            ...state.model.summary,
            pendingLocalEvents: localEvents.length,
            pendingLocalIncluded: false
          }
        };
        state.isCached = true;
        render();
        announce("Modalità offline: mostro l’ultima copia salvata.");
      } else {
        const content = root.document?.getElementById("learningInsightsContent");
        replaceSafeContent(content, renderErrorState("offline"));
      }
      return;
    }

    state.isRefreshing = true;
    render();
    void root.MagicBookLearningSync?.flush?.({ reason: "insights-open" });
    const timeout = root.setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const response = await root.fetch(CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth.accessToken}` },
        body: JSON.stringify({ device_id: auth.deviceId, local_events: localEvents }),
        cache: "no-store",
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== state.requestId) return;
      if (response.status === 401) {
        state.model = null;
        const content = root.document?.getElementById("learningInsightsContent");
        replaceSafeContent(content, renderErrorState("auth"));
        announce("Sessione scaduta.");
        return;
      }
      if (!response.ok || !isModel(data)) throw new Error(data?.error || `http_${response.status}`);
      state.model = data;
      state.cachedAt = Date.now();
      state.isCached = false;
      await root.MagicBookLearningSync?.setInsightsCache?.(auth.userId, data);
      announce("Percorso aggiornato.");
    } catch (error) {
      if (requestId !== state.requestId || error?.name === "AbortError") return;
      if (state.model) {
        state.isCached = true;
        announce("Aggiornamento non disponibile: mostro la copia salvata.");
      } else {
        const content = root.document?.getElementById("learningInsightsContent");
        replaceSafeContent(content, renderErrorState(root.navigator?.onLine === false ? "offline" : "network", error?.message || ""));
      }
    } finally {
      root.clearTimeout(timeout);
      if (requestId === state.requestId) {
        state.isRefreshing = false;
        if (state.model) render();
      }
    }
  }

  function setLens(lens, { updateUrl = true, focus = true } = {}) {
    if (!CONFIG.validLenses.includes(lens)) lens = "figure";
    state.lens = lens;
    state.selectedKey = "";
    state.visibleCount = CONFIG.pageSize;
    if (updateUrl) {
      const url = new URL(root.location.href);
      url.pathname = "/errori";
      url.searchParams.set("tipo", lens);
      root.history.replaceState({ screen: "errors", lens }, "", `${url.pathname}${url.search}`);
    }
    render();
    if (focus) root.requestAnimationFrame?.(() => root.document?.querySelector(`[data-li-lens="${lens}"]`)?.focus());
  }

  function resolveItem(key) {
    const groups = Object.values(state.model?.errors || {}).filter(Array.isArray);
    return groups.flat().find(item => itemKey(item) === key) || null;
  }

  function handleClick(event) {
    if (event.currentTarget?.tagName === "A") event.preventDefault();
    const route = event.target.closest("[data-li-route]");
    if (route) {
      route.dataset.liRoute === "errors" ? root.showLearningErrors?.() : root.showLearningStatistics?.();
      return;
    }
    const lens = event.target.closest("[data-li-lens]");
    if (lens) { setLens(lens.dataset.liLens); return; }
    const chapter = event.target.closest("[data-li-chapter]");
    if (chapter) {
      state.selectedChapter = state.selectedChapter === Number(chapter.dataset.liChapter) ? 0 : Number(chapter.dataset.liChapter);
      render();
      root.requestAnimationFrame?.(() => root.document?.querySelector(`[data-li-chapter="${chapter.dataset.liChapter}"]`)?.focus());
      return;
    }
    const detail = event.target.closest("[data-li-detail]");
    if (detail) {
      const key = detail.dataset.liDetail;
      state.selectedKey = state.selectedKey === key ? "" : key;
      render();
      root.requestAnimationFrame?.(() => {
        const next = root.document?.querySelector(`[data-li-detail="${CSS.escape(key)}"]`);
        next?.focus();
        if (state.selectedKey) next?.closest(".li-error-row")?.querySelector(".li-error-explanation h3")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
      });
      return;
    }
    const planAction = event.target.closest("[data-li-plan-action]");
    if (planAction) {
      const action = planAction.dataset.liPlanAction;
      if (action === "dictionary") root.showMagicDictionary?.({ query: planAction.dataset.title });
      else if (action === "figure") {
        setLens("figure", { focus: false });
        state.selectedKey = `figure:${planAction.dataset.entityId}`;
        render();
        root.document?.querySelector(`[data-li-detail="${CSS.escape(state.selectedKey)}"]`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
      } else if (Number(planAction.dataset.chapter)) {
        root.location.href = `/quiz/capitolo-${String(planAction.dataset.chapter).padStart(2, "0")}`;
      }
      return;
    }
    const action = event.target.closest("[data-li-action]");
    if (!action) return;
    const chapterNumber = Number(action.dataset.chapter || 0);
    if (action.dataset.liAction === "home") root.showHome?.();
    else if (action.dataset.liAction === "refresh") void load({ force: true });
    else if (action.dataset.liAction === "more") { state.visibleCount += CONFIG.pageSize; render(); }
    else if (action.dataset.liAction === "start-quiz") root.location.href = `/quiz/capitolo-${String(chapterNumber || 1).padStart(2, "0")}`;
    else if (action.dataset.liAction === "open-book" && chapterNumber) root.openChapter?.(chapterNumber);
    else if (action.dataset.liAction === "dictionary") root.showMagicDictionary?.({ query: action.dataset.query });
    else if (action.dataset.liAction === "login") root.logout?.(true, "expired");
  }

  function handleKeydown(event) {
    const tab = event.target.closest("[data-li-lens]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = CONFIG.validLenses.indexOf(tab.dataset.liLens);
    let next = current;
    if (event.key === "ArrowLeft") next = (current - 1 + CONFIG.validLenses.length) % CONFIG.validLenses.length;
    if (event.key === "ArrowRight") next = (current + 1) % CONFIG.validLenses.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = CONFIG.validLenses.length - 1;
    setLens(CONFIG.validLenses[next]);
  }

  function ensureEvents() {
    const screen = root.document?.getElementById("learningInsightsScreen");
    if (!screen || screen.dataset.bound === "true") return;
    screen.dataset.bound = "true";
    screen.addEventListener("keydown", handleKeydown);
  }

  function reducedMotion() {
    return root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function show(mode, options = {}) {
    const auth = readAuth();
    if (!auth || (state.userId && state.userId !== auth.userId)) {
      state.model = null;
      state.cachedAt = 0;
      state.isCached = false;
    }
    state.userId = auth?.userId || "";
    state.mode = mode === "errors" ? "errors" : "statistics";
    state.focusHeading = options.focus !== false;
    state.selectedChapter = 0;
    state.selectedKey = "";
    state.visibleCount = CONFIG.pageSize;
    if (state.mode === "errors") {
      const requested = new URL(root.location.href).searchParams.get("tipo") || options.lens || "figure";
      state.lens = CONFIG.validLenses.includes(requested) ? requested : "figure";
      if (!CONFIG.validLenses.includes(requested) && root.location.pathname === "/errori") {
        const url = new URL(root.location.href);
        url.searchParams.set("tipo", "figure");
        root.history.replaceState({ screen: "errors", lens: "figure" }, "", `${url.pathname}${url.search}`);
      }
    }
    ensureEvents();
    render();
    void load();
  }

  function hide() {
    state.requestId += 1;
    state.controller?.abort();
    state.controller = null;
    state.isRefreshing = false;
  }

  root.MagicBookLearningInsights = Object.freeze({ show, hide, refresh: () => load({ force: true }), handleClick, __testing: { state, isModel } });
})(typeof window !== "undefined" ? window : globalThis);
