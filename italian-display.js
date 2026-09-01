(() => {
  "use strict";

  function clean(value) {
    return String(value ?? "").trim();
  }

  function initialUppercase(value) {
    const characters = Array.from(clean(value));
    const firstLetter = characters.findIndex(character => (
      character.toLocaleLowerCase("it-IT") !== character.toLocaleUpperCase("it-IT")
    ));
    if (firstLetter < 0) return characters.join("");
    characters[firstLetter] = characters[firstLetter].toLocaleUpperCase("it-IT");
    return characters.join("");
  }

  function uppercase(value) {
    return clean(value).toLocaleUpperCase("it-IT");
  }

  window.MagicItalianDisplay = Object.freeze({ initialUppercase, uppercase });
})();
