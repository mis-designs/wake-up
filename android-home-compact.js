(() => {
  'use strict';
  if (!document.documentElement.classList.contains('android-webview')) return;
  const root = document.documentElement;
  let frame = 0;
  let popup = null;
  let observer;

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function icon(source) {
    const image = element('img');
    image.src = source;
    image.alt = '';
    image.width = image.height = 24;
    image.setAttribute('aria-hidden', 'true');
    return image;
  }
  // One set of line drawings for the Android study actions.
  const drawings = {
    dictionary: 'M3 5c3-1 6-.5 9 1.5C15 4.5 18 4 21 5v14c-3-1-6-.5-9 1.5C9 18.5 6 18 3 19z M12 6.5v14',
    statistics: 'M3 20h18 M5 16v-4 M11 16V8 M17 16V4',
    errors: 'M4 8h9a6 6 0 0 1 0 12h-3 M8 3.5 3.5 8 8 12.5',
    video: 'M8 5.5 18 12 8 18.5z'
  };
  function artwork(viewBox) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }
  function drawing(name) {
    const svg = artwork('0 0 24 24');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', drawings[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.65');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.append(path);
    return svg;
  }
  function quizPaper() {
    const svg = artwork('0 0 90 70');
    svg.classList.add('quiz-paper');
    const names = [
      ['M12 17 59 7l10 46-47 10z', '#dfab52', '#bb842e'],
      ['M20 9 68 6l3 48-48 3z', '#fff7de', '#a6742d'],
      ['M29 21l3 3 5-7m7 3 15-1m-29 14 3 3 5-7m7 2 15-1m-29 14 28-2', 'none', '#865b26'],
      ['M46 51l2-8 25-28 5 5-25 28z', '#7c4d85', '#55385e'],
      ['M48 43l5 5-7 3z', '#fff1cf', '#55385e']
    ];
    const paths = names.map(([d, fill, stroke]) => {
      const line = document.createElementNS(svg.namespaceURI, 'path');
      Object.entries({d, fill, stroke, 'stroke-width':1.6, 'stroke-linecap':'round', 'stroke-linejoin':'round'})
        .forEach(([key, value]) => line.setAttribute(key, value));
      return line;
    });
    const pencil = document.createElementNS(svg.namespaceURI, 'g');
    pencil.classList.add('quiz-pencil');
    pencil.append(...paths.slice(3));
    svg.append(...paths.slice(0, 3), pencil);
    return svg;
  }
  function finishPopup({ restoreFocus = true, launch = null } = {}) {
    if (!popup) return;
    const current = popup;
    popup = null;
    current.unregister();
    current.dispose({ restoreFocus: false });
    // The native shell restores its inert state in a MutationObserver after dismissal.
    requestAnimationFrame(() => {
      if (root.dataset.nativeStudyScreen !== 'home') return;
      if (launch?.isConnected && !launch.closest('[inert]')) launch.click();
      else if (restoreFocus && current.launcher.isConnected && !current.launcher.closest('[inert]')) current.launcher.focus({ preventScroll: true });
    });
  }
  function dismissPopup(launch = null) {
    if (!popup || popup.closing) return;
    popup.closing = true;
    popup.launch = launch;
    popup.choices.forEach(button => { button.disabled = true; });
    if (popup.history && history.state?.androidHomeQuiz === popup.key) history.back();
    else finishPopup({ restoreFocus: !launch, launch });
  }
  function openQuiz(launcher, originals) {
    if (popup || !window.MagicBookPopup || root.dataset.nativeStudyScreen !== 'home') return;
    if (root.hasAttribute('data-app-transition') || launcher.closest('[inert]')) return;
    const overlay = element('div', '', 'android-home-quiz-overlay');
    const panel = element('section', '', 'android-home-quiz-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'androidHomeQuizTitle');
    const heading = element('div', '', 'android-home-quiz-heading');
    const title = element('h2', 'Quiz');
    title.id = 'androidHomeQuizTitle';
    const close = element('button', 'Chiudi', 'android-home-quiz-close');
    close.type = 'button';
    close.onclick = () => dismissPopup();
    heading.append(title, close);
    const choices = [
      ['Fai il quiz', 'কুইজ করুন', '/icons/do_quiz.svg', originals[0]],
      ['Studia i quiz', 'কুইজ শিখুন', '/icons/study_quiz.svg', originals[1]]
    ].map(([label, bangla, source, original]) => {
      const button = element('button', '', 'android-home-quiz-choice');
      button.type = 'button';
      const copy = element('span');
      const bn = element('span', bangla);
      bn.lang = 'bn';
      copy.append(element('strong', label), bn);
      button.append(icon(source), copy);
      button.onclick = () => dismissPopup(original);
      return button;
    });
    panel.append(heading, ...choices);
    overlay.append(panel);
    document.body.append(overlay);
    const key = Date.now().toString(36);
    const dispose = window.MagicBookPopup.mount(overlay, {
      focusable: () => [...choices, close],
      returnFocus: launcher,
      bodyClass: 'android-home-quiz-open',
      onDismiss: () => dismissPopup(),
      initialFocus: choices[0]
    });
    const unregister = window.MagicBookPopup.registerHistoryLayer(() => {
      if (!popup) return false;
      const launch = popup.launch;
      finishPopup({ restoreFocus: !launch, launch });
      return true;
    });
    popup = { dispose, unregister, choices, launcher, key, closing: false, history: false, launch: null };
    try {
      history.pushState({ ...history.state, androidHomeQuiz: key }, '');
      popup.history = true;
    } catch (_) { /* Escape and the visible close button remain available. */ }
  }
  function refine(home) {
    if (home.dataset.androidHomeCompact) return;
    const book = home.querySelector('.native-book');
    const bank = home.querySelector('.qb-entry');
    const learning = home.querySelector('.vivid-learning');
    const originals = learning && [learning.querySelector('[data-native-action="quiz"]'), learning.querySelector('[data-native-action="study"]')];
    if (!book || !bank || !originals?.every(Boolean)) return;
    home.dataset.androidHomeCompact = 'true';
    home.classList.add('android-home-compact');
    home.querySelector('.vivid-sponsor')?.remove();
    const wordmark = home.querySelector('.vivid-wordmark');
    if (wordmark) wordmark.textContent = 'Magic Book';
    book.after(bank);
    const bookCopy = book.querySelector('.vivid-book-copy');
    if (bookCopy) {
      bookCopy.querySelector('strong').textContent = 'Scegli il capitolo';
      bookCopy.querySelector('small')?.remove();
    }
    const launcher = element('button', '', 'android-home-quiz-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-haspopup', 'dialog');
    const label = element('span', 'Quiz');
    const bangla = element('span', 'কুইজ');
    bangla.lang = 'bn';
    launcher.append(quizPaper(), label, bangla);
    launcher.onclick = () => openQuiz(launcher, originals);
    const actions = element('div', '', 'android-home-original-actions');
    actions.hidden = true;
    actions.append(...originals);
    learning.replaceChildren(launcher, actions);
    const tools = home.querySelector('.vivid-tools');
    const lesson = home.querySelector('.vivid-video');
    if (lesson && tools) {
      const pair = element('div', '', 'android-study-pair');
      learning.before(pair);
      pair.append(learning, lesson);
      lesson.prepend(drawing('video'));
      pair.after(tools);
      tools.querySelectorAll('button[data-native-action]').forEach(button => {
        const name = button.dataset.nativeAction;
        if (drawings[name]) button.querySelector('img')?.replaceWith(drawing(name));
      });
    }
  }
  function update() {
    frame = 0;
    observer.disconnect();
    document.querySelectorAll('.native-home.vivid-home').forEach(refine);
    document.querySelectorAll('.native-dock .vivid-dock-home').forEach(button => {
      if (button.dataset.androidHomeIcon) return;
      button.dataset.androidHomeIcon = 'true';
      button.replaceChildren(icon('/icons/native-home-outline.svg?v=1'));
      button.setAttribute('aria-label', 'Torna alla Home');
    });
    if (popup && root.dataset.nativeStudyScreen !== 'home') finishPopup({ restoreFocus: false });
    observe();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function observe() {
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-native-study-screen'] });
  }
  observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' || [...record.addedNodes].some(node => node.nodeType === 1))) schedule();
  });
  observe();
  schedule();
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    finishPopup({ restoreFocus: false });
  });
  window.addEventListener('pageshow', () => { observe(); schedule(); });
})();
