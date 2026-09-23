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
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<=768,serviceWorkers:'block',reducedMotion:'reduce',...(native?{userAgent:'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3 MagicBookVideo/1'}:{})});
    let reads=0,frames=0,apiLoads=0,failed=false,apiBlocked=false,releaseCatalog;
    let catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
    const errors=[],missing=[];
    await context.route('**/*', async route=>{
      const url=new URL(route.request().url());
      if(url.href==='https://www.youtube.com/iframe_api'){apiLoads++;return route.fulfill({status:apiBlocked?503:200,contentType:'text/javascript',body:apiBlocked?'':fs.readFileSync(path.join(repo,'scripts/video-player-fixture.js'))});}
      if(url.hostname==='www.youtube-nocookie.com'){frames++;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Mock player</title><body style="color:white;background:#111;font:24px Arial">YouTube player fixture</body>'});}
      if(url.hostname!=='video.local')return route.fulfill({status:503,body:''});
      if(url.pathname==='/api/quiz'){
        const action=url.searchParams.get('action');
        if(action==='getVideoClasses'){reads++;if(catalogGate)await catalogGate;return route.fulfill({status:failed?503:200,json:failed?{error:'fixture_failure'}:{ok:true,catalog:getVideoClassCatalog()}});}
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
    assert.equal(await page.locator('.study-header small').isVisible(),false);
    assert.equal(await page.locator('.study-practice-link').isVisible(),false);
    assert.equal(await page.locator('#study-title').textContent(),'Studia');
    const hubLayout = await page.evaluate(() => {
      const box = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height}; };
      return {video:box('.vc-hub-video'),quiz:box('.vc-hub-quiz'),copy:box('.vc-hub-video .vc-hub-copy'),image:box('.vc-hub-art'),header:box('#study-back')};
    });
    if(width<=650) {
      assert.ok(hubLayout.copy.right <= hubLayout.image.left + (hubLayout.image.right-hubLayout.image.left)*.59,'copy stays in the quiet left of the landscape, away from the face');
      assert.ok(hubLayout.quiz.top >= hubLayout.video.bottom,'distinct stacked choices');
      assert.ok(hubLayout.quiz.bottom <= height,'both choices visible on entry at normal font size');
      assert.ok(hubLayout.header.left <= 20,'Back aligned with phone gutter');
    } else assert.ok(Math.abs(hubLayout.video.top-hubLayout.quiz.top)<1,'desktop keeps two choices side by side');
    const fullArtwork = await page.locator('.vc-hub-art').evaluate(el=>{
      const image = el.getBoundingClientRect(), card = el.closest('a').getBoundingClientRect(), css = getComputedStyle(el);
      const cardNode=el.closest('a'), overlay=getComputedStyle(cardNode,'::before');
      return {width:image.width,height:image.height,cardWidth:card.width,ratio:el.naturalWidth/el.naturalHeight,fit:css.objectFit,
        overlay:overlay.backgroundImage,pointerEvents:overlay.pointerEvents,shadeLayer:Number(overlay.zIndex),imageFilter:css.filter,
        copyLayer:Number(getComputedStyle(cardNode.querySelector('.vc-hub-copy')).zIndex),
        textColor:getComputedStyle(cardNode.querySelector('h3')).color,ctaColor:getComputedStyle(cardNode.querySelector('.vc-hub-cta')).color,
        background:getComputedStyle(cardNode).backgroundColor};
    });
    assert.ok(Math.abs(fullArtwork.width-fullArtwork.cardWidth+2)<1,'artwork spans the whole card');
    assert.ok(Math.abs(fullArtwork.width/fullArtwork.height-fullArtwork.ratio)<.003,'original landscape aspect ratio, no crop or distortion');
    assert.equal(fullArtwork.fit,'contain'); assert.equal(fullArtwork.imageFilter,'none');
    assert.match(fullArtwork.overlay,/linear-gradient\(90deg,/,'left-to-right shade overlays the intact photo');
    assert.match(fullArtwork.overlay,/rgba\(0, 0, 0, 0\) 65%\)/,'face area remains unshaded');
    assert.equal(fullArtwork.pointerEvents,'none','shade cannot intercept navigation');
    assert.ok(fullArtwork.copyLayer>fullArtwork.shadeLayer,'labels stay above the shade');
    assert.equal(fullArtwork.textColor,'rgb(255, 255, 255)');assert.equal(fullArtwork.ctaColor,'rgb(103, 245, 40)');
    assert.equal(fullArtwork.background,'rgb(255, 255, 255)','no dark or native-blue filler panel');
    const artwork = JSON.parse(fs.readFileSync(path.join(repo,'assets/video-class/card-artwork.json'),'utf8'));
    assert.equal(await page.locator('.vc-hub-art').getAttribute('src'),artwork.url);
    await page.locator('.vc-hub-video').click();
    await page.locator('.vc-loading').waitFor();
    // Hold the only catalogue read to inspect the real animated loader, not just source classes.
    await page.emulateMedia({reducedMotion:'no-preference'});
    const loading = await page.locator('.vc-loading .magic-loading-indicator__media').evaluate(el => {
      const c = getComputedStyle(el), b = el.getBoundingClientRect();
      return {width:b.width,height:b.height,radius:parseFloat(c.borderRadius),animation:c.animationName,transform:c.transform};
    });
    assert.ok(loading.width>=64 && loading.width<=88,JSON.stringify(loading));
    assert.equal(loading.height,loading.width); assert.ok(loading.radius>=14);
    assert.equal(loading.animation,'none'); assert.equal(loading.transform,'none');
    await shot('loading');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.vc-loading img').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    assert.equal(reads,1); releaseCatalog(); catalogGate=null;
    await page.locator('.vc-group').first().waitFor();
    assert.equal(reads,1);assert.equal(frames,0);assert.equal(await page.locator('.vc-group').count(),27);
    assert.equal(await page.locator('#vc-heading').count(),1);
    assert.equal(await page.locator('#vc-chapters-heading').textContent(),'Capitoli');
    assert.equal(await page.getByText('Capitoli nell’ordine del documento studenti.').count(),0);
    await shot('catalog');
    await page.keyboard.press('Tab'); await page.locator('.vc-group').first().focus();
    const chapterFocus = await page.locator('.vc-group').first().evaluate(el=>({outline:getComputedStyle(el).outlineStyle,arrow:getComputedStyle(el.querySelector('.vc-group-arrow')).backgroundColor}));
    assert.equal(chapterFocus.outline,'solid');assert.notEqual(chapterFocus.arrow,'rgba(0, 0, 0, 0)');
    assert.equal(reads,1,'focus/hover never fetch chapter details');
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
    if(width===375) {
      await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
      await shot('hub-large-text');
      const clipped = await page.locator('.vc-hub-copy :is(h3,p,span)').evaluateAll(elements=>elements.filter(el=>getComputedStyle(el).display!=='none' && el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));
      assert.deepEqual(clipped,[],'enlarged text must wrap, not be clipped by a card');
      await page.evaluate(()=>{document.documentElement.style.fontSize='';});
      await page.emulateMedia({forcedColors:'active'});await shot('hub-high-contrast');
      assert.equal(await page.locator('.vc-hub-video').evaluate(el=>getComputedStyle(el,'::before').display),'none','system contrast uses a readable text surface instead of the gradient');
      await page.emulateMedia({forcedColors:'none'});
      // A broken decorative portrait leaves both route names/actions operable.
      await page.locator('.vc-hub-art').evaluate(el=>{el.src='data:image/png;base64,invalid';});
      await page.locator('.vc-hub-quiz').click();await page.locator('.study-chapter').first().waitFor();
      await page.locator('#study-back').click();await page.locator('#study-hub').waitFor({state:'visible'});
      await page.locator('.vc-hub-art').evaluate((el,url)=>{el.src=url;},artwork.url);
      assert.equal(reads,4,'presentation and image failure do not add API reads');
    }
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
