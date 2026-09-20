import { FIGURE_CATALOG, normalizeFigureId } from './figure-catalog.mjs?v=1';

// Editorial grouping, not regulatory figure numbering. Allbooks category map
// cross-checked against our named catalog; contextual/composite images stay explicit.
const groups = [
  ['pericolo', 'Pericolo', 'বিপদের সংকেত', 'Riconosci quale pericolo viene preannunciato.', '1 2 3 4 5 8 9 10 11 13 14 15 16 17 18 22 23 24 28 30 31 34 37 38 901 902 909 910 920'],
  ['precedenza', 'Precedenza', 'অগ্রাধিকারের সংকেত', 'Distingui i segnali che regolano la precedenza.', '40 41 42 43 44 45 46 47 50 51 52 53'],
  ['divieto', 'Divieto', 'নিষেধাজ্ঞার সংকেত', 'Osserva a chi si applica il divieto e gli eventuali pannelli.', '54 55 56 57 59 60 63 64 66 67 68 70 71 72 73 75 76 77 78 79 80 81 82 83 84 85 90 91 92 151 942 945 949 955 957'],
  ['obbligo', 'Obbligo', 'বাধ্যতামূলক নির্দেশ', 'Riconosci percorsi, direzioni e comportamenti obbligatori.', '96 98 101 102 103 104 105 106 107 108 112 113 115 117 118 119 120 150'],
  ['indicazione', 'Indicazione', 'তথ্যসূচক সংকেত', 'Località, percorsi, servizi e informazioni utili alla guida.', '86 153 166 167 168 172 182 183 184 186 189 193 194 197 199 200 201 203 206 218 219 225 226 228 230 231 236 238 239 240 242 243 250 256 270 273'],
  ['orizzontali', 'Segnaletica orizzontale', 'রাস্তার দাগ ও চিহ্ন', 'Studia strisce, frecce e organizzazione delle corsie.', '501 502 505 513 531 535 543 546 547 550 552 554 559 562 563 566 567 574 599 670'],
  ['semafori', 'Semafori e agenti', 'ট্রাফিক বাতি ও পুলিশ', 'Distingui i segnali luminosi dai gesti degli agenti.', '154 155 159 160 161 162 385 386'],
  ['cantiere', 'Cantiere e complementari', 'সড়কের কাজ ও সহায়ক সংকেত', 'Riconosci delimitazioni e segnalazioni di cantiere.', '251 278 279 282 283 289 291 297'],
  ['pannelli', 'Pannelli integrativi', 'অতিরিক্ত তথ্যের প্যানেল', 'Leggi il pannello insieme al segnale a cui si riferisce.', '121 122 125 126 138 139 915'],
  ['incroci', 'Incroci', 'মোড় ও অগ্রাধিকার', 'Osserva l’intero incrocio, non soltanto un veicolo.', '617 638 642 667 669'],
  ['spie', 'Spie e comandi', 'সতর্কবাতি ও সুইচ', 'Riconosci i simboli sul cruscotto e i comandi del veicolo.', '698 704 706'],
  ['veicoli', 'Pannelli sui veicoli', 'যানবাহনের প্যানেল', 'Distingui i pannelli applicati ai veicoli dai cartelli stradali.', '301 302 303 304 305']
];

export const FIGURE_STUDY_CATEGORIES = Object.freeze(groups.map(([id, title, bangla, description, numbers]) => Object.freeze({
  id, title, bangla, description, figures: Object.freeze(numbers.split(' ').map(number => `fig${number}`))
})));
// Preview-only editorial labels. Canonical names and the shared web popup stay intact.
const labels = {
  fig17: ['Discesa pericolosa', 'বিপজ্জনক উতরাই'],
  fig18: ['Salita ripida', 'খাড়া চড়াই'],
  fig121: ['Distanza', 'কত দূরে শুরু'],
  fig122: ['Estesa', 'কতটা পথ জুড়ে'],
  fig125: ['Giorni lavorativi', 'কর্মদিবসে প্রযোজ্য সময়'],
  fig126: ['Limitazione', 'শুধু দেখানো যানবাহনের জন্য প্রযোজ্য']
};
export const FIGURE_STUDY_ITEMS = Object.freeze(FIGURE_STUDY_CATEGORIES.flatMap(category => category.figures.map(id =>
  Object.freeze({ ...FIGURE_CATALOG[id], category: category.id,
    displayTitle: labels[id]?.[0] || FIGURE_CATALOG[id].italian,
    displayBangla: labels[id]?.[1] || FIGURE_CATALOG[id].bangla })
)));
export const studyCategory = id => FIGURE_STUDY_CATEGORIES.find(category => category.id === id) || null;
export const studyFigure = id => FIGURE_STUDY_ITEMS.find(item => item.id === normalizeFigureId(id)) || null;
const normalizeSearch = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
export function searchStudyFigures(category, query = '') {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return FIGURE_STUDY_ITEMS.filter(item => (!category || item.category === category)
    && words.every(word => normalizeSearch(`${item.italian} ${item.bangla} ${item.displayTitle} ${item.displayBangla}`).includes(word)));
}
export function figureStudyPath({ category = '', figure = '', query = '' } = {}) {
  const params = new URLSearchParams({ view: 'figures' });
  if (studyCategory(category)) params.set('category', category);
  if (studyFigure(figure)) params.set('figure', figure);
  if (query) params.set('q', query.slice(0, 100));
  return `/studia-quiz?${params}`;
}
