/* Owner decision: figures come exclusively from our Cloudflare R2 archive,
 * through the shared asset API. Never substitute an external or local catalogue. */
(() => {
  "use strict";
  function source(figure) {
    const id = String(figure || "").trim();
    return /^[1-9]\d{0,3}$/.test(id) ? `/api/asset?kind=figure&figure=${id}&presentation=numberless-v2&catalog=quizbank-r2-v2` : "";
  }

  function load(image, question, { onReady = () => {}, isCurrent = () => true } = {}) {
    const url = source(question.figure);
    let note = null;
    let retry = null;
    const current = () => image.__quizBankFigureLoad === owner && isCurrent();
    const owner = {};
    image.__quizBankFigureLoad = owner;
    image.hidden = false;
    image.onload = () => {
      if (!current()) return;
      note?.remove();
      note = null;
      image.hidden = false;
      onReady();
    };
    image.onerror = () => {
      if (!current()) return;
      image.hidden = true;
      onReady();
      if (!note) {
        note = document.createElement("p");
        note.className = "quizbank-figure-note";
        note.setAttribute("role", "status");
        note.textContent = "Figura non disponibile. Riprova prima di rispondere. ";
        retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Ricarica figura";
        retry.addEventListener("click", () => {
          if (!current() || !url || retry.disabled) return;
          retry.disabled = true;
          image.hidden = false;
          image.src = `${url}&retry=${Date.now()}`;
        });
        note.appendChild(retry);
        // The zoom enhancer may wrap the image in a disabled button.
        // Keep recovery outside that button so it remains usable.
        (image.closest?.("button") || image).after(note);
      }
      retry.disabled = !url;
    };
    if (url) image.src = url;
    else image.onerror();
  }
  window.MagicQuizBankFigures = Object.freeze({ source, load });
})();
