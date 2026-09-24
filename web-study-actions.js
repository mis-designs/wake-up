(function webStudyActions(root) {
  'use strict';
  const doc = root.document;
  if (doc.documentElement.classList.contains('android-webview')) return;

  const overlay = doc.getElementById('quizModeOverlay');
  const examBody = doc.querySelector('#examModeOverlay .qms-body');
  const examCards = [...examBody.children];
  const heading = overlay.querySelector('.qms-title');
  heading.id = 'webQuizOptionsTitle';
  heading.tabIndex = -1;
  heading.textContent = 'Quiz';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', heading.id);

  // Reuse the original Exam controls/listeners, never duplicate the quiz engine.
  const exam = doc.createElement('details');
  exam.className = 'web-exam-options';
  const summary = doc.createElement('summary');
  const title = doc.createElement('strong');
  title.textContent = 'Exam';
  const subtitle = doc.createElement('span');
  subtitle.textContent = '80 quiz, 30 quiz e PDF';
  summary.append(title, subtitle);
  const content = doc.createElement('div');
  content.className = 'web-exam-content';
  exam.append(summary, content);
  overlay.querySelector('.qms-body').prepend(exam);
  summary.addEventListener('click', event => {
    if (!trialGuestMode) return;
    event.preventDefault();
    close({ forNavigation: true });
    openTrialPaywall('Exam');
  });

  let unmount = null, returnFocus = null, baseState, baseUrl, closing = false, restoring = false;
  const historyKey = 'magicBookQuizOptions';

  function reset({ restoreFocus = false } = {}) {
    if (!unmount) return false;
    const parent = overlay.parentNode, next = overlay.nextSibling;
    unmount({ restoreFocus });
    // The shared modal owner removes its node. Retain these canonical controls.
    parent.insertBefore(overlay, next);
    unmount = null;
    overlay.classList.add('hidden');
    overlay.classList.remove('qms-visible');
    examBody.append(...examCards);
    closing = false;
    return true;
  }

  function open() {
    if (unmount) return;
    closing = false;
    if (!restoring) {
      returnFocus = doc.activeElement;
      baseState = root.history.state;
      baseUrl = root.location.href;
    }
    content.append(...examCards);
    exam.open = false;
    subtitle.textContent = trialGuestMode ? 'Richiede accesso completo' : '80 quiz, 30 quiz e PDF';
    if (!restoring) root.history.pushState({ ...baseState, [historyKey]: true }, '', baseUrl);
    unmount = root.MagicBookPopup.mount(overlay, {
      bodyClass: 'qms-open', returnFocus, initialFocus: heading,
      focusable: () => overlay.querySelectorAll('button, summary, a[href]'),
      onDismiss: () => close()
    });
    overlay.querySelector('.qms-body').scrollTop = 0;
  }

  function close({ forNavigation = false } = {}) {
    if (!unmount) return false;
    if (forNavigation) {
      root.history.replaceState(baseState, '', baseUrl);
      reset();
      currentScreen = baseState?.screen || 'chapters';
    } else if (!closing) {
      closing = true;
      appActionGate.cancel();
      root.history.back();
    }
    return true;
  }

  root.MagicBookPopup.registerHistoryLayer(event => {
    if (!unmount) {
      if (!event.state?.[historyKey] || root.location.href !== baseUrl || !(trialGuestMode || readStoredSession())) return false;
      appActionGate.cancel();
      restoring = true;
      try { openQuizModeScreen(); } finally { restoring = false; }
      return true;
    }
    const samePage = root.location.href === baseUrl;
    appActionGate.cancel();
    reset({ restoreFocus: samePage });
    if (samePage) currentScreen = baseState?.screen || 'chapters';
    return samePage;
  });
  root.addEventListener('pagehide', () => reset());

  for (const [id, view] of [['webStudyButton', 'chapters'], ['webClassButton', 'videos']]) {
    doc.getElementById(id).addEventListener('click', event => {
      // A trial cannot bypass the existing study/video entitlement via a new link.
      if (trialGuestMode) {
        event.preventDefault();
        if (view === 'videos') { openTrialPaywall('Pial sir class'); return; }
        scheduleExclusiveAppNavigation('web-study-trial', null, () => { root.location.href = '/studia-quiz/prova-gratis'; }, 0);
        return;
      }
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      scheduleExclusiveAppNavigation(`web-study-${view}`, null, () => { root.location.href = `/studia-quiz?view=${view}`; }, 0);
    });
  }

  // Supplied GIFs get one short viewing window; controls and labels never move.
  const classButton = doc.getElementById('webClassButton');
  const icon = classButton.querySelector('.lesson-class-icon img');
  const badge = classButton.querySelector('.lesson-new img');
  const reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0, seen = false;
  function settle() {
    root.clearTimeout(timer); timer = 0;
    classButton.classList.remove('is-introducing');
    icon.src = 'assets/easy-video-still.png';
    badge.removeAttribute('src');
  }
  badge.addEventListener('error', settle);
  icon.addEventListener('error', () => { icon.style.visibility = 'hidden'; });
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || doc.hidden || reduced.matches || doc.documentElement.hasAttribute('data-native-motion-paused')) { settle(); return; }
    if (seen) return;
    seen = true;
    icon.src = 'icons/easy_video.gif';
    badge.src = 'assets/new-class.gif';
    classButton.classList.add('is-introducing');
    timer = root.setTimeout(settle, 4000);
  });
  observer.observe(classButton);
  reduced.addEventListener('change', settle);
  new MutationObserver(() => {
    if (doc.documentElement.hasAttribute('data-native-motion-paused')) settle();
  }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-native-motion-paused'] });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) settle(); });
  root.addEventListener('pagehide', () => { settle(); observer.disconnect(); });
  root.addEventListener('pageshow', event => { if (event.persisted) observer.observe(classButton); });
  root.MagicBookWebStudyActions = Object.freeze({ open, close, reset });
})(window);
