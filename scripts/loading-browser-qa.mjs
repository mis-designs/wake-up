// Local assets and held, mocked API only. Never contacts production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.gif':'image/gif','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const browser = await chromium.launch({ headless: true, channel: 'msedge' }), report = [];
try {
  for (const native of [false,true]) for (const width of [375,1440]) for (const failure of ['none','primary','both']) {
    const context = await browser.newContext({ viewport: {width,height:850}, serviceWorkers:'block', ...(native ? { userAgent:'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3' } : {}) });
    let apiReads = 0, release;
    let pending = new Promise(resolve => { release = resolve; });
    const requests = [], errors = [];
    await context.route('**/*', async route => {
      const u = new URL(route.request().url());
      if(u.hostname !== 'loading.local') return route.fulfill({status:503,body:''});
      if(u.pathname === '/api/quiz' || u.pathname === '/api/trial') { apiReads++; await pending; return route.fulfill({status:503,json:{error:'fixture'}}); }
      if(u.pathname.startsWith('/api/')) return route.fulfill({json:{}});
      if(u.pathname.includes('/loading_')) {
        requests.push(u.pathname);
        if((failure !== 'none' && u.pathname.endsWith('headlight.gif')) || (failure === 'both' && u.pathname.endsWith('backup.gif'))) return route.fulfill({status:404,body:''});
      }
      const file = u.pathname === '/studia-quiz' ? 'study-quiz.html' : u.pathname.startsWith('/quiz/') ? 'quiz.html' : decodeURIComponent(u.pathname).slice(1), full = path.join(repo,file);
      if(file.includes('..') || !fs.existsSync(full) || !mime[path.extname(file)]) return route.fulfill({status:404,body:''});
      return route.fulfill({contentType:mime[path.extname(file)],body:fs.readFileSync(full)});
    });
    await context.addInitScript(() => {
      localStorage.setItem('user_session',JSON.stringify({phone:'3310000000',deviceId:'loader-fixture',accessToken:'fixture'}));
      let hash=2166136261;for(const c of '3310000000'){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}
      localStorage.setItem(`magicbook.wordLearning.v1.${(hash>>>0).toString(36)}`,JSON.stringify({lastCompletedAt:Date.now()}));
      window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__=true;
    });
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://loading.local/studia-quiz?view=videos',{waitUntil:'domcontentloaded'});
    await page.locator('.vc-loading').waitFor();
    const expected = failure === 'none' ? undefined : failure === 'primary' ? 'backup' : 'unavailable';
    if(expected) await page.waitForFunction(expected => document.documentElement.dataset.loadingAsset === expected, expected);
    await page.locator('.vc-loading img').evaluate(img=>img.decode());
    const metrics = await page.locator('.vc-loading .magic-loading-indicator__media').evaluate(el=>{
      const css=getComputedStyle(el),box=el.getBoundingClientRect(),image=el.querySelector('img');
      return {width:box.width,height:box.height,radius:parseFloat(css.borderRadius),animation:css.animationName,transform:css.transform,src:image.src,decoded:image.naturalWidth,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(metrics.width>=64 && metrics.width<=88); assert.equal(metrics.width,metrics.height); assert.ok(metrics.radius>=14);
    assert.equal(metrics.animation,'none'); assert.equal(metrics.transform,'none'); assert.equal(metrics.overflow,false);
    if(failure !== 'both') { assert.equal(metrics.decoded,640); assert.ok(metrics.src.endsWith(failure==='primary'?'loading_backup.gif':'loading_headlight.gif')); }
    else { assert.equal(metrics.decoded,1); assert.match(metrics.src,/^data:image\/gif;base64,/); }
    if(failure==='none') assert.equal(requests.filter(p=>p.endsWith('backup.gif')).length,0);
    // CSS-only busy control and a loader mounted after the first failure.
    await page.evaluate(()=>{
      const button=document.createElement('button');button.id='busy-fixture';button.className='magic-loading-control is-loading';button.setAttribute('aria-busy','true');button.textContent='Caricamento';document.querySelector('.vc-loading').append(button);
      const late=document.createElement('img');late.id='late-fixture';late.className='magic-loading-image magic-loading-image--button';late.alt='';late.src='/icons/loading_headlight.gif';button.append(late);
    });
    if(failure==='primary') await page.waitForFunction(()=>document.querySelector('#late-fixture').src.endsWith('loading_backup.gif'));
    const background = await page.locator('#busy-fixture').evaluate(el=>getComputedStyle(el,'::after').backgroundImage);
    assert.equal(background.includes('backup.gif'),failure==='primary');
    if(failure==='both') assert.equal(background,'none');
    await page.locator('#busy-fixture').evaluate(el=>el.remove());
    await page.screenshot({path:path.join(out,`${native?'android':'web'}-${width}-${failure}.png`)});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.vc-loading img').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    assert.notEqual(await page.locator('.vc-loading .magic-loading-indicator__media').evaluate(el=>getComputedStyle(el,'::after').content),'none');
    assert.equal(apiReads,1); release();
    await page.getByRole('button',{name:'Riprova',exact:true}).waitFor();
    assert.equal(apiReads,1,'asset fallback never retries the task'); assert.deepEqual(errors,[]);
    report.push({native,width,failure,metrics,apiReads,requests,errors});
    if (failure === 'none' && width === 375) {
      pending = new Promise(resolve => { release = resolve; });
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.goto('http://loading.local/quiz/prova-gratis?chapter=1',{waitUntil:'domcontentloaded'});
      await page.locator('.loading-overlay').waitFor();
      await page.locator('#quiz-loading-figure-img').evaluate(img=>img.decode());
      const quizMetrics = await page.locator('.quiz-loading-figure').evaluate(el=>{
        const css=getComputedStyle(el),box=el.getBoundingClientRect();
        return {width:box.width,height:box.height,radius:css.borderRadius,shadow:css.boxShadow,background:getComputedStyle(el.closest('.loading-overlay')).backgroundColor};
      });
      assert.ok(quizMetrics.width<=112); assert.equal(quizMetrics.shadow,'none'); assert.equal(quizMetrics.background,'rgb(255, 255, 255)');
      await page.screenshot({path:path.join(out,`${native?'android':'web'}-quiz-white.png`)});
      release();
    }
    await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); console.log(`PASS ${report.length} loader scenarios`);
} finally { await browser.close(); }
