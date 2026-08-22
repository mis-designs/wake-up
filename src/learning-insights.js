(function initializeLearningInsights(root) {
  "use strict";

  const CONFIG = Object.freeze({
    endpoint: "/api/learning-insights",
    timeoutMs: 14_000,
    pageSize: 8,
    maxLocalEvents: 250,
    validLenses: ["figure", "quiz", "parole", "argomenti", "capitoli", "recuperati"]
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
    if (!value || value.success !== true || !value.summary || !value.journey || !value.insight) return false;
    if (!Array.isArray(value.chapters) || value.chapters.length !== 25 || !Array.isArray(value.plan)) return false;
    const errors = value.errors;
    return Boolean(errors && ["figures", "questions", "words", "topics", "recovered"].every(key => Array.isArray(errors[key])));
  }

  function announce(message) {
    const status = root.document?.getElementById("learningInsightsStatus");
    if (status) status.textContent = String(message || "");
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "—";
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

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function stateClass(status) {
    const allowed = new Set(["attenzione", "in_miglioramento", "recuperato", "solido", "pochi_dati", "in_pratica", "non_iniziato"]);
    const normalized = allowed.has(status) ? status : "in_pratica";
    return `is-${normalized.replace(/_/g, "-")}`;
  }

  function iconForMode(mode) {
    return mode === "errors" ? "icons/errori-patente.png" : "icons/statistiche-patente.png";
  }

  function figureUrl(figureId) {
    return `/api/asset?kind=figure&amp;figure=${encodeURIComponent(String(figureId || ""))}`;
  }

  function cssEscape(value) {
    if (root.CSS?.escape) return root.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  }

  function renderTop(mode) {
    const isErrors = mode === "errors";
    return `
      <header class="li-topbar">
        <button class="li-icon-button" type="button" data-li-action="home" onclick="MagicBookLearningInsights.handleClick(event)" aria-label="Torna alla Home"><img src="icons/go-back.png" alt=""></button>
        <a class="li-brand" href="/home" data-li-action="home" onclick="MagicBookLearningInsights.handleClick(event)">
          <img src="${iconForMode(mode)}" alt=""><span><strong>Magic Book</strong><small>${isErrors ? "Centro recupero" : "Il tuo percorso"}</small></span>
        </a>
        <button class="li-refresh" type="button" data-li-action="refresh" onclick="MagicBookLearningInsights.handleClick(event)" aria-busy="${state.isRefreshing}" ${state.isRefreshing ? 'aria-disabled="true"' : ""}><img src="assets/admin/update.png" alt=""><span>${state.isRefreshing ? "Aggiorno" : "Aggiorna"}</span></button>
      </header>
      <nav class="li-route-nav" aria-label="Percorso di apprendimento">
        <button type="button" data-li-route="statistics" onclick="MagicBookLearningInsights.handleClick(event)" ${!isErrors ? 'aria-current="page"' : ""}><img src="icons/statistiche-patente.png" alt=""><span>Statistiche</span></button>
        <button type="button" data-li-route="errors" onclick="MagicBookLearningInsights.handleClick(event)" ${isErrors ? 'aria-current="page"' : ""}><img src="icons/errori-patente.png" alt=""><span>Errori</span></button>
      </nav>`;
  }

  function freshnessBanner() {
    if (!state.model) return "";
    const pending = Number(state.model.summary?.pendingLocalEvents || 0);
    const lines = [];
    if (state.isCached) lines.push(`<strong>Copia locale.</strong> Aggiornata ${escapeHtml(formatDate(state.cachedAt || state.model.generatedAt))}.`);
    if (pending) {
      lines.push(state.model.summary?.pendingLocalIncluded
        ? `${pending} ${plural(pending, "risposta recente è", "risposte recenti sono")} già inclus${pending === 1 ? "a" : "e"} e in attesa di sincronizzazione.`
        : `${pending} ${plural(pending, "risposta recente è", "risposte recenti sono")} in attesa: entrer${pending === 1 ? "à" : "anno"} nei dati appena torni online.`);
    }
    if (state.model.dataQuality?.sourceTruncated) lines.push("La lettura considera i 10.000 eventi più recenti.");
    if (!lines.length) return "";
    return `<div class="li-data-banner" role="note"><span class="li-live-dot" aria-hidden="true"></span><p>${lines.join(" ")}</p></div>`;
  }

  function renderSkeleton() {
    const rows = Array.from({ length: 5 }, () => `<div class="li-skeleton-stage">${Array.from({ length: 5 }, () => "<span></span>").join("")}</div>`).join("");
    return `
      <div class="li-shell">
        ${renderTop(state.mode)}
        <main class="li-main li-skeleton" aria-hidden="true">
          <div class="li-skeleton-heading"><span></span><span></span></div>
          <div class="li-skeleton-summary"><span></span><span></span><span></span><span></span></div>
          <div class="li-skeleton-signal"><span></span><span></span></div>
          <div class="li-skeleton-route">${rows}</div>
        </main>
        <p class="li-loading-copy">Leggo il tuo percorso…</p>
      </div>`;
  }

  function metric(label, value, note, modifier = "") {
    return `<div class="li-metric ${modifier}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
  }

  function catalogQuizCount(model) {
    return Number(model.dataQuality?.catalogQuizCount || model.dataQuality?.quizCatalogCount || 0);
  }

  function journeyStageLabel(stage) {
    const labels = ["Prime risposte", "Prime indicazioni", "Tendenza recente", "Percorso consolidato"];
    return labels[Math.max(0, Math.min(labels.length - 1, Number(stage) || 0))];
  }

  function recentComparison(summary) {
    const recent = Number(summary.recentAccuracyPct);
    const overall = Number(summary.overallAccuracyPct);
    if (!Number.isFinite(recent) || !Number.isFinite(overall) || !Number(summary.recentWindowSize)) return `ultime ${summary.recentWindowSize || 0}`;
    const delta = Math.round(recent - overall);
    if (delta > 0) return `+${delta} pt sulla media complessiva`;
    if (delta < 0) return `${Math.abs(delta)} pt sotto la media complessiva`;
    return "in linea con la media complessiva";
  }

  function renderSnapshot(model) {
    const summary = model.summary;
    const journey = model.journey;
    const catalogCount = catalogQuizCount(model);
    const quizNote = catalogCount ? `${formatPercent(summary.quizCoveragePct)} di ${catalogCount}` : `${formatPercent(summary.quizCoveragePct)} del catalogo`;
    const nextCopy = journey.nextMilestone
      ? `${journey.answersToNext} ${plural(journey.answersToNext, "risposta", "risposte")} alla prossima tappa`
      : "Le tappe di evidenza sono complete";
    return `
      <section class="li-snapshot" aria-labelledby="learningInsightsHeading">
        <header class="li-page-heading"><div><p class="li-kicker">Quadro di apprendimento</p><h1 id="learningInsightsHeading" tabindex="-1">Il punto, adesso.</h1></div><p>Una lettura compatta dei quiz svolti, con più peso alle risposte recenti.</p></header>
        <div class="li-snapshot-grid" aria-label="Riepilogo del percorso">
          ${metric("Risposte recenti", formatPercent(summary.recentAccuracyPct), recentComparison(summary), "is-primary")}
          ${metric("Precisione complessiva", formatPercent(summary.overallAccuracyPct), `${summary.totalCorrect || 0} corrette su ${summary.totalAnswers || 0}`)}
          ${metric("Quiz esplorati", `${summary.uniqueQuizSeen || 0}`, quizNote)}
          ${metric("Da recuperare", `${summary.activeErrors || 0}`, `${summary.recoveredThisWeek || 0} recuperati questa settimana`)}
        </div>
        <div class="li-evidence-road" aria-label="Affidabilità della lettura">
          <div class="li-evidence-copy"><strong>${escapeHtml(journeyStageLabel(journey.stage))}</strong><span>${escapeHtml(nextCopy)}</span></div>
          <div class="li-progress-track" role="progressbar" aria-label="Progresso delle evidenze" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${clampPercent(journey.progressPct)}"><span style="--li-progress:${clampPercent(journey.progressPct)}%"></span></div>
          <ol>${(journey.waypoints || []).map(point => `<li class="${point.reached ? "is-reached" : ""}"><span aria-hidden="true"></span><small>${escapeHtml(point.label)}</small></li>`).join("")}</ol>
        </div>
      </section>`;
  }

  function renderNextMove(model) {
    const insight = model.insight || {};
    const needed = Math.max(0, Number(model.minimumAnswers || 0) - Number(model.summary?.totalAnswers || 0));
    const nextChapter = [...model.chapters].sort((a, b) => Number(a.attempts || 0) - Number(b.attempts || 0) || Number(a.chapter) - Number(b.chapter))[0];
    const repeatsRecentAccuracy = /\d+%|precisione/i.test(String(insight.title || "")) && /recent/i.test(String(insight.title || ""));
    const title = repeatsRecentAccuracy && nextChapter
      ? `Esplora il capitolo ${nextChapter.chapter}: ${nextChapter.title}`
      : (insight.title || "Continua a costruire il percorso");
    return `
      <aside class="li-next-move ${insight.tone ? `is-${escapeHtml(insight.tone)}` : ""}" aria-labelledby="liNextMoveTitle">
        <p class="li-kicker">Prossima mossa</p><h2 id="liNextMoveTitle">${escapeHtml(title)}</h2><p>${escapeHtml(insight.body || "Ogni risposta rende la lettura più utile.")}</p>
        ${model.state === "empty" ? '<button class="li-primary-action" type="button" data-li-action="start-quiz" data-chapter="1" onclick="MagicBookLearningInsights.handleClick(event)">Inizia dal capitolo 1</button>' : ""}
        ${repeatsRecentAccuracy && nextChapter ? `<button class="li-secondary-action" type="button" data-li-action="start-quiz" data-chapter="${nextChapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Continua da qui</button>` : ""}
        ${model.state === "insufficient" && needed ? `<small>Ancora ${needed} ${plural(needed, "risposta", "risposte")} per una lettura più affidabile.</small>` : ""}
      </aside>`;
  }

  function strongestChapter(model) {
    return model.chapters.filter(chapter => Number(chapter.attempts) > 0).sort((a, b) => Number(b.attempts) - Number(a.attempts) || Number(b.accuracyPct || 0) - Number(a.accuracyPct || 0))[0] || null;
  }

  function renderSignals(model) {
    const chapter = strongestChapter(model);
    const planItem = Array.isArray(model.plan) ? model.plan[0] : null;
    const recovered = Number(model.summary?.recoveredThisWeek || 0);
    const signals = [];
    if (chapter) signals.push(`<div><span class="li-signal-mark is-route" aria-hidden="true"></span><p><strong>Capitolo più osservato</strong><span>${escapeHtml(chapter.title)} · ${chapter.attempts} ${plural(chapter.attempts, "tentativo", "tentativi")}</span></p></div>`);
    if (planItem) signals.push(`<div><span class="li-signal-mark is-action" aria-hidden="true"></span><p><strong>Priorità attuale</strong><span>${escapeHtml(planItem.title)} · ${Number(planItem.estimatedMinutes || 0)} min</span></p></div>`);
    if (recovered) signals.push(`<div><span class="li-signal-mark is-recovered" aria-hidden="true"></span><p><strong>Recuperi recenti</strong><span>${recovered} ${plural(recovered, "segnale è tornato stabile", "segnali sono tornati stabili")}</span></p></div>`);
    if (!signals.length) signals.push(`<div><span class="li-signal-mark is-route" aria-hidden="true"></span><p><strong>La mappa si sta formando</strong><span>I primi quiz collegheranno capitoli, segnali e prossime azioni.</span></p></div>`);
    return `<section class="li-signal-board" aria-labelledby="liSignalsTitle"><div><p class="li-kicker">Cosa sappiamo adesso</p><h2 id="liSignalsTitle">Segnali, senza supposizioni.</h2></div><div class="li-signal-list">${signals.slice(0, 3).join("")}</div></section>`;
  }

  function chapterDetail(chapter) {
    if (!chapter) return "";
    const recent = chapter.recentAccuracyPct === null || chapter.recentAccuracyPct === undefined ? "—" : formatPercent(chapter.recentAccuracyPct);
    const accuracy = chapter.accuracyPct === null || chapter.accuracyPct === undefined ? "—" : formatPercent(chapter.accuracyPct);
    return `
      <aside id="liChapterDetail" class="li-chapter-detail" aria-label="Dettaglio capitolo ${chapter.chapter}">
        <div class="li-chapter-detail-copy"><div class="li-detail-title"><span class="li-state ${stateClass(chapter.status)}">${escapeHtml(chapter.statusLabel)}</span><small>Capitolo ${chapter.chapter}</small></div><h3 tabindex="-1">${escapeHtml(chapter.title)}</h3>${chapter.titleBn ? `<p lang="bn" class="li-bangla-title">${escapeHtml(chapter.titleBn)}</p>` : ""}</div>
        <dl><div><dt>Tentativi</dt><dd>${Number(chapter.attempts || 0)}</dd></div><div><dt>Copertura</dt><dd>${formatPercent(chapter.coveragePct)}</dd></div><div><dt>Precisione</dt><dd>${accuracy}</dd></div><div><dt>Recente</dt><dd>${recent}</dd></div><div><dt>Da rivedere</dt><dd>${Number(chapter.activeErrors || 0)}</dd></div><div><dt>Recuperati</dt><dd>${Number(chapter.resolvedErrors || 0)}</dd></div></dl>
        <div class="li-detail-actions"><button class="li-primary-action" type="button" data-li-action="start-quiz" data-chapter="${chapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Fai il quiz</button><button class="li-secondary-action" type="button" data-li-action="open-book" data-chapter="${chapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Apri il capitolo</button></div>
      </aside>`;
  }

  function chapterNode(chapter) {
    const selected = state.selectedChapter === chapter.chapter;
    return `<li><button type="button" class="${stateClass(chapter.status)} ${selected ? "is-selected" : ""}" data-li-chapter="${chapter.chapter}" onclick="MagicBookLearningInsights.handleClick(event)" aria-expanded="${selected}" ${selected ? 'aria-controls="liChapterDetail"' : ""}><span class="li-checkpoint" aria-hidden="true"><span>${String(chapter.chapter).padStart(2, "0")}</span></span><span class="li-chapter-copy"><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.statusLabel)} · ${Number(chapter.attempts || 0)} ${plural(chapter.attempts, "tentativo", "tentativi")}</small></span></button></li>`;
  }

  function renderChapterMap(model) {
    const groups = Array.from({ length: 5 }, (_, index) => model.chapters.slice(index * 5, index * 5 + 5));
    return `
      <section class="li-chapters" aria-labelledby="liChaptersTitle">
        <header class="li-section-heading"><div><p class="li-kicker">Mappa dei 25 capitoli</p><h2 id="liChaptersTitle">Il percorso, tappa per tappa.</h2><p>Apri un checkpoint per leggere i dati del capitolo e scegliere cosa fare.</p></div><div class="li-legend" aria-label="Legenda degli stati"><span class="is-solido">Solido</span><span class="is-in-miglioramento">In miglioramento</span><span class="is-attenzione">Da rivedere</span><span class="is-non-iniziato">Non iniziato</span></div></header>
        <div class="li-stage-list">${groups.map((chapters, groupIndex) => {
          const selected = chapters.find(chapter => chapter.chapter === state.selectedChapter);
          return `<section class="li-stage ${groupIndex % 2 ? "is-reverse" : ""}" aria-labelledby="liStage${groupIndex + 1}"><div class="li-stage-label"><span>Tappa ${groupIndex + 1}</span><strong id="liStage${groupIndex + 1}">Capitoli ${groupIndex * 5 + 1}–${groupIndex * 5 + 5}</strong></div><ol>${chapters.map(chapterNode).join("")}</ol>${chapterDetail(selected)}</section>`;
        }).join("")}</div>
      </section>`;
  }

  function renderStatistics(model) {
    return `${freshnessBanner()}<div class="li-stat-layout">${renderSnapshot(model)}${renderNextMove(model)}</div>${renderSignals(model)}${renderChapterMap(model)}`;
  }

  const LENSES = Object.freeze([
    { id: "figure", label: "Figure", key: "figures" },
    { id: "quiz", label: "Quiz", key: "questions" },
    { id: "parole", label: "Parole", key: "words" },
    { id: "argomenti", label: "Argomenti", key: "topics" },
    { id: "capitoli", label: "Capitoli", key: "chapters" },
    { id: "recuperati", label: "Recuperati", key: "recovered" }
  ]);

  function activeLens() {
    return LENSES.find(item => item.id === state.lens) || LENSES[0];
  }

  function itemKey(item) {
    return `${item.type}:${item.id}`;
  }

  function lensForType(type) {
    return ({ figure: "figure", question: "quiz", quiz: "quiz", word: "parole", topic: "argomenti", chapter: "capitoli" })[type] || "figure";
  }

  function chapterErrorItems(model) {
    return (model.chapters || [])
      .filter(chapter => Number(chapter.activeErrors || 0) > 0 || chapter.status === "attenzione" || chapter.status === "in_miglioramento")
      .map(chapter => ({
        type: "chapter",
        id: String(chapter.chapter),
        typeLabel: "Capitolo",
        title: chapter.title,
        titleBn: chapter.titleBn,
        chapter: chapter.chapter,
        attempts: chapter.attempts,
        wrong: chapter.wrong,
        accuracy: chapter.accuracyPct,
        status: chapter.status,
        statusLabel: chapter.statusLabel,
        reason: Number(chapter.activeErrors || 0) > 0
          ? `${chapter.activeErrors} ${plural(chapter.activeErrors, "segnale attivo richiede", "segnali attivi richiedono")} un ripasso mirato.`
          : "Le risposte recenti mostrano un miglioramento da consolidare.",
        relatedQuiz: []
      }));
  }

  function itemsForLens(model, lens = activeLens()) {
    return lens.id === "capitoli"
      ? chapterErrorItems(model)
      : (Array.isArray(model.errors?.[lens.key]) ? model.errors[lens.key] : []);
  }

  function renderRelatedQuiz(item) {
    const rows = Array.isArray(item.relatedQuiz) ? item.relatedQuiz : [];
    if (!rows.length) return "";
    return `<div class="li-related"><h4>Quiz collegati</h4><ul>${rows.map(row => `<li><span>${escapeHtml(row.quizId)}</span><p>${escapeHtml(row.question)}</p></li>`).join("")}</ul></div>`;
  }

  function renderErrorDetail(item) {
    if (!item) return `<aside class="li-detail-placeholder" aria-label="Dettaglio del segnale"><span class="li-placeholder-route" aria-hidden="true"></span><h3>Scegli un segnale</h3><p>Qui trovi perché emerge, i quiz collegati e l’azione più utile.</p></aside>`;
    const chapter = Number(item.chapter || item.relatedQuiz?.[0]?.chapter || 0);
    return `
      <aside class="li-error-detail" id="liErrorDetail-${escapeHtml(item.type)}-${escapeHtml(item.id)}" aria-label="Dettaglio ${escapeHtml(item.title)}">
        <button class="li-detail-close" type="button" data-li-action="close-detail" onclick="MagicBookLearningInsights.handleClick(event)" aria-label="Chiudi dettaglio"><span aria-hidden="true"></span></button>
        ${item.figureId ? `<figure><div class="li-media-frame"><img class="li-figure-image" loading="lazy" decoding="async" src="${figureUrl(item.figureId)}" alt="${escapeHtml(item.title)}"><span class="li-media-fallback">Figura non disponibile</span></div><figcaption>Figura collegata ai tuoi quiz</figcaption></figure>` : ""}
        <div class="li-error-explanation"><div class="li-detail-title"><span class="li-state ${stateClass(item.status)}">${escapeHtml(item.statusLabel)}</span><small>${escapeHtml(item.typeLabel)}${chapter ? ` · Capitolo ${chapter}` : ""}</small></div><h3 tabindex="-1">${escapeHtml(item.title)}</h3>${item.titleBn ? `<p lang="bn" class="li-bangla-title">${escapeHtml(item.titleBn)}</p>` : ""}<div class="li-why"><strong>Perché emerge</strong><p>${escapeHtml(item.reason)}</p></div>${item.simpleItalian ? `<p class="li-simple-copy">${escapeHtml(item.simpleItalian)}</p>` : ""}${item.simpleBangla ? `<p lang="bn" class="li-simple-copy">${escapeHtml(item.simpleBangla)}</p>` : ""}${renderRelatedQuiz(item)}
          <div class="li-detail-actions">${item.type === "word" ? `<button class="li-primary-action" type="button" data-li-action="dictionary" data-query="${escapeHtml(item.title)}" onclick="MagicBookLearningInsights.handleClick(event)">Apri nel dizionario</button>` : ""}${chapter ? `<button class="li-primary-action" type="button" data-li-action="start-quiz" data-chapter="${chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Fai il quiz</button><button class="li-secondary-action" type="button" data-li-action="open-book" data-chapter="${chapter}" onclick="MagicBookLearningInsights.handleClick(event)">Apri il capitolo</button>` : ""}</div>
        </div>
      </aside>`;
  }

  function renderErrorItem(item) {
    const key = itemKey(item);
    const selected = state.selectedKey === key;
    const detailId = `liErrorDetail-${item.type}-${item.id}`;
    return `<li class="li-error-row ${selected ? "is-selected" : ""}"><button type="button" data-li-detail="${escapeHtml(key)}" onclick="MagicBookLearningInsights.handleClick(event)" aria-expanded="${selected}" ${selected ? `aria-controls="${escapeHtml(detailId)}"` : ""}>${item.figureId ? `<span class="li-row-media"><img class="li-figure-image" loading="lazy" decoding="async" src="${figureUrl(item.figureId)}" alt=""><span class="li-media-fallback">Img</span></span>` : `<span class="li-error-index" aria-hidden="true">${escapeHtml(String(item.typeLabel || "S").slice(0, 1))}</span>`}<span class="li-error-copy"><small>${escapeHtml(item.typeLabel)}${item.chapter ? ` · Capitolo ${Number(item.chapter)}` : ""}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.reason)}</span></span><span class="li-state ${stateClass(item.status)}">${escapeHtml(item.statusLabel)}</span><span class="li-disclosure" aria-hidden="true"><span></span></span></button></li>`;
  }

  function renderErrorList(model) {
    const lens = activeLens();
    const all = itemsForLens(model, lens);
    const visible = all.slice(0, state.visibleCount);
    if (!all.length) {
      const recovered = lens.id === "recuperati";
      return `<div class="li-empty-list"><span class="li-empty-mark ${recovered ? "is-recovered" : ""}" aria-hidden="true"></span><h3>${recovered ? "I recuperi appariranno qui" : "Nessun pattern affidabile"}</h3><p>${model.state === "ready" ? "Continua a esercitarti: mostriamo solo segnali sostenuti da più risposte." : "Servono più risposte per separare un caso isolato da un pattern."}</p><button class="li-secondary-action" type="button" data-li-action="start-quiz" data-chapter="1" onclick="MagicBookLearningInsights.handleClick(event)">Continua con un quiz</button></div>`;
    }
    return `<ol class="li-error-list">${visible.map(renderErrorItem).join("")}</ol>${visible.length < all.length ? `<button class="li-more" type="button" data-li-action="more" onclick="MagicBookLearningInsights.handleClick(event)">Mostra altri ${Math.min(CONFIG.pageSize, all.length - visible.length)}</button>` : ""}`;
  }

  function emergingSignals(model) {
    const candidates = [];
    [["figure", "figures"], ["argomenti", "topics"], ["parole", "words"], ["quiz", "questions"]].forEach(([lens, key]) => {
      (model.errors?.[key] || []).forEach(item => candidates.push({ item, lens }));
    });
    const priority = item => item.status === "attenzione" ? 3 : item.status === "in_miglioramento" ? 2 : 1;
    return candidates.sort((a, b) => priority(b.item) - priority(a.item) || Number(b.item.wrong || 0) - Number(a.item.wrong || 0) || Number(b.item.attempts || 0) - Number(a.item.attempts || 0)).filter((entry, index, list) => list.findIndex(candidate => itemKey(candidate.item) === itemKey(entry.item)) === index).slice(0, 3);
  }

  function renderEmerging(model) {
    const signals = emergingSignals(model);
    if (!signals.length) return `<section class="li-emerging is-quiet" aria-labelledby="liEmergingTitle"><header><div><p class="li-kicker">Cosa sta emergendo</p><h2 id="liEmergingTitle">Il quadro è ancora aperto.</h2></div><p>Quiz, segnali e piano si attiveranno solo quando i dati saranno abbastanza solidi.</p></header><div class="li-quiet-steps"><span>Quiz</span><span>Segnali</span><span>Piano</span></div></section>`;
    return `<section class="li-emerging" aria-labelledby="liEmergingTitle"><header><div><p class="li-kicker">Cosa sta emergendo</p><h2 id="liEmergingTitle">Prima guarda qui.</h2></div><p>I segnali più utili, ordinati per priorità e frequenza.</p></header><div class="li-emerging-grid">${signals.map(({ item, lens }, index) => `<button type="button" class="li-emerging-card" data-li-emerging="${escapeHtml(itemKey(item))}" data-li-emerging-lens="${lens}" onclick="MagicBookLearningInsights.handleClick(event)"><span class="li-emerging-rank">0${index + 1}</span>${item.figureId ? `<span class="li-emerging-media"><img class="li-figure-image" loading="lazy" decoding="async" src="${figureUrl(item.figureId)}" alt=""><span class="li-media-fallback">Figura</span></span>` : `<span class="li-emerging-type">${escapeHtml(item.typeLabel)}</span>`}<span class="li-emerging-copy"><small>${escapeHtml(item.typeLabel)}${item.chapter ? ` · Capitolo ${Number(item.chapter)}` : ""}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.reason)}</span></span><span class="li-state ${stateClass(item.status)}">${escapeHtml(item.statusLabel)}</span></button>`).join("")}</div></section>`;
  }

  function renderPlan(model) {
    const plan = Array.isArray(model.plan) ? model.plan.slice(0, 3) : [];
    if (!plan.length) return `<aside class="li-plan"><p class="li-kicker">Piano di oggi</p><h2>Prima raccogliamo evidenze.</h2><p>Il piano apparirà quando i risultati indicano azioni abbastanza precise da essere utili.</p><button class="li-secondary-action" type="button" data-li-action="start-quiz" data-chapter="1" onclick="MagicBookLearningInsights.handleClick(event)">Continua a esercitarti</button></aside>`;
    const minutes = plan.reduce((sum, item) => sum + Number(item.estimatedMinutes || 0), 0);
    return `<aside class="li-plan" aria-labelledby="liPlanTitle"><div class="li-plan-head"><div><p class="li-kicker">Piano di oggi</p><h2 id="liPlanTitle">${minutes} minuti, in ordine.</h2></div><span>${plan.length}</span></div><ol>${plan.map((item, index) => `<li><span class="li-plan-number">0${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong>${item.titleBn ? `<small lang="bn">${escapeHtml(item.titleBn)}</small>` : ""}<p>${escapeHtml(item.reason)}</p><button type="button" data-li-plan-action="${escapeHtml(item.action)}" data-entity-id="${escapeHtml(item.entityId)}" data-chapter="${Number(item.chapter || 0)}" data-title="${escapeHtml(item.title)}" onclick="MagicBookLearningInsights.handleClick(event)">${item.action === "dictionary" ? "Apri nel dizionario" : item.action === "figure" ? "Rivedi la figura" : "Vai al quiz"}<img src="icons/next.png" alt=""></button></div></li>`).join("")}</ol></aside>`;
  }

  function renderRecovered(model) {
    const recovered = Array.isArray(model.errors?.recovered) ? model.errors.recovered.slice(0, 3) : [];
    if (!recovered.length) return "";
    return `<section class="li-recovered" aria-labelledby="liRecoveredTitle"><header><span class="li-recovered-mark" aria-hidden="true"></span><div><p class="li-kicker">Recuperati</p><h2 id="liRecoveredTitle">I progressi che restano visibili.</h2></div></header><ul>${recovered.map(item => `<li><small>${escapeHtml(item.typeLabel)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.statusLabel)}</span></li>`).join("")}</ul></section>`;
  }

  function renderErrors(model) {
    const lens = activeLens();
    const selected = resolveItem(state.selectedKey);
    const planCount = Array.isArray(model.plan) ? Math.min(3, model.plan.length) : 0;
    return `
      ${freshnessBanner()}
      <header class="li-errors-heading"><div><p class="li-kicker">Centro recupero</p><h1 id="learningInsightsHeading" tabindex="-1">Capire. Riprovare. Recuperare.</h1><p>Qui gli errori diventano segnali concreti e azioni brevi.</p></div><dl aria-label="Riepilogo del recupero"><div><dt>Attivi</dt><dd>${Number(model.summary.activeErrors || 0)}</dd></div><div><dt>Nel piano</dt><dd>${planCount}</dd></div><div><dt>Recuperati</dt><dd>${Number(model.summary.recoveredThisWeek || 0)}</dd></div></dl></header>
      ${renderEmerging(model)}
      <div class="li-errors-layout">
        <section class="li-error-explorer" aria-labelledby="liLensHeading">
          <header class="li-lens-head"><div><p class="li-kicker">Esplora i segnali</p><h2 id="liLensHeading">${escapeHtml(lens.label)}</h2></div><span>${itemsForLens(model, lens).length || "—"} risultati</span></header>
          <div class="li-lenses" role="tablist" aria-label="Categorie di errore">${LENSES.map(item => {
            const count = itemsForLens(model, item).length;
            return `<button type="button" role="tab" id="li-tab-${item.id}" aria-controls="li-panel-${item.id}" aria-selected="${item.id === state.lens}" tabindex="${item.id === state.lens ? "0" : "-1"}" data-li-lens="${item.id}" onclick="MagicBookLearningInsights.handleClick(event)"><span>${escapeHtml(item.label)}</span><small>${count || "—"}</small></button>`;
          }).join("")}</div>
          ${LENSES.filter(item => item.id !== state.lens).map(item => `<div id="li-panel-${item.id}" role="tabpanel" aria-labelledby="li-tab-${item.id}" hidden></div>`).join("")}
          <div class="li-explorer-body"><div id="li-panel-${state.lens}" class="li-list-pane" role="tabpanel" aria-labelledby="li-tab-${state.lens}" tabindex="0">${renderErrorList(model)}</div><div class="li-detail-pane">${renderErrorDetail(selected)}</div></div>
        </section>
        ${renderPlan(model)}
      </div>
      ${renderRecovered(model)}`;
  }

  function renderErrorState(kind) {
    const auth = kind === "auth";
    const offline = kind === "offline";
    const timeout = kind === "timeout";
    const title = auth ? "La sessione non è più valida." : offline ? "Sei offline e non ci sono ancora dati salvati." : timeout ? "La lettura sta impiegando troppo tempo." : "Non riesco a leggere il percorso adesso.";
    const body = auth ? "Accedi di nuovo per proteggere le tue statistiche personali." : offline ? "Torna online una volta per creare la prima copia locale delle statistiche." : timeout ? "I quiz continuano a funzionare. Riprova tra poco: le risposte registrate restano al sicuro." : "I quiz continuano a funzionare. Puoi riprovare senza perdere le risposte già registrate.";
    return `<div class="li-shell">${renderTop(state.mode)}<main class="li-main"><section class="li-failure" aria-labelledby="learningInsightsHeading"><span class="li-failure-mark ${offline ? "is-offline" : auth ? "is-auth" : ""}" aria-hidden="true"></span><p class="li-kicker">${auth ? "Accesso" : offline ? "Modalità offline" : timeout ? "Tempo scaduto" : "Interruzione temporanea"}</p><h1 id="learningInsightsHeading" tabindex="-1">${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><div><button class="li-primary-action" type="button" data-li-action="${auth ? "login" : "refresh"}" onclick="MagicBookLearningInsights.handleClick(event)">${auth ? "Accedi di nuovo" : "Riprova"}</button><button class="li-secondary-action" type="button" data-li-action="home" onclick="MagicBookLearningInsights.handleClick(event)">Torna alla Home</button></div></section></main></div>`;
  }

  function focusHeading(content) {
    root.requestAnimationFrame?.(() => content?.querySelector("#learningInsightsHeading")?.focus({ preventScroll: true }));
  }

  function showFailure(kind, announcement) {
    const content = root.document?.getElementById("learningInsightsContent");
    replaceSafeContent(content, renderErrorState(kind));
    bindRenderedMedia();
    focusHeading(content);
    if (announcement) announce(announcement);
  }

  function focusSelectorFor(element) {
    if (!element) return "";
    const attributes = ["data-li-route", "data-li-lens", "data-li-chapter", "data-li-detail", "data-li-emerging", "data-li-plan-action", "data-li-action", "data-entity-id", "data-chapter", "data-query"];
    const selector = attributes
      .filter(attribute => element.hasAttribute?.(attribute))
      .map(attribute => `[${attribute}="${cssEscape(element.getAttribute(attribute))}"]`)
      .join("");
    return selector || (element.id ? `#${cssEscape(element.id)}` : "");
  }

  function render() {
    const content = root.document?.getElementById("learningInsightsContent");
    if (!content) return;
    const restoreFocus = content.contains(root.document?.activeElement)
      ? focusSelectorFor(root.document.activeElement)
      : "";
    if (!state.model) {
      replaceSafeContent(content, renderSkeleton());
      bindRenderedMedia();
      return;
    }
    replaceSafeContent(content, `<div class="li-shell">${renderTop(state.mode)}<main class="li-main">${state.mode === "errors" ? renderErrors(state.model) : renderStatistics(state.model)}</main></div>`);
    bindRenderedMedia();
    if (state.focusHeading) {
      state.focusHeading = false;
      focusHeading(content);
    } else if (restoreFocus) focusControl(restoreFocus);
  }

  function bindRenderedMedia() {
    root.document?.querySelectorAll(".li-figure-image").forEach(image => {
      image.addEventListener("error", () => {
        const frame = image.closest(".li-media-frame, .li-row-media, .li-emerging-media");
        frame?.classList.add("is-unavailable");
        image.alt = "Figura temporaneamente non disponibile";
      }, { once: true });
    });
  }

  async function localPendingEvents(userId) {
    try {
      const records = await root.MagicBookLearningSync?.getLocalEvents?.();
      return (Array.isArray(records) ? records : []).filter(record => normalizedUserId(record.user_id) === userId).filter(record => record.event_type === "answer_event").filter(record => ["pending", "retry", "sending"].includes(record.status)).slice(-CONFIG.maxLocalEvents).map(({ event_id, event_type, user_id, payload }) => ({ event_id, event_type, user_id, payload }));
    } catch {
      return [];
    }
  }

  async function readCache(userId) {
    try { return await root.MagicBookLearningSync?.getInsightsCache?.(userId) || null; } catch { return null; }
  }

  async function load({ force = false } = {}) {
    const auth = readAuth();
    if (!auth) {
      showFailure("auth", "Sessione richiesta.");
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
        state.model = { ...state.model, summary: { ...state.model.summary, pendingLocalEvents: localEvents.length, pendingLocalIncluded: false } };
        state.isCached = true;
        render();
        announce("Modalità offline: mostro l’ultima copia salvata.");
      } else showFailure("offline", "Sei offline e non esiste ancora una copia locale.");
      return;
    }

    state.isRefreshing = true;
    render();
    void root.MagicBookLearningSync?.flush?.({ reason: "insights-open" });
    let timedOut = false;
    const timeout = root.setTimeout(() => { timedOut = true; controller.abort(); }, CONFIG.timeoutMs);
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
        state.isRefreshing = false;
        showFailure("auth", "Sessione scaduta.");
        return;
      }
      if (!response.ok || !isModel(data)) throw new Error("learning_insights_unavailable");
      state.model = data;
      state.cachedAt = Date.now();
      state.isCached = false;
      await root.MagicBookLearningSync?.setInsightsCache?.(auth.userId, data);
      announce("Percorso aggiornato.");
    } catch (error) {
      if (requestId !== state.requestId) return;
      if (error?.name === "AbortError" && !timedOut) return;
      if (state.model) {
        state.isCached = true;
        announce(timedOut ? "Aggiornamento lento: mostro la copia salvata." : "Aggiornamento non disponibile: mostro la copia salvata.");
      } else {
        state.isRefreshing = false;
        showFailure(root.navigator?.onLine === false ? "offline" : timedOut ? "timeout" : "network", timedOut ? "Tempo di attesa scaduto." : "Servizio temporaneamente non disponibile.");
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
    if (!key) return null;
    const groups = [...Object.values(state.model?.errors || {}).filter(Array.isArray), chapterErrorItems(state.model || {})];
    return groups.flat().find(item => itemKey(item) === key) || null;
  }

  function focusControl(selector) {
    root.requestAnimationFrame?.(() => root.document?.querySelector(selector)?.focus({ preventScroll: true }));
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
    const emerging = event.target.closest("[data-li-emerging]");
    if (emerging) {
      state.lens = CONFIG.validLenses.includes(emerging.dataset.liEmergingLens) ? emerging.dataset.liEmergingLens : lensForType(resolveItem(emerging.dataset.liEmerging)?.type);
      state.selectedKey = emerging.dataset.liEmerging;
      state.visibleCount = CONFIG.pageSize;
      const url = new URL(root.location.href);
      url.pathname = "/errori";
      url.searchParams.set("tipo", state.lens);
      root.history.replaceState({ screen: "errors", lens: state.lens }, "", `${url.pathname}${url.search}`);
      render();
      root.requestAnimationFrame?.(() => root.document?.querySelector(".li-error-detail")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" }));
      return;
    }
    const chapter = event.target.closest("[data-li-chapter]");
    if (chapter) {
      const chapterNumber = Number(chapter.dataset.liChapter);
      state.selectedChapter = state.selectedChapter === chapterNumber ? 0 : chapterNumber;
      render();
      focusControl(`[data-li-chapter="${chapterNumber}"]`);
      return;
    }
    const detail = event.target.closest("[data-li-detail]");
    if (detail) {
      const key = detail.dataset.liDetail;
      state.selectedKey = state.selectedKey === key ? "" : key;
      render();
      focusControl(`[data-li-detail="${cssEscape(key)}"]`);
      if (state.selectedKey) root.requestAnimationFrame?.(() => root.document?.querySelector(".li-error-detail h3")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }));
      return;
    }
    const planAction = event.target.closest("[data-li-plan-action]");
    if (planAction) {
      const action = planAction.dataset.liPlanAction;
      if (action === "dictionary") root.showMagicDictionary?.({ query: planAction.dataset.title });
      else if (action === "figure") {
        state.lens = "figure";
        state.selectedKey = `figure:${planAction.dataset.entityId}`;
        state.visibleCount = CONFIG.pageSize;
        const url = new URL(root.location.href);
        url.pathname = "/errori";
        url.searchParams.set("tipo", "figure");
        root.history.replaceState({ screen: "errors", lens: "figure" }, "", `${url.pathname}${url.search}`);
        render();
        root.document?.querySelector(".li-error-detail")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
      } else if (Number(planAction.dataset.chapter)) root.location.href = `/quiz/capitolo-${String(planAction.dataset.chapter).padStart(2, "0")}`;
      return;
    }
    const action = event.target.closest("[data-li-action]");
    if (!action) return;
    const chapterNumber = Number(action.dataset.chapter || 0);
    if (action.dataset.liAction === "home") root.showHome?.();
    else if (action.dataset.liAction === "refresh" && !state.isRefreshing) void load({ force: true });
    else if (action.dataset.liAction === "more") { state.visibleCount += CONFIG.pageSize; render(); }
    else if (action.dataset.liAction === "close-detail") { state.selectedKey = ""; render(); focusControl(".li-list-pane"); }
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
