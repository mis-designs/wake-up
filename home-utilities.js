// Browser Home presentation adapter. Reparent original controls; never copy auth/actions.
export function mountHomeUtilities(home) {
  const row = home?.querySelector('.member-utilities');
  const profile = document.getElementById('profileBtn');
  const panel = document.getElementById('profilePanel');
  const whatsapp = document.getElementById('whatsappBtn');
  const admin = document.getElementById('adminEntryBtn');
  if (!row || !profile || !panel || !whatsapp) return;
  const root = document.documentElement;
  const anchors = new Map();
  let mounted = false, stopped = false, frame = 0;
  const panelOpen = () => mounted && !panel.classList.contains('hidden');
  function closePanel(restoreFocus = false) {
    if (!mounted) return;
    panel.classList.add('hidden');
    profile.setAttribute('aria-expanded', 'false');
    if (restoreFocus) profile.focus({ preventScroll: true });
  }
  function positionPanel() {
    frame = 0;
    if (!panelOpen()) return;
    const view = window.visualViewport;
    const left = view?.offsetLeft || 0, top = view?.offsetTop || 0;
    const width = view?.width || innerWidth, height = view?.height || innerHeight;
    const scale = row.getBoundingClientRect().width / row.offsetWidth || 1;
    panel.style.setProperty('--member-panel-max-width', `${Math.max(44, (width - 24) / scale)}px`);
    panel.style.setProperty('--member-panel-max-height', `${Math.max(44, (height - 24) / scale)}px`);
    const target = profile.getBoundingClientRect(), box = panel.getBoundingClientRect();
    const x = Math.max(left + 12, Math.min(target.left, left + width - box.width - 12));
    const preferredY = target.top - box.height - 12 >= top + 12 ? target.top - box.height - 12 : target.bottom + 12;
    const y = Math.max(top + 12, Math.min(preferredY, top + height - box.height - 12));
    panel.style.setProperty('--member-panel-x', `${x / scale}px`);
    panel.style.setProperty('--member-panel-y', `${y / scale}px`);
  }
  function schedulePanel() {
    cancelAnimationFrame(frame);
    frame = panelOpen() ? requestAnimationFrame(positionPanel) : 0;
  }
  function sync() {
    const active = !stopped && !root.classList.contains('android-webview') && !home.classList.contains('hidden');
    if (active === mounted) {
      if (home.inert) closePanel();
      return;
    }
    if (active) {
      for (const node of [profile, panel, whatsapp, admin].filter(Boolean)) {
        const anchor = document.createComment(`Home utility original ${node.id}`);
        node.before(anchor); anchors.set(node, anchor);
      }
      row.querySelector('.member-profile-slot').append(profile, panel);
      if (admin) row.querySelector('.member-profile-slot').append(admin);
      row.querySelector('.member-whatsapp-slot').append(whatsapp);
      profile.setAttribute('aria-controls', 'profilePanel');
      mounted = true;
    } else {
      closePanel();
      cancelAnimationFrame(frame); frame = 0;
      anchors.forEach((anchor, node) => { anchor.after(node); anchor.remove(); });
      anchors.clear();
      for (const name of ['--member-panel-x', '--member-panel-y', '--member-panel-max-width', '--member-panel-max-height']) panel.style.removeProperty(name);
      mounted = false;
    }
    window.syncAppUtilityLayout?.();
  }
  const observer = new MutationObserver(sync);
  const panelObserver = new MutationObserver(schedulePanel);
  function observe() {
    observer.observe(home, { attributes: true, attributeFilter: ['class', 'inert'] });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !panelOpen()) return;
    event.preventDefault(); event.stopPropagation(); closePanel(true);
  });
  document.addEventListener('focusin', event => {
    if (panelOpen() && event.target !== profile && !panel.contains(event.target)) closePanel();
  });
  window.addEventListener('resize', schedulePanel);
  window.addEventListener('scroll', schedulePanel, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', schedulePanel);
  window.visualViewport?.addEventListener('scroll', schedulePanel);
  window.addEventListener('pagehide', () => {
    stopped = true; observer.disconnect(); panelObserver.disconnect(); sync();
  });
  window.addEventListener('pageshow', () => { stopped = false; observe(); sync(); });
  observe(); sync();
}
