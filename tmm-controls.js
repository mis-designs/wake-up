(() => {
  'use strict';
  const mounted = new WeakMap();
  let sequence = 0;
  let opened;

  class TmmPicker extends HTMLElement {
    static attach(select, name) {
      if (mounted.has(select)) return mounted.get(select);
      const picker = document.createElement('tmm-picker');
      const label = select.closest('label');
      select.before(picker);
      if (label) label.after(select);
      const id = 'tmm-picker-' + ++sequence;
      picker.select = select;
      picker.button = document.createElement('button');
      picker.button.type = 'button';
      picker.button.id = id;
      picker.button.className = 'tmm-picker-trigger';
      picker.button.setAttribute('role', 'combobox');
      picker.button.setAttribute('aria-label', name);
      picker.button.setAttribute('aria-haspopup', 'listbox');
      picker.button.setAttribute('aria-expanded', 'false');
      picker.button.setAttribute('aria-controls', id + '-list');
      if (label) label.htmlFor = id;
      const value = document.createElement('span');
      picker.button.append(value);
      picker.list = document.createElement('div');
      picker.list.id = id + '-list';
      picker.list.className = 'tmm-picker-list';
      picker.list.setAttribute('role', 'listbox');
      picker.list.setAttribute('aria-label', name);
      picker.list.setAttribute('popover', 'manual');
      picker.list.hidden = true;
      picker.append(picker.button, picker.list);
      select.classList.add('tmm-picker-model');
      select.tabIndex = -1;
      select.setAttribute('inert', '');
      select.setAttribute('aria-hidden','true');
      mounted.set(select, picker);

      picker.button.addEventListener('click', () => opened === picker ? picker.close() : picker.open());
      picker.button.addEventListener('keydown', event => picker.onKey(event));
      picker.button.addEventListener('blur', () => picker.close());
      // Keep focus on the combobox while a pointer selects from its list.
      picker.list.addEventListener('mousedown', event => event.preventDefault());
      picker.list.addEventListener('click', event => {
        event.preventDefault();
        const row = event.target.closest('[role=option]');
        if (row && opened === picker) picker.choose(Number(row.dataset.index));
      });
      select.addEventListener('change', () => picker.refresh());
      picker.observer = new MutationObserver(() => {
        picker.refresh();
        if (opened === picker) picker.draw();
      });
      picker.connectedCallback();
      picker.refresh();
      return picker;
    }

    connectedCallback() {
      this.observer?.observe(this.select, {subtree:true, childList:true, characterData:true,
        attributes:true, attributeFilter:['disabled','selected','label','hidden']});
    }
    disconnectedCallback() {
      this.close();
      this.observer?.disconnect();
    }
    static refresh(select) { mounted.get(select)?.refresh(); }
    refresh() {
      const {button, select} = this;
      const text = select.selectedOptions[0]?.label || '';
      button.firstChild.textContent = text;
      button.title = text;
      button.disabled = select.disabled || !select.options.length;
      if (button.disabled || select.hidden) this.close();
      this.hidden = select.hidden;
    }
    draw() {
      this.list.replaceChildren();
      this.rows = [];
      let group;
      let container;
      for (const option of this.select.options) {
        const parent = option.parentElement;
        if (option.hidden || parent.hidden) continue;
        if (parent !== group) {
          group = parent;
          container = this.list;
          if (group.tagName === 'OPTGROUP') {
            container = document.createElement('div');
            container.setAttribute('role','group');
            container.setAttribute('aria-label',group.label);
            const heading = document.createElement('span');
            heading.className = 'tmm-picker-heading';
            heading.textContent = group.label;
            container.append(heading);
            this.list.append(container);
          }
        }
        const row = document.createElement('div');
        row.setAttribute('role','option');
        row.id = this.list.id + '-' + option.index;
        row.dataset.index = option.index;
        row.textContent = option.label;
        row.setAttribute('aria-selected',String(option.selected));
        if (option.disabled || group.disabled) row.setAttribute('aria-disabled','true');
        else this.rows.push(row);
        container.append(row);
      }
      this.mark(this.rows.find(row => Number(row.dataset.index) === this.select.selectedIndex) || this.rows[0]);
    }
    mark(row) {
      this.active?.classList.remove('is-active');
      this.active = row;
      if (!row) { this.button.removeAttribute('aria-activedescendant'); return; }
      row.classList.add('is-active');
      this.button.setAttribute('aria-activedescendant',row.id);
      // Scroll only the choices, never the lesson behind them.
      const delta = row.getBoundingClientRect(), bounds = this.list.getBoundingClientRect();
      if (delta.top < bounds.top) this.list.scrollTop += delta.top - bounds.top;
      else if (delta.bottom > bounds.bottom) this.list.scrollTop += delta.bottom - bounds.bottom;
    }
    position() {
      const rect = this.button.getBoundingClientRect(), style = this.list.style;
      const width = document.documentElement.clientWidth, height = window.innerHeight, gap = 6;
      if (!rect.width || rect.bottom < 0 || rect.top > height) { this.close(); return; }
      const below = height - rect.bottom - gap, above = rect.top - gap;
      const upward = below < 200 && above > below;
      style.width = Math.min(rect.width, width - 16) + 'px';
      style.left = Math.max(8,Math.min(rect.left,width - this.list.offsetWidth - 8)) + 'px';
      style.maxHeight = Math.max(44,Math.min(340,(upward ? above : below) - 8)) + 'px';
      style.top = upward ? 'auto' : rect.bottom + gap + 'px';
      style.bottom = upward ? height - rect.top + gap + 'px' : 'auto';
    }
    open() {
      if (this.button.matches(':disabled') || !this.select.options.length) return;
      opened?.close();
      opened = this;
      this.button.focus({preventScroll:true});
      this.button.setAttribute('aria-expanded','true');
      this.list.hidden = false;
      this.list.showPopover?.();
      this.position();
      if (opened !== this) return;
      this.draw();
      this.events = new AbortController();
      const opts = {capture:true,signal:this.events.signal};
      document.addEventListener('pointerdown', e => { if (!this.contains(e.target)) this.close(); }, opts);
      window.addEventListener('scroll', e => { if (!(e.target instanceof Node) || !this.list.contains(e.target)) this.position(); }, opts);
      window.addEventListener('resize', () => this.position(), opts);
    }
    close() {
      if (opened !== this) return;
      opened = null;
      this.events?.abort();
      if (this.list.isConnected) this.list.hidePopover?.();
      this.list.hidden = true;
      this.list.replaceChildren();
      this.button.setAttribute('aria-expanded','false');
      this.button.removeAttribute('aria-activedescendant');
      this.active = null;
      this.query = '';
    }
    choose(index) {
      const {select} = this;
      if (!this.rows.some(row => Number(row.dataset.index) === index)) return;
      this.close();
      if (select.selectedIndex === index) return;
      select.selectedIndex = index;
      this.refresh();
      select.dispatchEvent(new Event('input', {bubbles:true}));
      select.dispatchEvent(new Event('change', {bubbles:true}));
    }
    onKey(event) {
      if (event.ctrlKey || event.metaKey) return;
      const key = event.key, visible = opened === this;
      if (key === 'Tab') { this.close(); return; }
      if (key === 'Escape') {
        if (!visible) return;
        this.close();
      } else if (key === 'Enter' || key === ' ') {
        if (!visible) this.open();
        else if (this.active) this.choose(Number(this.active.dataset.index));
      } else if (['ArrowDown','ArrowUp','Home','End'].includes(key)) {
        if (!visible) this.open();
        const last = this.rows.length - 1, current = this.rows.indexOf(this.active);
        const index = key === 'Home' ? 0 : key === 'End' ? last :
          Math.max(0, Math.min(last,current + (key === 'ArrowDown' ? 1 : -1)));
        this.mark(this.rows[index]);
      } else if (key.length === 1 && !event.altKey) {
        if (!visible) this.open();
        const now = performance.now();
        this.query = (now - this.typedAt < 750 ? this.query : '') + key.toLocaleLowerCase('it');
        this.typedAt = now;
        const match = this.rows.find(row => row.textContent.toLocaleLowerCase('it').split(' · ').some(part => part.startsWith(this.query)));
        if (match) this.mark(match);
      } else return;
      event.preventDefault();
      event.stopPropagation();
    }
  }
  customElements.define('tmm-picker', TmmPicker);
  window.TmmPicker = TmmPicker;
  function initialize() {
    for (const select of document.querySelectorAll('select[data-tmm-label]')) {
      TmmPicker.attach(select,select.dataset.tmmLabel);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
  document.addEventListener('reset', event => requestAnimationFrame(() => {
    for (const select of event.target.querySelectorAll('select')) TmmPicker.refresh(select);
  }));
})();
