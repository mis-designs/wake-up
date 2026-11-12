const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function worker() {
  let handler;
  const context = { URL, Response, self: { location: { origin: 'https://qa.local' }, addEventListener: (name, fn) => { if (name === 'fetch') handler = fn; } },
    fetch: async () => { throw new Error('offline'); }, caches: { match: async () => undefined, open: async () => ({ match: async () => undefined }) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), context);
  return async (url, method = 'GET', mode = 'cors') => {
    let response, intercepted = false;
    handler({ request: { url, method, mode, headers: new Headers() }, respondWith: value => { intercepted = true; response = value; } });
    return { intercepted, response: await response };
  };
}
test('worker leaves external media/fonts, signed PUTs and authenticated APIs to the browser', async () => {
  const run = worker();
  for (const [url, method] of [['https://fonts.googleapis.com/css2', 'GET'], ['https://banglawebfonts.pages.dev/css/tiro-bangla.css', 'GET'], ['https://bucket.account.r2.cloudflarestorage.com/video.mp4', 'GET'], ['https://bucket.account.r2.cloudflarestorage.com/video.mp4', 'PUT'], ['https://qa.local/api/quiz?action=getQuizVideo', 'GET'], ['https://qa.local/api/quiz', 'POST']]) assert.equal((await run(url, method)).intercepted, false);
});
test('uncached offline navigation returns an error Response instead of undefined', async () => {
  const result = await worker()('https://qa.local/quiz', 'GET', 'navigate');
  assert.equal(result.intercepted, true); assert.ok(result.response instanceof Response); assert.equal(result.response.type, 'error');
});
