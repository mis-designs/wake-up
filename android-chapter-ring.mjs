// Each chapter keeps its physical card as it moves from the back to the front.
// The selector, the neighboring cards and swipes all use the book's selection owner.
export function createChapterRing(root, { titles, selected, select, open, enabled }) {
  const stage = root.querySelector(".chapter-ring-stage");
  const picker = root.querySelector("select");
  const printedNumber = root.querySelector(".chapter-ring-index b");
  const heading = root.querySelector(".chapter-ring-title");
  const count = titles.length;
  const wrap = number => ((number - 1) % count + count) % count + 1;
  const folio = number => String(number).padStart(2, "0");
  const cards = new Map();
  let gesture;
  let ignoreClick = false;

  titles.forEach((title, i) => picker.add(new Option(folio(i + 1) + " · " + title, String(i + 1))));
  root.querySelector(".chapter-ring-total").textContent = folio(count);

  function makeCard(number) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-ring-card";
    button.dataset.chapter = String(number);
    const fallback = document.createElement("span");
    fallback.className = "chapter-ring-fallback";
    const numeral = document.createElement("strong");
    numeral.textContent = folio(number);
    const name = document.createElement("span");
    name.textContent = titles[number - 1];
    fallback.append(numeral, name);
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    image.onload = async () => {
      try {
        await image.decode();
        if (image.complete && image.naturalWidth) button.classList.add("has-art");
      } catch { /* Keep the printed number and title during cancellation or a decode failure. */ }
    };
    image.onerror = () => button.classList.remove("has-art");
    button.append(fallback, image);
    cards.set(number, button);
    return button;
  }

  function render(number, covers) {
    const visible = [-1, 0, 1].map(offset => wrap(number + offset));
    const focusedCard = stage.contains(document.activeElement);
    for (const button of Array.from(stage.children)) {
      if (!visible.includes(Number(button.dataset.chapter))) button.remove();
    }
    visible.forEach((chapter, index) => {
      const button = cards.get(chapter) || makeCard(chapter);
      const slot = index - 1;
      button.dataset.slot = String(slot);
      button.tabIndex = slot === 0 ? 0 : -1;
      button.setAttribute("aria-label", (slot === 0 ? "Apri" : "Seleziona") + " capitolo " + chapter + ", " + titles[chapter - 1]);
      if (!button.isConnected) stage.append(button);
      const path = covers[folio(chapter)];
      const image = button.lastElementChild;
      if (typeof path === "string" && path.startsWith("/assets/chapter-covers/") && !path.includes("..") && image.getAttribute("src") !== path) image.src = path;
    });
    heading.textContent = titles[number - 1];
    printedNumber.textContent = folio(number);
    picker.value = String(number);
    if (focusedCard) cards.get(number).focus({ preventScroll: true });
  }

  function choose(number) {
    if (enabled() && number !== selected()) select(number);
  }
  root.addEventListener("click", event => {
    const step = event.target.closest("[data-ring-step]");
    if (step) return choose(wrap(selected() + Number(step.dataset.ringStep)));
    const card = event.target.closest(".chapter-ring-card");
    if (!card || (event.detail && ignoreClick) || !enabled()) return;
    const number = Number(card.dataset.chapter);
    if (number === selected()) open();
    else choose(number);
  });
  picker.addEventListener("change", () => choose(Number(picker.value)));
  root.addEventListener("keydown", event => {
    if (event.target === picker || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const to = { ArrowLeft: wrap(selected() - 1), ArrowRight: wrap(selected() + 1), Home: 1, End: count };
    if (Object.hasOwn(to, event.key)) {
      event.preventDefault();
      choose(to[event.key]);
    }
  });
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || !enabled()) return;
    ignoreClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, width: stage.clientWidth };
    event.target.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", event => {
    if (gesture?.id !== event.pointerId || document.documentElement.hasAttribute("data-native-motion-paused")) return;
    const dx = event.clientX - gesture.x;
    if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(event.clientY - gesture.y)) return clearPull();
    stage.dataset.pull = dx < 0 ? "next" : "previous";
    stage.style.setProperty("--travel", String(Math.min(.74, Math.abs(dx) / (gesture.width * .48))));
  });
  function clearPull() {
    delete stage.dataset.pull;
    stage.style.removeProperty("--travel");
  }
  stage.addEventListener("pointerup", event => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    clearPull();
    ignoreClick = Math.max(Math.abs(dx), Math.abs(dy)) > 10;
    if (Math.abs(dx) > Math.max(26, Math.abs(dy) * 1.25)) choose(wrap(selected() + (dx < 0 ? 1 : -1)));
  });
  function resetGesture() { gesture = null; ignoreClick = false; clearPull(); }
  stage.addEventListener("pointercancel", resetGesture);
  stage.addEventListener("lostpointercapture", event => {
    if (gesture?.id === event.pointerId) resetGesture();
  });
  function suspend() {
    resetGesture();
    for (const [chapter, card] of cards) {
      const image = card.lastElementChild;
      if (image.complete && image.naturalWidth) continue;
      image.removeAttribute("src");
      card.remove();
      cards.delete(chapter);
    }
  }
  return { render, suspend };
}
