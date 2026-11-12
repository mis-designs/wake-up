(function (root) {
  'use strict';
  const timers = new WeakMap();
  let noticeTimer;
  // Presentation of the latest server-issued session only. Never grants API permissions.
  function status(token, now = Date.now()) {
    try {
      const parts = String(token || '').split('.');
      if (![2, 3].includes(parts.length) || !parts.at(-1)) return { label: '' };
      const encoded = parts[parts.length === 2 ? 0 : 1].replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(atob(encoded));
      const expiry = Number(data.exp) * (parts.length === 3 ? 1000 : 1);
      if (data.role !== 'admin' || !Number.isFinite(expiry) || expiry <= now) return { label: '' };
      const master = Number.isSafeInteger(data.masterAdminUntil) && data.masterAdminUntil > now
        && /^[a-f0-9]{64}$/.test(data.masterAdminRevision || '');
      return { label: master ? 'Master admin' : 'Admin', master, expires: master ? Math.min(expiry, data.masterAdminUntil) : expiry };
    } catch (_) { return { label: '' }; }
  }
  function render(element, token) {
    if (!element) return;
    clearTimeout(timers.get(element));
    const value = status(token);
    element.textContent = value.label;
    element.hidden = !value.label;
    element.dataset.master = String(value.master === true);
    if (value.expires) timers.set(element, setTimeout(() => render(element, token), Math.min(value.expires - Date.now() + 20, 2147483647)));
  }
  function announce(token, notify) {
    const value = status(token);
    if (!value.label) return;
    const message = value.master ? 'Accesso come Master admin confermato.' : 'Accesso come Admin confermato.';
    if (notify) { notify(message); return; }
    let element = document.getElementById('accountLoginStatus');
    if (!element) {
      element = document.createElement('div'); element.id = 'accountLoginStatus';
      element.className = 'account-login-status'; element.setAttribute('role', 'status'); element.setAttribute('aria-live', 'polite');
      document.body.append(element);
    }
    clearTimeout(noticeTimer); element.textContent = message; element.hidden = false;
    noticeTimer = setTimeout(() => { element.hidden = true; }, 6000);
  }
  root.AccountRole = Object.freeze({ status, render, announce });
})(window);
