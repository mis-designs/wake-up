import { FIGURE_CATALOG_SOURCE } from './figure-catalog.mjs?v=1';
import { FIGURE_STUDY_CATEGORIES, FIGURE_STUDY_ITEMS, studyCategory, studyFigure, searchStudyFigures, figureStudyPath } from './figure-study-catalog.mjs?v=2';
import { createFigureStudyData, explanationImageSource } from './figure-study-data.mjs?v=2';
import { FIGURE_STUDY_NOTES, FIGURE_STUDY_NOTES_SOURCE } from './figure-study-notes.mjs?v=1';

const node = (tag, className = '', text = '') => {
  const result = document.createElement(tag);
  result.className = className; result.textContent = text;
  return result;
};
const bn = (text, className = '') => { const p = node('p', className, text); p.lang = 'bn'; return p; };
const button = (label, action) => {
  const b = node('button', 'fs-button', label); b.type = 'button'; b.dataset.action = action; return b;
};
const link = (label, path, className = '') => {
  const a = node('a', className, label); a.href = path; a.dataset.figureRoute = ''; return a;
};
function loading(label) {
  const box = node('div', 'magic-loading-indicator magic-loading-indicator--panel');
  box.setAttribute('role', 'status');
  const media = node('span', 'magic-loading-indicator__media');
  const image = node('img', 'magic-loading-indicator__image'); image.src = '/icons/loading.gif'; image.alt = '';
  media.append(image); box.append(media, node('span', 'magic-loading-indicator__label', label)); return box;
}

export function createFigureStudy({ root, request, identity, navigate, header }) {
  const lifetime = new AbortController();
  const data = createFigureStudyData(request, identity);
  const positions = new Map(), limits = new Map();
  let revision = 0, active = false, currentPath = '', selectedFigure = null;
  let currentCategory = '', query = '', restoreFrame = 0;
  let currentExamples = [], answers = new Map();
  const $ = id => root.querySelector(`#${id}`);

  function remember() {
    if (!active) return;
    const focused = document.activeElement?.closest('[data-figure-route]');
    positions.set(currentPath, { top: scrollY, href: focused?.getAttribute('href') || '' });
    while (positions.size > 30) positions.delete(positions.keys().next().value);
  }
  function go(path, replace = false) { remember(); navigate(path, replace); }
  function suspend() {
    remember(); active = false; revision++; data.cancel(); cancelAnimationFrame(restoreFrame);
  }
  function figureImage(item, className, lazy = false) {
    const image = node('img', className);
    image.src = `/api/asset?kind=figure&figure=${item.id}&presentation=numberless-v2`;
    image.alt = item.italian; image.width = 240; image.height = 180;
    image.decoding = 'async'; if (lazy) image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.hidden = true;
      image.after(node('span', 'fs-image-missing', 'Immagine non disponibile'));
    }, { once: true });
    return image;
  }
  function renderCategories() {
    const introduction = node('div', 'fs-introduction');
    introduction.append(node('h2', '', 'Impara a riconoscerli.'), bn('চিহ্ন দেখুন, অর্থ বুঝুন, তারপর অনুশীলন করুন।'),
      node('p', 'fs-muted', `${FIGURE_STUDY_ITEMS.length} figure · scegli una categoria o cerca un nome.`));
    root.append(introduction);
    const categories = node('nav', 'fs-categories'); categories.setAttribute('aria-label', 'Categorie delle figure');
    for (const category of FIGURE_STUDY_CATEGORIES) {
      const a = link('', figureStudyPath({ category: category.id }), 'fs-category');
      const copy = node('span'); copy.append(node('strong', '', category.title), bn(category.bangla));
      const end = node('span', 'fs-category-end');
      const arrow = node('span', 'fs-chevron'); arrow.setAttribute('aria-hidden', 'true');
      end.append(node('span', 'fs-category-count', `${category.figures.length}`), arrow);
      a.append(copy, end); categories.append(a);
    }
    categories.id = 'fs-categories'; root.append(categories);
  }
  function renderSearch() {
    const search = node('div', 'fs-search');
    const label = node('label', 'sr-only', 'Cerca una figura in italiano o bangla'); label.htmlFor = 'fs-search';
    const input = node('input'); input.id = 'fs-search'; input.type = 'search'; input.value = query;
    input.maxLength = 100; input.placeholder = 'Cerca in italiano o বাংলা';
    const clear = button('Cancella', 'clear'); clear.hidden = !query; clear.id = 'fs-clear';
    search.append(label, input, clear);
    const categoryNavigation = $('fs-categories');
    root.insertBefore(search, categoryNavigation);
    const count = node('p', 'fs-muted'); count.id = 'fs-count'; count.setAttribute('role', 'status');
    const grid = node('div', 'fs-grid'); grid.id = 'fs-grid';
    const more = button('Mostra altre figure', 'more'); more.id = 'fs-more';
    root.insertBefore(count, categoryNavigation);
    root.append(grid, more);
    renderResults();
  }
  function renderResults(append = false) {
    const visible = Boolean(currentCategory || query);
    const categories = $('fs-categories'); if (categories) categories.hidden = Boolean(query);
    const grid = $('fs-grid');
    const start = append ? grid.children.length : 0;
    if (!append) grid.replaceChildren();
    grid.hidden = !visible;
    const items = searchStudyFigures(currentCategory, query);
    const key = `${currentCategory}:${query}`;
    const limit = limits.get(key) || 18;
    $('fs-clear').hidden = !query;
    $('fs-count').textContent = visible ? `${items.length} ${items.length === 1 ? 'figura trovata' : 'figure trovate'}` : '';
    $('fs-more').hidden = !visible || items.length <= limit;
    if (!visible) return;
    if (!items.length) {
      grid.append(node('p', 'fs-empty', 'Nessuna figura trovata. Prova un’altra parola o cancella la ricerca.')); return;
    }
    for (const item of items.slice(start, limit)) {
      const a = link('', figureStudyPath({ category: currentCategory || item.category, figure: item.id, query }), 'fs-figure');
      const media = node('span', 'fs-thumbnail'); media.append(figureImage(item, '', true));
      const copy = node('span', 'fs-figure-copy'); copy.append(node('strong', '', item.displayTitle), bn(item.displayBangla));
      a.append(media, copy); grid.append(a);
    }
  }
  function renderLesson(item) {
    const lesson = node('article', 'fs-lesson');
    const overview = node('div', 'fs-lesson-overview');
    const media = node('div', 'fs-lesson-media'); media.append(figureImage(item, 'study-figure'));
    const names = node('div', 'fs-lesson-names');
    names.append(node('p', 'fs-kicker', studyCategory(item.category).title), node('h2', '', item.displayTitle), bn(item.displayBangla, 'fs-bangla-title'));
    overview.append(media, names); lesson.append(overview);
    const note = FIGURE_STUDY_NOTES[item.id];
    if (note) {
      const meaning = node('section', 'fs-meaning');
      meaning.append(node('h3', '', 'Da ricordare'), node('p', '', note.it), bn(note.bn));
      lesson.append(meaning);
    }
    const illustrated = node('details', 'fs-illustrated');
    illustrated.append(node('summary', '', 'Spiegazione illustrata'));
    const explanation = node('section', 'fs-explanation'); explanation.id = 'fs-explanation';
    explanation.setAttribute('aria-label', 'Spiegazione illustrata'); explanation.setAttribute('aria-live', 'polite'); illustrated.append(explanation); lesson.append(illustrated);
    const practice = node('section', 'fs-practice'); practice.id = 'fs-practice';
    practice.append(node('h3', '', 'Prova tu'), bn('বুঝেছেন কি না, যাচাই করুন।'),
      button('Prova i quiz di esempio', 'examples'), node('p', 'fs-caption', 'Ripasso libero · non modifica le statistiche.'));
    lesson.append(practice);
    const sources = node('details', 'fs-sources');
    const source = node('a', '', 'Fonte dei nomi italiani · listato AB'); source.href = `${FIGURE_CATALOG_SOURCE}#page=${item.page}`;
    source.target = '_blank'; source.rel = 'noopener noreferrer';
    sources.append(node('summary', '', 'Fonti e traduzioni'), source,
      node('p', '', 'Il bangla è un supporto allo studio, non una traduzione ufficiale.'));
    if (note) {
      const reference = node('a', '', `Nota didattica · Regolamento, art. ${note.article}`);
      reference.href = FIGURE_STUDY_NOTES_SOURCE; reference.target = '_blank'; reference.rel = 'noopener noreferrer'; sources.append(reference);
    }
    lesson.append(sources); root.append(lesson);
  }
  async function loadExplanation(manual = false) {
    const target = $('fs-explanation'), ownRevision = revision, figure = selectedFigure;
    if (!target || !figure || target.getAttribute('aria-busy') === 'true') return;
    const restoreFocus = manual && target.contains(document.activeElement);
    target.replaceChildren(loading('Carico la spiegazione illustrata…'));
    target.setAttribute('aria-busy', 'true');
    try {
      if (manual) data.invalidate('getExplanationFigures');
      const manifest = await data.read('getExplanationFigures');
      if (!active || revision !== ownRevision) return;
      const src = explanationImageSource(manifest, figure.id);
      target.replaceChildren();
      if (!src) {
        const confirmedAbsent = manifest.complete === true && Array.isArray(manifest.figures) && !manifest.figures.includes(figure.id);
        target.append(node('p', 'fs-muted', confirmedAbsent
          ? 'Illustrazione non ancora disponibile. Puoi continuare con gli esempi.'
          : 'Non riesco a verificare l’illustrazione adesso. Puoi continuare con gli esempi.'));
        target.append(bn(confirmedAbsent ? 'ছবিসহ ব্যাখ্যা এখনও নেই। উদাহরণ দিয়ে অনুশীলন করতে পারেন।' : 'এখন ছবিসহ ব্যাখ্যাটি যাচাই করা যাচ্ছে না। উদাহরণ দিয়ে অনুশীলন করতে পারেন।', 'fs-muted'));
        if (!confirmedAbsent) target.append(button('Riprova spiegazione', 'explanation'));
        return;
      }
      const image = node('img', 'fs-explanation-image'); image.alt = `Spiegazione illustrata: ${figure.italian}`;
      image.decoding = 'async'; image.src = src;
      image.addEventListener('error', () => {
        if (revision !== ownRevision) return;
        image.replaceWith(node('p', 'fs-muted', 'L’immagine non si è caricata. Controlla la connessione e riprova.'), button('Riprova spiegazione', 'explanation'));
      }, { once: true });
      target.append(image);
    } catch (_) {
      if (!active || revision !== ownRevision) return;
      target.replaceChildren(node('p', 'fs-muted', 'La spiegazione non si è caricata. Riprova quando la connessione è disponibile.'), button('Riprova spiegazione', 'explanation'));
    } finally {
      if (revision === ownRevision) {
        target.removeAttribute('aria-busy');
        if (restoreFocus) target.parentElement.querySelector('summary')?.focus({ preventScroll: true });
      }
    }
  }
  async function loadExamples() {
    const target = $('fs-practice'), ownRevision = revision, figure = selectedFigure;
    if (!target || target.getAttribute('aria-busy') === 'true') return;
    target.setAttribute('aria-busy', 'true'); target.replaceChildren(loading('Carico gli esempi…'));
    try {
      const response = await data.read('getFigureStudy', figure.id);
      if (!active || revision !== ownRevision) return;
      if (!Array.isArray(response.examples) || response.examples.length > 2) throw new Error('invalid_examples');
      currentExamples = response.examples; answers = new Map();
      target.replaceChildren(node('h3', '', 'Prova tu'), node('p', 'fs-muted', 'Scegli Vero o Falso. La risposta appare dopo il tuo tentativo.'));
      if (!currentExamples.length) target.append(node('p', 'fs-muted', 'Non ci sono ancora esempi collegati a questa figura nel Magic Book.'));
      for (const [index, example] of currentExamples.entries()) {
        const article = node('article', 'fs-example');
        article.append(node('h4', '', `Esempio ${index + 1}`), node('p', 'fs-question', String(example.question).replace(/\u00ad/g, '')));
        if (example.question_bd) {
          const translation = node('details', 'fs-example-translation');
          translation.append(node('summary', '', 'Traduzione বাংলা'), bn(example.question_bd)); article.append(translation);
        }
        const controls = node('div', 'fs-answers'); controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', `Rispondi all’esempio ${index + 1}`);
        for (const [label, value] of [['Vero', 1], ['Falso', 0]]) {
          const b = button(label, 'answer'); b.dataset.example = String(index); b.dataset.answer = String(value);
          b.setAttribute('aria-pressed', 'false'); controls.append(b);
        }
        const feedback = node('p', 'fs-feedback'); feedback.id = `fs-answer-${index}`; feedback.setAttribute('role', 'status');
        article.append(controls, feedback); target.append(article);
      }
      if (currentExamples.length) target.append(node('p', 'fs-caption', 'Esempi dal Magic Book · ripasso senza punteggio.'));
      target.querySelector('h3').tabIndex = -1; target.querySelector('h3').focus({ preventScroll: true });
    } catch (_) {
      if (!active || revision !== ownRevision) return;
      target.replaceChildren(node('p', '', 'Gli esempi non sono disponibili al momento.'), button('Riprova esempi', 'examples'));
    } finally { if (revision === ownRevision) target.removeAttribute('aria-busy'); }
  }
  function render(url = new URL(location.href)) {
    suspend(); active = true;
    currentPath = url.pathname + url.search;
    currentCategory = studyCategory(url.searchParams.get('category'))?.id || '';
    query = (url.searchParams.get('q') || '').slice(0, 100);
    selectedFigure = studyFigure(url.searchParams.get('figure'));
    currentExamples = []; answers.clear(); root.replaceChildren();
    const category = studyCategory(currentCategory);
    root.dataset.level = selectedFigure ? 'lesson' : category ? 'category' : 'index';
    header('Segnali e figure', 'Studia');
    document.title = `MagicBook | ${selectedFigure?.italian || category?.title || 'Segnali e figure'}`;
    const trail = node('nav', 'fs-breadcrumb'); trail.setAttribute('aria-label', 'Percorso di studio');
    trail.append(link('Tutte le categorie', figureStudyPath()));
    if (selectedFigure) trail.append(link(studyCategory(selectedFigure.category).title, figureStudyPath({ category: currentCategory || selectedFigure.category, query })));
    if (category && !selectedFigure) { const here = node('span', '', category.title); here.setAttribute('aria-current', 'page'); trail.append(here); }
    else trail.hidden = true;
    root.append(trail);
    if (url.searchParams.has('figure') && !selectedFigure) {
      root.append(node('h2', '', 'Figura non trovata'), link('Torna alle categorie', figureStudyPath(), 'fs-button'));
    } else if (selectedFigure) renderLesson(selectedFigure);
    else {
      if (!category) renderCategories();
      else { const intro = node('div', 'fs-introduction'); intro.append(node('h2', '', category.title), bn(category.bangla, 'fs-bangla-title'), node('p', 'fs-muted', category.description)); root.append(intro); }
      renderSearch();
    }
    const saved = positions.get(currentPath);
    restoreFrame = requestAnimationFrame(() => {
      if (!active) return;
      const destination = saved?.href && [...root.querySelectorAll('a')].find(a => a.getAttribute('href') === saved.href);
      if (destination) destination.focus({ preventScroll: true });
      else { const heading = root.querySelector('h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }
      window.scrollTo({ top: saved?.top || 0, behavior: 'instant' });
    });
  }
  // One delegated listener also covers future lessons without retaining removed nodes.
  root.addEventListener('toggle', event => {
    if (event.target.matches('.fs-illustrated') && event.target.open && !$('fs-explanation')?.hasChildNodes()) void loadExplanation();
  }, { capture: true, signal: lifetime.signal });
  root.addEventListener('click', event => {
    const a = event.target.closest('a[data-figure-route]');
    if (a && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); go(a.getAttribute('href')); return; }
    const b = event.target.closest('button[data-action]'); if (!b || b.disabled) return;
    if (b.dataset.action === 'clear') { $('fs-search').value = ''; updateQuery(''); $('fs-search').focus(); }
    if (b.dataset.action === 'more') {
      const key = `${currentCategory}:${query}`, before = limits.get(key) || 18;
      limits.set(key, before + 18);
      while (limits.size > 30) limits.delete(limits.keys().next().value);
      renderResults(true); $('fs-grid').children[before]?.focus();
    }
    if (b.dataset.action === 'explanation') void loadExplanation(true);
    if (b.dataset.action === 'examples') void loadExamples();
    if (b.dataset.action === 'answer') {
      const index = Number(b.dataset.example), value = Number(b.dataset.answer), example = currentExamples[index];
      if (!example || answers.has(index)) return;
      answers.set(index, value);
      const correct = Number(example.correct);
      const feedback = $(`fs-answer-${index}`);
      feedback.textContent = value === correct ? `Corretto. La frase è ${correct ? 'vera' : 'falsa'}.` : `Da rivedere. La frase è ${correct ? 'vera' : 'falsa'}.`;
      feedback.dataset.result = value === correct ? 'correct' : 'review';
      b.parentElement.querySelectorAll('button').forEach(control => { control.disabled = true; control.setAttribute('aria-pressed', String(control === b)); });
    }
  }, { signal: lifetime.signal });
  function updateQuery(value) {
    query = value.slice(0, 100); renderResults();
    currentPath = figureStudyPath({ category: currentCategory, query });
    history.replaceState({ ...history.state, screen: 'studyFigures' }, '', currentPath);
  }
  root.addEventListener('input', event => {
    if (event.target.id === 'fs-search' && !event.isComposing) updateQuery(event.target.value);
  }, { signal: lifetime.signal });
  root.addEventListener('compositionend', event => { if (event.target.id === 'fs-search') updateQuery(event.target.value); }, { signal: lifetime.signal });
  return {
    render, suspend,
    back() { go(selectedFigure ? figureStudyPath({ category: currentCategory || selectedFigure.category, query }) : '/studia-quiz?view=figures'); },
    isRoot() { return !selectedFigure && !currentCategory && !query; },
    destroy() { suspend(); data.clear(); lifetime.abort(); }
  };
}
