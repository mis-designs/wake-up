// Decorative greetings share one renderer across login and installed Home.
// Their stable accessible heading name never interrupts form entry.
export function renderGreeting(title, greetings, className, accessibleName) {
  if (!title) return;
  const doc = title.ownerDocument;
  const rail = doc.createElement("span");
  rail.className = className;
  rail.setAttribute("aria-hidden", "true");
  for (const text of greetings) {
    const line = doc.createElement("span");
    line.textContent = text;
    line.lang = /[\u0980-\u09ff]/u.test(text) ? "bn" : "it";
    rail.append(line);
  }
  title.setAttribute("aria-label", accessibleName);
  title.replaceChildren(rail);
}
