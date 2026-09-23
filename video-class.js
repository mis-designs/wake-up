import { PAGE_SIZE, createVideoCatalogReader, createVideoFavorites, embedSource, selectVideoLessons, supportsVideoEmbed, videoPath } from './video-class-model.mjs?v=1';

const KIND = { teoria: 'Teoria', quiz: 'Quiz', misto: 'Teoria e quiz', parole: 'Parole', guide: 'Guida' };
const ASSETS = '/assets/video-class/';
const icon = (name, cls = '') => node('img', { src: `/icons/${name}`, alt: '', class: cls, width: 24, height: 24 });
function playIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const d of ['M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z', 'M9.5 8.96533C9.5 8.48805 9.5 8.24941 9.59974 8.11618C9.68666 8.00007 9.81971 7.92744 9.96438 7.9171C10.1304 7.90525 10.3311 8.03429 10.7326 8.29239L15.4532 11.3271C15.8016 11.551 15.9758 11.663 16.0359 11.8054C16.0885 11.9298 16.0885 12.0702 16.0359 12.1946C15.9758 12.337 15.8016 12.449 15.4532 12.6729L10.7326 15.7076C10.3311 15.9657 10.1304 16.0948 9.96438 16.0829C9.81971 16.0726 9.68666 15.9999 9.59974 15.8838C9.5 15.7506 9.5 15.512 9.5 15.0347V8.96533Z']) {
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '2'); svg.append(path);
  }
  return svg;
}
function node(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) el.append(child);
  return el;
}
const link = (label, url, cls = 'vc-button') => node('a', { href: url, class: cls }, label);
const button = (label, action, cls = 'vc-button') => node('button', { type: 'button', 'data-action': action, class: cls }, label);
function cover(lesson, large = false) {
  const sample = lesson.cover === 'road' ? 'road-basics.webp' : lesson.cover === 'danger' ? 'danger-signs.webp' : '';
  const box = node('span', { class: `vc-cover${sample ? ' vc-cover--sample' : ''}`, 'aria-hidden': 'true' });
  const img = node('img', { src: ASSETS + (sample || 'teacher.webp'), alt: '', loading: large ? 'eager' : 'lazy', decoding: 'async', width: sample ? 960 : 560, height: sample ? 540 : 700 });
  img.addEventListener('error', () => { img.hidden = true; box.classList.add('vc-cover--fallback'); }, { once: true });
  box.append(img);
  if (!sample) box.append(node('span', { class: 'vc-cover-type' }, KIND[lesson.kind] || 'Video', node('b', {}, /^\d+$/.test(lesson.group) ? lesson.group : lesson.group === 'parole' ? 'ABC' : 'APP')));
  if (lesson.minutes) box.append(node('span', { class: 'vc-duration' }, `${lesson.minutes} min`));
  return box;
}

export function createVideoClass({ root, request, identity, navigate, toast, header }) {
  const data = createVideoCatalogReader(request, identity);
  const lifetime = new AbortController();
  const embeddedVideo = supportsVideoEmbed(navigator.userAgent);
  let catalog, state = {}, favorites, favoriteScope = '', active = false, version = 0, count = PAGE_SIZE;
  let playerTimer = 0, iframe = null, currentUrl = '';
  const scrollPositions = new Map();
  function status(message) { const el = root.querySelector('#vc-status'); if (el) el.textContent = message; }
  function stopPlayer() { clearTimeout(playerTimer); playerTimer = 0; iframe?.remove(); iframe = null; }
  function saveScroll() {
    if (active && currentUrl) {
      const focusedLesson = document.activeElement?.closest('[data-lesson]')?.dataset.lesson;
      scrollPositions.delete(currentUrl); scrollPositions.set(currentUrl, { top: window.scrollY, count, focusedLesson });
      if (scrollPositions.size > 32) scrollPositions.delete(scrollPositions.keys().next().value);
    }
  }
  function suspend() { saveScroll(); active = false; version++; data.cancel(); stopPlayer(); }
  function clear() { suspend(); data.clear(); catalog = null; favorites = null; favoriteScope = ''; root.replaceChildren(); }
  function guardIdentity() {
    if (identity() === favoriteScope) return true;
    clear();
    root.append(node('div', { class: 'vc-empty', role: 'alert' }, node('h2', {}, 'Accedi di nuovo alle lezioni'), node('p', {}, 'La sessione è cambiata. I tuoi preferiti restano salvati per il tuo account.'), link('Torna alla Home', '/', 'vc-button vc-primary')));
    return false;
  }
  function savedIds() { return favorites?.values() || []; }
  function saveButton(lesson, label = false) {
    const saved = savedIds().includes(lesson.id);
    return node('button', { type: 'button', class: 'vc-save vc-button', 'data-save': lesson.id,
      'aria-pressed': saved, 'aria-label': `${saved ? 'Rimuovi dai preferiti' : 'Salva nei preferiti'}: ${lesson.title}` },
    icon(saved ? 'save_after.svg' : 'save_before.svg'), ...(label ? [node('span', {}, saved ? 'Salvato' : 'Salva')] : []));
  }
  function updateSavedButtons() {
    for (const el of root.querySelectorAll('[data-save]')) {
      const lesson = catalog.lessons.find(x => x.id === el.dataset.save);
      if (lesson) { const fresh = saveButton(lesson, !!el.querySelector('span')); el.replaceChildren(...fresh.childNodes); el.setAttribute('aria-pressed', fresh.getAttribute('aria-pressed')); el.setAttribute('aria-label', fresh.getAttribute('aria-label')); }
    }
    const total = root.querySelector('[data-favorite-count]'); if (total) total.textContent = String(savedIds().length);
  }
  function nav() {
    const saved = link('', videoPath({ saved: true }), 'vc-button vc-favorites');
    saved.append(icon('favorite_section_icon_heart.png'), 'Preferiti', node('span', { 'data-favorite-count': '' }, String(savedIds().length)));
    if (state.saved) saved.setAttribute('aria-current', 'page');
    return node('nav', { class: 'vc-nav', 'aria-label': 'Video Class' }, link('Studia', '/studia-quiz', 'vc-back-link'), link('Tutte le lezioni', videoPath(), 'vc-back-link'), saved);
  }
  function heading(title, subtitle) {
    return node('div', { class: 'vc-section-heading' }, node('div', {}, node('p', { class: 'vc-eyebrow' }, 'VIDEO CLASS'), node('h2', { id: 'vc-heading', tabindex: '-1' }, title), subtitle ? node('p', {}, subtitle) : null));
  }
  function tile(lesson) {
    const a = link('', videoPath({ ...state, lesson: lesson.id }), 'vc-lesson-link');
    a.dataset.lesson = lesson.id;
    a.append(cover(lesson), node('span', { class: 'vc-lesson-copy' }, node('span', { class: 'vc-eyebrow' }, `${/^\d+$/.test(lesson.group) ? `CAPITOLO ${lesson.group} · ` : ''}${KIND[lesson.kind]}`), node('strong', {}, lesson.title)));
    return node('article', { class: 'vc-lesson' }, a, saveButton(lesson));
  }
  function renderHome() {
    const first = catalog.lessons[0];
    const hero = node('div', { class: 'vc-hero' }, node('div', { class: 'vc-hero-copy' },
      node('p', { class: 'vc-eyebrow' }, 'LA TUA AULA, QUANDO VUOI'),
      node('h2', { id: 'vc-heading', tabindex: '-1' }, 'Guarda. Capisci.', node('br'), 'Poi mettiti alla prova.'),
      node('p', { lang: 'bn', class: 'vc-bangla-title' }, 'ভিডিও দেখে শিখুন, কুইজ দিয়ে অনুশীলন করুন।'),
      node('p', {}, 'Teoria, quiz spiegati e parole da imparare. Scegli il capitolo e segui le lezioni al tuo ritmo.'),
      node('div', { class: 'vc-facts' }, node('span', {}, '25 capitoli'), node('span', {}, `${catalog.lessons.length} video`)),
      link('Inizia dal capitolo 01', videoPath({ group: '01' }), 'vc-button vc-primary')),
      node('div', { class: 'vc-feature' }, link(cover(first, true), videoPath({ group: '01', lesson: first.id }), 'vc-feature-image'),
        node('div', { class: 'vc-feature-caption' }, node('div', {}, node('small', {}, 'CAPITOLO 01'), node('strong', {}, 'Strada e veicoli')), link('Apri la lezione', videoPath({ group: '01', lesson: first.id }), 'vc-button'))));
    const groups = node('div', { class: 'vc-groups' });
    for (const group of catalog.groups) {
      const total = catalog.lessons.filter(x => x.group === group.id).length;
      const a = link('', videoPath({ group: group.id }), 'vc-group');
      a.append(node('span', { class: 'vc-group-number' }, /^\d+$/.test(group.id) ? group.id : group.id === 'parole' ? 'ABC' : 'APP'),
        node('span', {}, node('strong', {}, group.title), node('small', {}, `${total} video`)), icon('next.png'));
      groups.append(a);
    }
    root.append(hero, heading('Scegli cosa studiare', 'Capitoli nell’ordine del documento studenti.'), groups);
  }
  function renderList() {
    const group = catalog.groups.find(x => x.id === state.group);
    const all = selectVideoLessons(catalog, state, savedIds());
    root.append(heading(state.saved ? 'Le tue lezioni preferite' : group?.title || 'Lezioni', state.saved ? 'I video che hai scelto di tenere a portata di mano.' : `${/^\d+$/.test(state.group) ? `Capitolo ${state.group} · ` : ''}${all.length} video`));
    if (state.saved) root.append(node('p', { class: 'vc-storage-note' }, 'I preferiti restano in questo browser o in questa app, per il tuo account.'));
    if (/^\d+$/.test(state.group) || state.saved) {
      const filters = node('nav', { class: 'vc-filters', 'aria-label': 'Tipo di lezione' });
      for (const [id, label] of [['','Tutte'],['teoria','Teoria'],['quiz','Quiz']]) {
        const a = link(label, videoPath({ ...state, lesson: '', kind: id }), 'vc-button');
        if (state.kind === id) a.setAttribute('aria-current', 'page'); filters.append(a);
      }
      root.append(filters);
    }
    if (!all.length) {
      root.append(node('div', { class: 'vc-empty' }, icon('favorite_section_icon_heart.png'), node('h3', {}, state.saved ? 'Tieni qui le lezioni da rivedere' : 'Nessun video in questo filtro'), node('p', {}, state.saved ? 'Tocca Salva su una lezione: la ritroverai in questa sezione.' : 'Prova a mostrare tutti i video del capitolo.'), link(state.saved ? 'Esplora le lezioni' : 'Mostra tutte', videoPath(state.saved ? {} : { group: state.group }), 'vc-button vc-primary')));
    } else {
      const grid = node('div', { class: 'vc-lessons' }, all.slice(0, count).map(tile)); root.append(grid);
      if (all.length > count) root.append(button(`Mostra altri video (${Math.min(count,all.length)} di ${all.length})`, 'more', 'vc-button vc-more'));
    }
    if (state.group === 'guide') {
      root.append(heading('Collegamenti utili', 'Si aprono sui rispettivi siti.'));
      for (const resource of catalog.resources) root.append(node('div', { class: 'vc-resource' }, external(resource.title, resource.url), node('p', {}, resource.description)));
    }
  }
  function external(label, url) { return node('a', { class: 'vc-button vc-external', href: url, target: '_blank', rel: 'noopener', 'aria-label': `${label} · apre un sito esterno` }, icon('link_interface_icon.svg'), label); }
  function renderLesson(lesson) {
    const group = catalog.groups.find(x => x.id === lesson.group);
    const stage = node('div', { class: 'vc-stage', id: 'vc-stage' });
    const play = button('', 'play', 'vc-play'); play.append(cover(lesson, true), node('span', { class: 'vc-play-label' }, playIcon(), lesson.provider !== 'youtube' ? 'Apri su Facebook' : embeddedVideo ? 'Guarda la lezione' : 'Guarda su YouTube'));
    // Do not create a frame, contact YouTube or imply playback before this action.
    stage.append(play);
    const information = node('aside', { class: 'vc-lesson-info' },
      node('p', { class: 'vc-eyebrow' }, /^\d+$/.test(lesson.group) ? `CAPITOLO ${lesson.group} · ${KIND[lesson.kind]}` : KIND[lesson.kind]),
      node('h2', { id: 'vc-heading', tabindex: '-1' }, lesson.title), node('p', { class: 'vc-topic' }, group.title),
      lesson.minutes ? node('p', {}, `Circa ${lesson.minutes} minuti · durata indicata nel documento`) : null,
      node('div', { class: 'vc-lesson-actions' }, saveButton(lesson, true), external(lesson.provider === 'youtube' ? 'Apri su YouTube' : 'Apri su Facebook', lesson.url)),
      node('p', { class: 'vc-provider-note' }, lesson.provider !== 'youtube' ? 'Questo video si guarda su Facebook. Puoi salvarlo qui insieme alle altre lezioni.' : embeddedVideo ? 'Premendo Guarda carichi il player YouTube. Se il video non parte qui, aprilo su YouTube.' : 'Questa versione dell’app apre la lezione su YouTube. Torna qui per scegliere il prossimo video.'),
      node('p', { id: 'vc-player-status', role: 'status' }),
      link('Tutte le lezioni del capitolo', videoPath({ group: lesson.group }), 'vc-back-link'));
    if (lesson.aliases.length) information.append(node('details', { class: 'vc-source-note' }, node('summary', {}, 'Riferimenti nel documento'), node('p', {}, `Lo stesso video compare anche come: ${lesson.aliases.join('; ')}.`)));
    let queueState = state.saved && !state.group ? state : { ...state, group: state.group || lesson.group };
    let queue = selectVideoLessons(catalog, queueState, savedIds());
    if (!queue.some(x => x.id === lesson.id)) { queueState = { group: lesson.group }; queue = selectVideoLessons(catalog, queueState); }
    const index = queue.findIndex(x => x.id === lesson.id);
    const rail = node('nav', { class: 'vc-rail', 'aria-label': 'Cambia lezione' });
    const track = node('div', { class: 'vc-track' });
    queue.forEach((item, i) => {
      const a = link('', videoPath({ ...queueState, lesson: item.id }), 'vc-track-item');
      a.append(node('span', { class: 'vc-track-number' }, String(i + 1).padStart(2,'0')), node('span', {}, item.title));
      if (item.id === lesson.id) a.setAttribute('aria-current', 'page'); track.append(a);
    });
    const previous = index > 0 ? link(icon('go-back.png'), videoPath({ ...queueState, lesson: queue[index - 1].id }), 'vc-button vc-step') : button(icon('go-back.png'), 'none', 'vc-button vc-step');
    const next = index < queue.length - 1 ? link(icon('next.png'), videoPath({ ...queueState, lesson: queue[index + 1].id }), 'vc-button vc-step') : button(icon('next.png'), 'none', 'vc-button vc-step');
    previous.setAttribute('aria-label','Lezione precedente'); next.setAttribute('aria-label','Lezione successiva');
    if (index === 0) previous.disabled = true; if (index === queue.length - 1) next.disabled = true;
    rail.append(node('div', { class: 'vc-rail-caption' }, node('strong', {}, 'Scegli la prossima'), node('span', {}, `${index + 1} / ${queue.length}`)), previous, track, next);
    root.append(node('div', { class: 'vc-watch' }, node('div', { class: 'vc-viewer' }, stage, rail), information));
    const selected = track.querySelector('[aria-current]');
    if (selected) track.scrollLeft = selected.offsetLeft - track.offsetLeft - track.clientWidth / 2 + selected.clientWidth / 2;
  }
  function paint() {
    stopPlayer(); root.replaceChildren(nav());
    if (state.lesson) {
      const lesson = catalog.lessons.find(x => x.id === state.lesson);
      if (lesson) renderLesson(lesson);
      else root.append(heading('Lezione non trovata', 'Scegli un video dal catalogo.'), link('Tutte le lezioni', videoPath(), 'vc-button vc-primary'));
    } else if (state.group || state.saved) renderList();
    else renderHome();
    root.append(node('p', { id: 'vc-status', class: 'sr-only', role: 'status' }));
    if (favorites && !favorites.durable) root.append(node('p', { class: 'vc-storage-note', role: 'status' }, 'Per ora i preferiti restano aperti in questa pagina. Il dispositivo non consente di salvarli.'));
  }
  async function render(url, { restore = false } = {}) {
    saveScroll(); stopPlayer(); active = true; const own = ++version;
    currentUrl = url.pathname + url.search;
    state = { group: url.searchParams.get('group') || '', saved: url.searchParams.get('saved') === '1', lesson: url.searchParams.get('lesson') || '', kind: url.searchParams.get('kind') || '' };
    count = restore ? scrollPositions.get(currentUrl)?.count || PAGE_SIZE : PAGE_SIZE;
    header('Video Class', 'Lezioni, quiz spiegati e parole'); document.title = 'MagicBook | Video Class';
    if (!catalog) root.replaceChildren(node('div', { class: 'vc-loading', role: 'status', 'aria-busy': 'true' }, node('span', { class: 'magic-loading-indicator__media' }, node('img', { class: 'magic-loading-indicator__image', src: '/icons/loading.gif', alt: '' })), node('p', {}, 'Apro le lezioni…')));
    try {
      catalog = await data.read();
      if (!active || own !== version) return;
      if (!favorites || favoriteScope !== identity()) {
        favoriteScope = identity(); let storage; try { storage = window.localStorage; } catch (_) { /* memory only */ }
        favorites = createVideoFavorites(storage, favoriteScope, new Set(catalog.lessons.map(x => x.id)));
      }
      paint();
      const selected = catalog.lessons.find(x => x.id === state.lesson);
      document.title = `MagicBook | Video Class${selected ? ` · ${selected.title}` : ''}`;
      const previousFocus = restore && scrollPositions.get(currentUrl)?.focusedLesson;
      const focusTarget = previousFocus && [...root.querySelectorAll('[data-lesson]')].find(el => el.dataset.lesson === previousFocus);
      (focusTarget || root.querySelector('#vc-heading'))?.focus({ preventScroll: true });
      window.scrollTo({ top: restore ? scrollPositions.get(currentUrl)?.top || 0 : 0, behavior: 'auto' });
    } catch (_) {
      if (!active || own !== version) return;
      catalog = null; stopPlayer();
      root.replaceChildren(nav(), node('div', { class: 'vc-empty', role: 'alert' }, node('h2', {}, 'Le lezioni non si sono caricate'), node('p', {}, 'Controlla la connessione e riprova. I tuoi preferiti non vengono cancellati.'), button('Riprova', 'retry', 'vc-button vc-primary')));
    }
  }
  function play() {
    if (!guardIdentity()) return;
    const lesson = catalog.lessons.find(x => x.id === state.lesson);
    if (!lesson) return;
    if (lesson.provider !== 'youtube' || !embeddedVideo) { window.open(lesson.url, '_blank', 'noopener'); return; }
    stopPlayer();
    iframe = node('iframe', { src: embedSource(lesson, location.origin), title: `${lesson.title} · YouTube`, allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin' });
    const own = iframe;
    const message = root.querySelector('#vc-player-status');
    const fail = () => { if (iframe === own && message) message.textContent = 'Il player non risponde. Puoi usare Apri su YouTube.'; };
    own.addEventListener('error', fail, { once: true });
    own.addEventListener('load', () => { if (iframe === own) { clearTimeout(playerTimer); if (message) message.textContent = ''; } }, { once: true });
    playerTimer = setTimeout(fail, 15000);
    root.querySelector('#vc-stage').replaceChildren(own);
    own.focus();
  }
  root.addEventListener('click', event => {
    const save = event.target.closest('[data-save]');
    if (save && guardIdentity()) {
      const position = [...root.querySelectorAll('[data-save]')].indexOf(save);
      favorites.toggle(save.dataset.save);
      if (state.saved && !state.lesson) {
        const top = window.scrollY;
        paint();
        const buttons = root.querySelectorAll('[data-save]');
        (buttons[Math.min(position, buttons.length - 1)] || root.querySelector('#vc-heading'))?.focus({ preventScroll: true });
        window.scrollTo({ top, behavior: 'auto' });
      } else updateSavedButtons();
      if (!favorites.durable) {
        let note = root.querySelector('.vc-storage-note');
        if (!note) { note = node('p', { class: 'vc-storage-note', role: 'status' }); root.append(note); }
        note.textContent = 'Il preferito resta in questa pagina: il dispositivo non consente di salvarlo.';
      }
      toast(favorites.durable ? savedIds().includes(save.dataset.save) ? 'Lezione salvata nei preferiti.' : 'Lezione rimossa dai preferiti.' : 'Preferito disponibile solo in questa pagina.');
      return;
    }
    const a = event.target.closest('a');
    if (a && !a.target && new URL(a.href).pathname === '/studia-quiz' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); saveScroll();
      navigate(a.getAttribute('href')); return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'play') play();
    if (action === 'retry') void render(new URL(location.href));
    if (action === 'more') {
      const previous = count; count += PAGE_SIZE; paint();
      root.querySelectorAll('.vc-lesson-link')[previous]?.focus({ preventScroll: true }); status('Altri video disponibili.');
    }
  }, { signal: lifetime.signal });
  window.addEventListener('storage', event => {
    if (!active) return;
    if (!guardIdentity()) return;
    if (event.key === favorites?.key) { favorites.read(); if (state.saved && !state.lesson) paint(); else updateSavedButtons(); }
  }, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (!guardIdentity()) return;
    if (document.hidden && iframe) { stopPlayer(); paint(); } // no background playback or automatic resume
  }, { signal: lifetime.signal });
  return { render, suspend, destroy() { clear(); lifetime.abort(); },
    back() {
      if (state.lesson) {
        navigate(videoPath({ ...state, lesson: '' }), { restore: true });
      } else if (state.group || state.saved) navigate(videoPath());
      else navigate('/studia-quiz');
    }
  };
}
