(() => {
  const initPrivacyNavigation = () => {
    const links = [...document.querySelectorAll('.privacy-index a[href^="#"]')];
    const sections = links
      .map(link => document.getElementById(link.getAttribute('href').slice(1)))
      .filter(Boolean);

    if (!links.length || !sections.length) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setActive = id => {
      links.forEach(link => {
        const isActive = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', isActive);
        if (isActive) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };

    const scrollToSection = (section, { updateUrl = true, smooth = true, focus = true } = {}) => {
      if (!section) return;
      setActive(section.id);
      if (updateUrl && window.location.hash !== `#${section.id}`) {
        window.history.pushState({ privacySection: section.id }, '', `#${section.id}`);
      }
      section.setAttribute('tabindex', '-1');
      section.scrollIntoView({ behavior: smooth && !reducedMotion ? 'smooth' : 'auto', block: 'start' });
      if (focus) {
        window.setTimeout(() => section.focus({ preventScroll: true }), smooth && !reducedMotion ? 350 : 0);
      }
    };

    links.forEach(link => {
      link.addEventListener('click', event => {
        const target = document.getElementById(link.getAttribute('href').slice(1));
        if (!target) return;
        event.preventDefault();
        scrollToSection(target);
      });
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      }, { rootMargin: '-112px 0px -68% 0px', threshold: 0 });
      sections.forEach(section => observer.observe(section));
    }

    const applyHash = shouldScroll => {
      const id = window.location.hash.slice(1);
      const target = sections.find(section => section.id === id);
      if (target) scrollToSection(target, { updateUrl: false, smooth: false, focus: shouldScroll });
      else setActive(sections[0].id);
    };

    if (window.location.hash) window.requestAnimationFrame(() => applyHash(true));
    else setActive(sections[0].id);
    window.addEventListener('hashchange', () => applyHash(true));
    window.addEventListener('popstate', () => applyHash(true));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPrivacyNavigation, { once: true });
  else initPrivacyNavigation();
})();
