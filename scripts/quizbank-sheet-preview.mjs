// Local-only fixture server. No production credentials, data or API requests.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const examples = [
  ['Il segnale raffigurato prescrive di dare la precedenza ai veicoli provenienti sia da destra che da sinistra.', '40', true],
  ['La distanza di sicurezza deve essere almeno uguale ai metri che il veicolo percorre durante il tempo di reazione.', '', true],
  ['Il segnale raffigurato obbliga a fermarsi sempre prima di impegnare l’incrocio.', '40', false]
];
const sheetRows = sheet => Array.from({ length: 30 }, (_, i) => ({ id: `qb_s${String(sheet).padStart(2, '0')}_q${String(i + 1).padStart(2, '0')}`, sheet, number: i + 1,
  question: examples[i % 3][0], figure: examples[i % 3][1], correct: examples[i % 3][2], explanationMapped: i > 0,
  questionTranslation: 'সড়কে চলাচলের সময় সতর্ক থাকতে হবে।', questionTranslationSource: 'fixture' }));
const bootstrap = `<script>
localStorage.setItem('client_auth_reset_version', '2026-04-device-reset-1');
localStorage.setItem('user_session', JSON.stringify({phone:'39123456789',deviceId:'sheet_fixture',accessToken:'fixture'}));
let hash=2166136261; for(const c of '39123456789'){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}
localStorage.setItem('magicbook.wordLearning.v1.'+(hash>>>0).toString(36),JSON.stringify({lastCompletedAt:Date.now()}));
window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__=true;
const originalFetch=window.fetch.bind(window);
window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin)return Promise.resolve(new Response('{}',{status:503}));return originalFetch(input,init)};
</script>`;
const counts = {};
let mode = 'ok';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/qa/state') return json({ counts, mode });
  if (url.pathname === '/qa/mode') { mode = url.searchParams.get('value') || 'ok'; return json({ mode }); }
  if (url.pathname.startsWith('/api/')) {
    let raw = ''; for await (const chunk of req) raw += chunk;
    let data; try { data = req.method === 'POST' ? JSON.parse(raw || '{}') : Object.fromEntries(url.searchParams); } catch { return json({}, 400); }
    counts[data.action] = (counts[data.action] || 0) + 1;
    if (mode === 'denied') return json({ error: 'quizbank_access_denied' }, 403);
    if (mode === 'fail') return json({ error: 'service_unavailable' }, 503);
    const sheet = Number(data.chapters || data.scheda || 1);
    const rows = sheetRows(sheet);
    const session = { quizSessionToken: 'fixture', quizSessionTokenExpiresAt: Date.now() + 600000, canUploadAudio: mode !== 'learner', isAdmin: mode !== 'learner', role: mode === 'learner' ? 'user' : 'admin' };
    if (data.action === 'catalog') return json({ sheets: Array.from({ length: 50 }, (_, i) => ({ number: i + 1, count: 30 })), questionCount: 1500, ...session });
    if (data.action === 'getStudyQuiz') return json({ quiz: rows, ...session });
    if (data.action === 'getQuiz') return json({ quiz: rows.map(({ correct, ...row }) => row), title: `QuizBank · Scheda ${sheet}`, quizbankRevision: 'a'.repeat(64), timerMinutes: 20, ...session });
    if (data.action === 'checkQuiz') {
      if (mode === 'stale') return json({ error: 'quizbank_revision_changed' }, 409);
      const answers = typeof data.answers === 'string' ? JSON.parse(data.answers) : data.answers;
      const results = rows.map(row => { const answer = answers.find(a => a.id === row.id)?.answer ?? null; return { id: row.id, question: row.question, figure: row.figure, answer, correct: answer !== null && Boolean(answer) === row.correct, correctAnswer: row.correct }; });
      const score = results.filter(r => r.correct).length;
      return json({ correct: score, totalQuestions: 30, passed: score >= 27, results: results.map(r => ({ ...r, correctAnswer: Number(r.correctAnswer) })), ...session });
    }
    if (data.action === 'getQuizAudioStatus') return json({ available: false });
    if (data.action === 'getExplanationFigures') return json({ figures: [] });
    return json({ available: false, translation: 'সড়কে চলাচলের সময় সতর্ক থাকতে হবে।' });
  }
  const route = url.pathname === '/quizbank' ? 'quizbank.html' : url.pathname === '/quiz' || url.pathname.startsWith('/quiz/') ? 'quiz.html' : url.pathname.startsWith('/qa-figures/') ? 'tests/fixtures/quiz-figures/fig40.jpg' : decodeURIComponent(url.pathname).slice(1);
  const file = path.resolve(repo, route);
  if (!file.startsWith(repo) || route.split(/[\\/]/).some(s => s.startsWith('.')) || !mime[path.extname(file)] || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(''); }
  let body = fs.readFileSync(file);
  if (path.extname(file) === '.html') body = Buffer.from(body.toString().replace('<head>', '<head>' + bootstrap));
  if (path.extname(file) === '.js') body = Buffer.from(body.toString().replaceAll('https://raw.githubusercontent.com/Ed0ardo/QuizPatenteB/main/img_sign/', '/qa-figures/'));
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: data:" });
  res.end(body);
});
server.listen(4186, '127.0.0.1', () => console.log('QuizBank local fixtures: http://127.0.0.1:4186/quizbank?scheda=5'));
