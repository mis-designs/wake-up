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
    book.after(bank);
    const launcher = element('button', '', 'android-home-quiz-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-haspopup', 'dialog');
    const label = element('span', 'Quiz');
    const bangla = element('span', 'কুইজ');
    bangla.lang = 'bn';
    launcher.append(icon('/icons/do_quiz.svg'), label, bangla);
    launcher.onclick = () => openQuiz(launcher, originals);
    const actions = element('div', '', 'android-home-original-actions');
    actions.hidden = true;
    actions.append(...originals);
    learning.replaceChildren(launcher, actions);
    const tools = home.querySelector('.vivid-tools');
    home.querySelector('.vivid-video')?.after(tools);
  }
  function update() {
    frame = 0;
    observer.disconnect();
    document.querySelectorAll('.native-home.vivid-home').forEach(refine);
    document.querySelectorAll('.native-dock .vivid-dock-home').forEach(button => {
      if (button.dataset.androidHomeIcon) return;
      button.dataset.androidHomeIcon = 'true';
      button.replaceChildren(icon('/icons/native-home-outline.svg?v=1'), element('span', 'Home'));
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
