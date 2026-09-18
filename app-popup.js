(function exposeAppPopup(root) {
  'use strict';
  const historyLayers = [];
  // This classic script runs BEFORE the route scripts. At the window target,
  // capture:true alone does not precede already-registered popstate handlers.
  root.addEventListener('popstate', event => {
    for (const handler of [...historyLayers].reverse()) {
      if (handler(event)) { event.stopImmediatePropagation(); break; }
    }
  });
  function registerHistoryLayer(handler) {
    historyLayers.push(handler);
    return () => {
      const index = historyLayers.indexOf(handler);
      if (index >= 0) historyLayers.splice(index, 1);
    };
  }
  // Shared authored-modal owner, extracted from the existing Home/login popup.
  // It preserves prior inert state so a detail can sit above another dialog.
  function mount(overlay, { focusable, returnFocus, bodyClass, onDismiss, initialFocus } = {}) {
    const backgroundState = [];
    let closed = false;
    const controls = () => Array.from(typeof focusable === 'function' ? focusable() : focusable || [])
      .filter(element => !element.disabled && element.getClientRects().length);
    function isolate(parent) {
      Array.from(parent.children).forEach(element => {
        if (!(element instanceof HTMLElement) || element === overlay) return;
        if (element.contains(overlay)) { isolate(element); return; }
        backgroundState.push({ element, inert: element.inert });
        element.inert = true;
      });
    }
    function onClick(event) {
      if (event.target === overlay) onDismiss();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); onDismiss();
      } else if (event.key === 'Tab') {
        const list = controls(), first = list[0], last = list.at(-1);
        const active = document.activeElement;
        if (!first) { event.preventDefault(); overlay.focus({ preventScroll: true }); }
        else if (event.shiftKey && (active === first || !list.includes(active))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (active === last || !list.includes(active))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('keydown', onKeyDown);
    isolate(document.body);
    document.body.classList.add(bodyClass);
    const frame = root.requestAnimationFrame(() => {
      if (!closed) (initialFocus || controls()[0] || overlay).focus({ preventScroll: true });
    });
    return ({ restoreFocus = true } = {}) => {
      if (closed) return;
      closed = true;
      root.cancelAnimationFrame(frame);
      overlay.removeEventListener('click', onClick);
      overlay.removeEventListener('keydown', onKeyDown);
      backgroundState.forEach(({ element, inert }) => {
        if (element.isConnected) element.inert = inert;
      });
      document.body.classList.remove(bodyClass);
      overlay.remove();
      if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected && !returnFocus.closest('[inert]')) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }
  root.MagicBookPopup = Object.freeze({ mount, registerHistoryLayer });
})(window);
