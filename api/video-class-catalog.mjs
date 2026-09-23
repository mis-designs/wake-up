// Editorial source: owner's student document, 2026-09-23. Server-only catalogue.
// IDs retain hyphens; only accidental URL whitespace/tracking was removed.
// Repeated source entries are aliases of one video, not invented extra lessons.
const sections = [
  ['01', 'Strada e veicoli', [
    ['LFeD_CfkVNA','Lezione 1',51], ['Qv8fnl7-lQM','Lezione 2',77], ['zI6WFzXSe8k','Lezione 3',48],
    ['g-Lf94sL7PI','Lezione 4',45], ['XQP-CMmyPl4','Lezione 5',42], ['76N4jRgx-Vo','Lezione 6',61],
    ['qr1T6GqZSJo','Lezione 7',64], ['R5nmIFgynLM','Lezione 8',62], ['-D3alLvPfwU','Lezione 9',68],
    ['vVRE7A0lWs8','Lezione 10',70], ['j6Ypt7nMBqA','Lezione 11',37], ['VhwPEKnVKYA','Lezione 12',55],
    ['kEns_IZd46w','Quiz'], ['UuJ4DeWil6Q','Quiz 1 · ultima parte'], ['UEcSqf9zDL4','Quiz 2 · ultima parte'], ['YbmRf1mx8NE','Quiz 3 · ultima parte']]],
  ['02', 'Segnali di pericolo', [
    ['YhISuYsEYC0','Lezione completa · Borhan sir',74], ['NH54DOERQME','Lezione completa · Pial sir',81],
    ['jy9-1C_hpds','Parte 1 · Pial sir',46], ['VD3g_etkAqc','Parte 2 · Pial sir',56], ['P-MHBiMOgbw','Parte 3 · Pial sir',63],
    ['PfwClIk04P4','Quiz 1'], ['RaZ8AHZFoZM','Quiz 2'], ['TieebvrrgwE','Quiz 3']]],
  ['03', 'Segnali di divieto', [
    ['5JK5sWmsxq8','Parte 1 · Pial sir',76], ['EVW850swemg','Parte 2 · Pial sir',60], ['EWAL20UzqUU','Asse 2,5 t'],
    ['zyTfYAj6pNk','Quiz · video 1'], ['HeVSLwtty7c','Quiz · video 2'], ['UxymyzJ28KA','Quiz · video 3']]],
  ['04', "Segnali d’obbligo", [
    ['MsRtL_z0IDE','Parte 1 · Pial sir',81], ['RkO7XW79UmU','Parte 2 · Pial sir',62], ['VBx9uWdTq30','Quiz 1'], ['b0GVFV9I2t8','Quiz 2']]],
  ['05', 'Segnali di precedenza', [
    ['M8s0FTKNamQ','Parte 1 · Pial sir',72], ['2eg9_FQwmN8','Parte 2 · Pial sir',56], ['uApVpkjmhHo','Dare precedenza nei sensi unici alternati'],
    ['uBXDpdRzj6Y','Teoria e quiz · Parte 1 · Pial sir',36], ['dyE0zT72rMo','Teoria e quiz · Parte 2 · Pial sir',59], ['xOe_h9IuZHk','Quiz 1'], ['pKdJ2PkprP0','Quiz 2']]],
  ['06', 'Segnaletica orizzontale', [
    ['h6JyXSWE29Y','Parte 1 · Pial sir',70], ['f00iudNTAaA','Parte 2 · Pial sir',44], ['8SLdzqUCJNE','Quiz 1'], ['J-dZSiXeMfQ','Quiz 2'], ['GyjKoSLbge8','Quiz 3']]],
  ['07', 'Semafori e agenti di traffico', [
    ['ksKScj2dgD4','Parte 1 · Pial sir',52], ['jikAviEdF7s','Parte 2 · Pial sir',82], ['AElfNNJr_dA','Quiz 1'], ['r34-Pfj0O_4','Quiz 2'], ['knrFLlB8Bh0','Quiz 3'], ['hHgTSdrktbQ','Striscia di guida · Video 3D · Pial sir']]],
  ['08', 'Segnali di indicazione', [
    ['bb9sUzz_4F0','Parte 1 · Pial sir',46], ['BQcSfB25qPM','Parte finale · Pial sir',68], ['COVxRjWckKI','Quiz 1'], ['SJ4NdFOnxpE','Quiz 2']]],
  ['09', 'Segnali complementari, temporanei e di cantiere', [
    ['eiJJ2IbTM_4','Teoria · Pial sir',33], ['kAOzgyYP68s','Quiz 1 · Pial sir',29], ['eSFX21L216Q','Quiz 2'], ['bYMZqT7CbgY','Quiz 3']]],
  ['10', 'Pannelli integrativi', [
    ['8mysPlMEVmA','Teoria · Pial sir',69], ['SkOSKVmJhzY','Quiz 1'], ['M3NaxKRPKRA','Quiz 2'], ['D5RzKG_rgbU','Quiz · ripasso completo']]],
  ['11', 'Limiti di velocità', [
    ['wVy1Q6JPJs0','Teoria',49], ['3XAIRyASjzU','Teoria · Pial sir',63], ['FYPc7nJDknU','Quiz 1'], ['SJbhmyCjrIY','Quiz 2'], ['dkdueQF2B6s','Quiz 3']]],
  ['12', 'Distanza di sicurezza', [
    ['qLU6e3MQqNU','Teoria · Pial sir',54], ['TZPZlTNd4IA','Quiz 1'], ['TZPZlTNd4IA','Quiz 2'], ['Y58Xao9fXas','Quiz 3'], ['DmGVLzvwvXA','Quiz 4']]],
  ['13', 'Norme e circolazione dei veicoli', [
    ['voaSu_nWS-8','Parte 1 · Pial sir',61], ['kpTYw4nj9KM','Parte 2 · Pial sir',66], ['z8uwbe-qccs','Quiz 1'], ['z8uwbe-qccs','Quiz 2'], ['8dr6SgQJQUY','Quiz 3'], ['hz-ghI89llQ','Quiz 4'], ['8P4bHGreVoc','Quiz 5']]],
  ['14', 'Precedenza e incroci', [
    ['s-1Rj1IXvCI','Parte 1 · Pial sir',43], ['0ClMNjSCdbM','Parte finale · Pial sir',33], ['7r9YQ8xbFH8','Quiz 1'], ['QACbcuRwjJ4','Quiz 2'], ['OobC26EPIHM','Quiz 3']]],
  ['15', 'Norme sul sorpasso', [
    ['t0n3zlbh6zs','Parte 1 · Pial sir',55], ['mGJWbZ357ZY','Parte finale · Pial sir',65], ['TMjXDEN4cLI','Quiz 1 · completo'], ['o53AKn8cews','Quiz 2'], ['bN-RwtsVxHo','Quiz 3'], ['cKKIH9FUPAw','Quiz 4']]],
  ['16', 'Fermata, sosta, arresto e partenza', [
    ['g0p8sM751O8','Parte 1 · Pial sir',55], ['TzdZE44oTUA','Parte 2 · Pial sir',54], ['kVCBwY6UdGo','Quiz 1'], ['zhO3xlEeig0','Quiz 2'], ['QvqozA0Pn9U','Quiz 3'], ['guCEREj2HlE','Quiz 4']]],
  ['17', 'Norme sulla circolazione', [
    ['JJFk1ec6OXY','Parte 1 · Pial sir',59], ['NsON-3LLa4A','Parte 2 · Pial sir',57], ['1-4Dw9M2FQ8','Ultima parte · Pial sir',62], ['ptWvLV801fM','Trainare rimorchi e veicolo · Pial sir',46],
    ['ir8HfsGJDSM','Quiz 1'], ['6b6vgDvCBmg','Quiz 2'], ['IOEOexsZ2_E','Quiz 3'], ['8N04ic21yJ0','Quiz 4'], ['0HEOljUK1zo','Quiz 5']]],
  ['18', 'Uso delle luci', [
    ['ujs9kotniBc','Parte 1 · Pial sir',67], ['ygK8jGEUB18','Parte 2 · Pial sir',60], ['2V8rBpqpvlM','Quiz 1'], ['De1x0U4ikbA','Quiz 2'], ['31fcSIEKcdg','Quiz 3']]],
  ['19', 'Dispositivi di equipaggiamento e cinture di sicurezza', [
    ['ELCO-jSaAtI','Teoria · Pial sir',68], ['isUrYHJbaHY','Quiz 1'], ['PwnWXjbjMTw','Quiz 2']]],
  ['20', 'Patenti e documenti di circolazione', [
    ['gQSUFpBIPI8','Documenti di circolazione · Parte 1 · Pial sir',64], ['Hc0j5teqk10','Punti · Parte 2 · Pial sir',89], ['Y-q7j3S3ATg','Categorie patenti · Parte 3 · Pial sir',93], ['QkzV1zL26TU','Revoca, ritiro e sospensione · Pial sir',44],
    ['facebook-SaV7bhTHu4JyUnQ2','Video su Facebook'], ['zzJyvtyxL_Q','Quiz 1'], ['E2236GSKWU8','Quiz 2'], ['1VPB9TnR7cM','Quiz 3'], ['S8ZaiN4YVBs','Quiz 4 · speciale']]],
  ['21', 'Comportamenti per prevenire incidenti stradali', [
    ['7OIzfhCoPvY','Teoria · Pial sir',71], ['jOqvIsaU9bg','Quiz 1'], ['7Z1YFVmHMbs','Quiz 2']]],
  ['22', 'Primo soccorso', [
    ['X2CC2ytdbTA','Teoria · Pial sir',60], ['MDE8JOh5CPg','Quiz 1'], ['KtF81j7pyPM','Quiz 2'], ['KtF81j7pyPM','Quiz 3'], ['l6jS3-6jgG8','Quiz 4'], ['MDE8JOh5CPg','Quiz 5 · completo']]],
  ['23', 'RCA', [
    ['oainOubm-50','Teoria e quiz · Pial sir · speciale'], ['5p7MScaotr4','Quiz 1 · completo'], ['2l1WGn6j424','Quiz 2'], ['2VLIoXVI4rQ','Quiz 3'], ['5CgKU7R3M8Y','Quiz 4'], ['pmI42tG3cj8','Quiz 5'], ['T_35S-IIkPM','Quiz 6'], ['O2itbk55KjM','Quiz 7'], ['fDD07qOPlnY','Quiz 8']]],
  ['24', 'Consumi di carburante', [
    ['Z8uxgUOhN6o','Teoria'], ['ltErMawLwYo','Quiz 1'], ['tr6zLat8F5Y','Quiz 2'], ['Sa4oMMmQ3EU','Quiz 3'], ['tr6zLat8F5Y','Quiz 4 · completo 1'], ['Sa4oMMmQ3EU','Quiz 5 · completo 2']]],
  ['25', 'Manutenzione ed elementi del veicolo', [
    ['dgcCcubn7iA','Parte 1 · Pial sir',81], ['IJWi36nhJc4','Approfondimento importante',61], ['JiRHZXLoic0','Quiz 1'], ['coHduOOrnOc','Quiz 2'], ['_jJyRWSN2RA','Quiz 3'], ['pZniP4iOmxA','Quiz 4'], ['_jJyRWSN2RA','Quiz 5'], ['QYpq9Lq8yz8','Quiz 6'], ['90m-0O2cx4I','Quiz 7']]],
  ['parole', 'Parole da imparare', [
    ['uxra5oJQ_FU','Parole del capitolo 1 · Parte 1'], ['0kQ-Hu3K7yI','Parole del capitolo 1 · Parte 2'], ['gFmosJd1PiM','Parole del capitolo 1 · Parte 3'], ['pvx2lY1_Q_4','Parole del capitolo 1 · Parte 4'], ['55EauZ6dN0U','Parole del capitolo 1 · Parte 5'],
    ['E80fZL2QygY','Parole · video 1'], ['uxra5oJQ_FU','Parole · video 2'], ['54cU8yBFDto','Parole · video 3'], ['ea_X0VrkXck','Parole · video 4'], ['1YxLLIltlT0','Parole · video 5'], ['FMJRX8G8MS0','Parole · video 6'], ['NZh9eP66HCU','Parole · video 7'], ['3-mG_RGvSVo','Parole · video 8'], ['5CEwyZbaEZg','Parole · video 9'], ['2hCt1As2AZI','Parole · video 10']]],
  ['guide', 'Guide alle app', [
    ['kfbS2Zs-PR0','Usare l’app TMM sul computer'], ['F7ok5glmFZQ','Attivare Magic Book'], ['avh28KYy_AE','Usare Magic Book']]]
];

export const VIDEO_SOURCE_ENTRIES = sections.flatMap(([group, , rows]) => rows.map(([id, title, minutes]) => ({ group, id, title, ...(minutes ? { minutes } : {}) })));

// Display wording is separate from the exact source references above. No guessed
// topics for untitled links: the first chapter's parts follow document order.
function displayTitle(lesson) {
  const title = lesson.title.replace(/ · (?:Pial|Borhan) sir/gi,'');
  if (lesson.kind === 'parole' || lesson.kind === 'guide') return title;
  if (lesson.kind === 'quiz') {
    const numbers = [lesson.title,...lesson.aliases].map(x => x.match(/^Quiz (\d+)\b/)?.[1]).filter(Boolean);
    if (new Set(numbers).size > 1) return `Quiz ${[...new Set(numbers)].join(' / ')}`;
    return title.replace(/^Quiz · video (\d+)$/, 'Quiz · Parte $1');
  }
  if (/^Lezione \d+$/.test(title)) return title.replace('Lezione ', 'Teoria · Parte ');
  if (title === 'Lezione completa') return 'Teoria completa';
  if (/^Parte \d+$/.test(title)) return `Teoria · ${title}`;
  if (title === 'Parte finale') return 'Teoria · Parte 2 (finale)';
  if (title === 'Ultima parte') return 'Teoria · Parte 3 (finale)';
  if (title === 'Asse 2,5 t') return 'Limite di massa per asse · 2,5 t';
  if (title.startsWith('Punti ·')) return title.replace('Punti ·', 'Punti della patente ·');
  return title;
}

export function getVideoClassCatalog() {
  const lessons = [];
  const byId = new Map();
  for (const entry of VIDEO_SOURCE_ENTRIES) {
    if (byId.has(entry.id)) { byId.get(entry.id).aliases.push(entry.title); continue; }
    const provider = entry.id.startsWith('facebook-') ? 'facebook' : 'youtube';
    const lesson = { ...entry, provider, aliases: [], cover: entry.id === 'LFeD_CfkVNA' ? 'road' : entry.id === 'YhISuYsEYC0' ? 'danger' : '', kind: entry.group === 'parole' ? 'parole' : entry.group === 'guide' ? 'guide' : /^Quiz/i.test(entry.title) ? 'quiz' : /Teoria e quiz/i.test(entry.title) ? 'misto' : 'teoria',
      url: provider === 'youtube' ? `https://www.youtube.com/watch?v=${entry.id}` : 'https://www.facebook.com/share/v/SaV7bhTHu4JyUnQ2/' };
    lessons.push(lesson); byId.set(entry.id, lesson);
  }
  for (const lesson of lessons) {
    lesson.sourceTitle = lesson.title;
    const teacher = lesson.title.match(/\b(Pial|Borhan) sir\b/i)?.[0];
    if (teacher) lesson.teacher = teacher;
    lesson.title = displayTitle(lesson);
  }
  return { version: '2026-09-23.2', groups: sections.map(([id, title]) => ({ id, title })), lessons,
    resources: [
      { id: 'tmm-webapp', title: 'TMM · app sul computer', url: 'https://www.tmmpatente.it/webapp/#/', description: 'Apri la pagina e segui le istruzioni per il codice QR.' },
      { id: 'quiz-rmastri', title: 'Quiz misti · sito esterno', url: 'http://www.rmastri.it/quiz-patente-b/', description: 'Collegamento presente nel documento studenti.' }
    ] };
}

// A direct request to this server module must never disclose the catalogue.
export default function handler(_req, res) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).end(); }
