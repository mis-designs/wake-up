// Local fixtures only. PLAYWRIGHT_PATH can point at the installed test runtime.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getVideoClassCatalog } from '../api/video-class-catalog.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2] || path.join(repo,'outputs/video-class'));
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const browser=await chromium.launch({headless:true,channel:'msedge'}), report=[];
try {
  for(const [native,width,height] of [[false,1440,960],[false,1920,1080],[false,768,1024],[false,375,812],[false,320,568],[true,375,812],[true,740,360]]) {
    if(process.env.QA_WIDTH && Number(process.env.QA_WIDTH)!==width)continue;
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce',...(native?{userAgent:'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3 MagicBookVideo/1'}:{})});
    let reads=0,frames=0,apiLoads=0,failed=false,apiBlocked=false; const errors=[],missing=[];
    await context.route('**/*', async route=>{
      const url=new URL(route.request().url());
      if(url.href==='https://www.youtube.com/iframe_api'){apiLoads++;return route.fulfill({status:apiBlocked?503:200,contentType:'text/javascript',body:apiBlocked?'':fs.readFileSync(path.join(repo,'scripts/video-player-fixture.js'))});}
      if(url.hostname==='www.youtube-nocookie.com'){frames++;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Mock player</title><body style="color:white;background:#111;font:24px Arial">YouTube player fixture</body>'});}
      if(url.hostname!=='video.local')return route.fulfill({status:503,body:''});
      if(url.pathname==='/api/quiz'){
        const action=url.searchParams.get('action');
        if(action==='getVideoClasses'){reads++;return route.fulfill({status:failed?503:200,json:failed?{error:'fixture_failure'}:{ok:true,catalog:getVideoClassCatalog()}});}
        if(action==='getStudyQuiz')return route.fulfill({json:{ok:true,quiz:[],quizSessionToken:'fixture',quizSessionTokenExpiresAt:Date.now()+60000}});
        return route.fulfill({json:{ok:true,available:false}});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({json:{}});
      let file=decodeURIComponent(url.pathname).replace(/^\//,'');
      if(file.startsWith('studia-quiz'))file='study-quiz.html';
      const full=path.join(repo,file);
      if(file.includes('..') || !mime[path.extname(file)] || !fs.existsSync(full)){missing.push(file);return route.fulfill({status:404,body:''});}
      return route.fulfill({contentType:mime[path.extname(file)],body:fs.readFileSync(full)});
    });
    await context.addInitScript(()=>{
      if(!localStorage.getItem('user_session'))localStorage.setItem('user_session',JSON.stringify({phone:'3310000000',deviceId:'video-fixture-device',accessToken:'fixture'}));
      let hash=2166136261;for(const c of '3310000000'){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}
      localStorage.setItem(`magicbook.wordLearning.v1.${(hash>>>0).toString(36)}`,JSON.stringify({lastCompletedAt:Date.now()}));
      window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__=true;
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const checkWidth=async()=>{
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1 ? [...document.querySelectorAll('.vc-watch, .vc-stage, .vc-rail, .vc-lesson-info, .study-header, .vc-nav')].map(el=>({class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})) : null);
      assert.equal(overflow,null,`overflow ${width} ${page.url()} ${JSON.stringify(overflow)}`);
    };
    const shot=async label=>{
      await page.locator('.vc-library img, .vc-hub img').evaluateAll(async images=>{
        await Promise.all(images.map(async img=>{img.loading='eager';await img.decode().catch(()=>{});}));
      });
      await checkWidth(); await page.screenshot({path:path.join(out,`${native?'android':'web'}-${width}-${label}.png`),fullPage:true});
    };
    await page.goto('http://video.local/studia-quiz',{waitUntil:'networkidle'});
    await page.locator('#study-hub').waitFor({state:'visible'});
    assert.equal(await page.locator('.vc-hub-card').count(),2);assert.equal(reads,0);
    assert.equal(await page.locator('#study-hub-figures').isVisible(),native);
    await shot('hub');
    await page.locator('.vc-hub-video').click(); await page.locator('.vc-group').first().waitFor();
    assert.equal(reads,1);assert.equal(frames,0);assert.equal(await page.locator('.vc-group').count(),27);
    await shot('catalog');
    await page.locator('.vc-group').first().click();await page.locator('.vc-lesson').first().waitFor();
    assert.equal(await page.locator('.vc-lesson').count(),12);assert.equal(reads,1);await shot('lessons');
    assert.equal(await page.locator('.vc-lesson .vc-progress').count(),12);
    assert.equal(await page.locator('.study-header small').isVisible(),false);assert.equal(await page.locator('.study-practice-link').isVisible(),false);
    assert.match(await page.locator('.vc-lesson img').first().getAttribute('src'),/section-theory/);
    await page.locator('.vc-lesson .vc-save').first().click();assert.equal(await page.locator('.vc-lesson .vc-save').first().getAttribute('aria-pressed'),'true');
    await page.locator('.vc-lesson-link').first().click();await page.locator('.vc-play').waitFor();assert.equal(frames,0);await shot('watch');
    assert.equal(apiLoads,0);await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
    await page.locator('.vc-play').click();await page.frameLocator('#vc-stage iframe').getByText('YouTube player fixture').waitFor();assert.equal(frames,1);assert.equal(await page.locator('iframe').count(),1);
    await page.waitForFunction(()=>!!window.__videoFixture);await page.clock.runFor(1);
    assert.equal(await page.evaluate(()=>window.__videoFixture.playCalls),1);
    assert.match(await page.locator('#vc-stage iframe').getAttribute('src'),/autoplay=1/);
    await page.clock.runFor(12000);assert.equal(await page.locator('.vc-progress-value').textContent(),'20%');
    await page.evaluate(()=>window.__videoFixture.seekTo(50));await page.clock.runFor(6000);
    assert.equal(await page.locator('.vc-progress-value').textContent(),'30%');
    await page.evaluate(()=>window.__videoFixture.seekTo(0));await page.clock.runFor(6000);
    assert.equal(await page.locator('.vc-progress-value').textContent(),'30%','replay is not counted twice');
    await page.evaluate(()=>window.__videoFixture.pauseVideo());await page.clock.runFor(5000);
    assert.equal(await page.locator('.vc-progress-value').textContent(),'30%','pause is not viewing');
    assert.equal(apiLoads,1);await shot('progress-watch');
    assert.ok(await page.evaluate(()=>document.querySelector('.vc-rail').getBoundingClientRect().top>=document.querySelector('.vc-stage').getBoundingClientRect().bottom),'lesson rail must not cover player');
    await page.getByRole('link',{name:'Lezione successiva',exact:true}).click();await page.locator('.vc-play').waitFor();assert.equal(await page.locator('iframe').count(),0);
    assert.equal(frames,1);assert.equal(reads,1);
    await page.goBack();await page.locator('.vc-play').waitFor();assert.match(await page.locator('#vc-heading').textContent(),/Parte 1/);
    await page.locator('.vc-favorites').click();await page.locator('.vc-lesson').first().waitFor();assert.equal(await page.locator('.vc-lesson').count(),1);
    assert.equal(await page.locator('.vc-progress-value').textContent(),'30%');await shot('progress-saved');
    await page.clock.resume();
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.vc-lesson').count(),1);assert.equal(reads,2);
    assert.equal(await page.locator('.vc-progress-value').textContent(),'30%','coverage persists reload');
    await page.locator('.vc-lesson .vc-save').click();
    await page.locator('.vc-empty').waitFor();assert.equal(await page.locator('.vc-lesson').count(),0);
    await page.locator('.vc-nav a').filter({hasText:'Tutte le lezioni'}).click();await page.locator('.vc-group').first().waitFor();
    await page.locator('.vc-favorites').click();await page.locator('.vc-empty').waitFor();await shot('empty');
    failed=true;await page.reload({waitUntil:'networkidle'});await page.locator('[data-action="retry"]').waitFor();assert.equal(reads,3);
    failed=false;await page.locator('[data-action="retry"]').click();await page.locator('.vc-empty h3').waitFor();assert.equal(reads,4);
    await page.locator('#study-back').click();await page.locator('.vc-group').first().waitFor();await page.locator('#study-back').click();await page.locator('.vc-hub-quiz').click();await page.locator('.study-chapter').first().waitFor();assert.equal(await page.locator('.study-chapter').count(),25);
    await page.locator('#study-back').click();await page.locator('#study-hub').waitFor({state:'visible'});
    // One representative keyboard/long-title/sample-cover and session-expiry flow.
    if(!native && width===375){
      await page.locator('.vc-hub-video').focus();await page.keyboard.press('Enter');await page.locator('.vc-group').first().waitFor();
      await page.locator('.vc-group').nth(1).focus();await page.keyboard.press('Enter');await page.locator('.vc-lesson').first().waitFor();await shot('danger-lessons');
      assert.equal(await page.locator('.vc-lesson img[src$="section-theory.webp"]').count(),5);
      assert.equal(await page.locator('.vc-lesson img[src$="section-quiz.webp"]').count(),3);
      await page.locator('.vc-lesson-link').first().click();await page.locator('.vc-play').waitFor();
      apiBlocked=true;await page.locator('.vc-play').click();await page.locator('#vc-player-status').filter({hasText:'il progresso non si aggiorna'}).waitFor();
      assert.equal(await page.locator('.vc-progress-value').textContent(),'—');await shot('player-unavailable');
      apiBlocked=false;await page.locator('#study-back').click();await page.locator('.vc-lesson-link').first().click();
      await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+1000));
      await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('magicbook-video-progress-v1:'))throw new DOMException('Quota','QuotaExceededError');return set.call(this,k,v);};});
      await page.locator('.vc-play').click();await page.waitForFunction(()=>!!window.__videoFixture);await page.clock.runFor(1);await page.clock.runFor(6000);
      await page.locator('.vc-progress-storage-note').waitFor();assert.equal(await page.locator('.vc-progress-value').textContent(),'10%');
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
      await page.clock.runFor(30000);assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('.vc-progress-value').textContent(),'10%');
      await page.evaluate(()=>{delete document.hidden;});await page.clock.resume();await shot('temporary-progress');
      await page.evaluate(()=>{localStorage.removeItem('user_session');window.dispatchEvent(new StorageEvent('storage',{key:'user_session'}));});
      await page.getByRole('heading',{name:'Accedi di nuovo alle lezioni'}).waitFor();assert.equal(await page.locator('.vc-play').count(),0);assert.equal(await page.locator('iframe').count(),0);
    }
    if(!native){await page.goto('http://video.local/studia-quiz?view=figures',{waitUntil:'networkidle'});assert.equal(await page.locator('#study-figures').isVisible(),false);}
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    report.push({native,width,height,reads,frames,apiLoads,watchedPercent:30,pass:true}); console.log('PASS',native?'Android':'web',width);
    await context.close();
  }
} finally { await browser.close();fs.writeFileSync(path.join(out,process.env.QA_WIDTH?`report-${process.env.QA_WIDTH}.json`:'report.json'),JSON.stringify(report,null,2)); }
