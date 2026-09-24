// Local fixture: public files + mocked API only, never production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.gif':'image/gif','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const phone='3310000000',token='test.'+Buffer.from(JSON.stringify({phone,role:'user',exp:2208988800})).toString('base64url')+'.fixture';
const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
try {
 for(const [width,height,native,fallback] of [[320,568,false,false],[375,812,false,false],[430,844,false,false],[740,360,false,false],[768,1024,false,false],[1440,900,false,false],[1920,1080,false,false],[375,812,false,true],[375,812,true,false]]){
  if(process.env.QA_WIDTH && +process.env.QA_WIDTH!==width)continue;
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<800,serviceWorkers:'block',...(native?{userAgent:'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3'}:{})});
  const errors=[];
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='actions.local')return route.fulfill({status:503,body:''});
   if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/getPages'?{success:true,role:'user',accessToken:token,accessTokenExpiresAt:Date.now()+86400000,expiry:'2035-01-01',pages:[],totalPages:0}:{success:true,items:[],results:[],figures:[]}});
   let name=decodeURIComponent(u.pathname).replace(/^\//,'');if(!path.extname(name))name='index.html';
   const file=path.join(repo,name);
   if(name.includes('..')||!fs.existsSync(file)||!mime[path.extname(file)])return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]});
  });
  await ctx.addInitScript(({phone,token,fallback})=>{
   const s={phone,deviceId:'fixture-device-001',role:'user',accessToken:token,accessTokenExpiresAt:Date.now()+86400000,expiry:'2035-01-01',lastValid:Date.now()};
   for(const[k,v]of Object.entries({user_session:JSON.stringify(s),session:JSON.stringify(s),loggedIn:'true',phone,deviceId:s.deviceId,accessToken:token,accessTokenExpiresAt:s.accessTokenExpiresAt,client_auth_reset_version:'2026-04-device-reset-1',whatsapp_group_joined_or_clicked:'true',['whats_new_popup_show_count:mobile-ui-2026-08:'+phone]:'3'}))localStorage.setItem(k,String(v));
   window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__=true;
   let hash=2166136261;for(const c of phone){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619);}
   localStorage.setItem('magicbook.wordLearning.v1.'+(hash>>>0).toString(36),JSON.stringify({lastCompletedAt:Date.now()}));
   if(fallback){const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){if(this.classList.contains('web-action-core'))return null;return original.apply(this,args);};}
   window.__coreFrames=[];
   const draw=WebGLRenderingContext.prototype.drawArrays;
   WebGLRenderingContext.prototype.drawArrays=function(...args){if(this.canvas.classList.contains('web-action-core'))window.__coreFrames.push(performance.now());return draw.apply(this,args);};
  },{phone,token,fallback});
  const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://actions.local/magic-book',{waitUntil:'networkidle'});
  await page.locator('#chapters:not(.hidden)').waitFor();
  if(await page.getByRole('button',{name:'Capito',exact:true}).isVisible())await page.getByRole('button',{name:'Capito',exact:true}).click();
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-app-transition'));
  const shot=async label=>page.screenshot({path:path.join(out,`${native?'native':fallback?'fallback':'web'}-${width}-${label}.png`),fullPage:true,animations:'allow'});
  if(native){
   assert.equal(await page.locator('.web-action-core').count(),0);
   assert.equal(await page.locator('.web-action-footer').isVisible(),false);
   assert.equal(await page.locator('.native-actions [data-native-action]').count(),6);
   await shot('unchanged');
  }else{
   await page.locator('.web-action-footer').scrollIntoViewIfNeeded();
   await page.waitForTimeout(1100);
   assert.equal(await page.locator('#chapters').getAttribute('data-action-motion'),'running');
   const canvas=page.locator('.web-action-core');
   const geometry=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('#chapters .lesson-tool')].filter(e=>e.getBoundingClientRect().width);
    const footer=document.querySelector('.web-action-footer').getBoundingClientRect();
    const board=getComputedStyle(document.querySelector('#chapters .lesson-board'));
    return {buttons:buttons.map(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,shadow:s.boxShadow,color:s.color};}),footerTop:footer.top,boardOverflow:board.overflow,overflow:document.documentElement.scrollWidth>innerWidth+1,logo:document.querySelector('.web-action-signature img').naturalWidth};
   });
   assert.equal(geometry.buttons.length,3);assert.equal(geometry.overflow,false);assert.equal(geometry.boardOverflow,'visible');assert.ok(geometry.logo>0);
   for(const b of geometry.buttons){assert.ok(b.height>=44&&b.width>=44&&b.x>=8&&b.right<=width-8,JSON.stringify(geometry));assert.notEqual(b.shadow,'none');}
   assert.ok(geometry.footerTop-Math.max(...geometry.buttons.map(b=>b.bottom))>=30,JSON.stringify(geometry));
   if(!fallback){
    await page.waitForFunction(()=>window.__coreFrames.length>2);
    assert.equal(await canvas.isVisible(),true);
    const intervals=await page.evaluate(()=>window.__coreFrames.slice(1).map((n,i)=>n-window.__coreFrames[i]).filter(n=>n>1));
    // Draw-call timings can bunch after a stalled software GPU; verify the
    // sustained budget rather than assuming wall-clock callbacks are uniform.
    assert.ok(intervals.reduce((a,b)=>a+b,0)/intervals.length>=1000/25,JSON.stringify(intervals));
   }else assert.equal(await canvas.isVisible(),false);
   await shot('liquid');
   const button=page.locator('#webActionMotionToggle');
   await button.focus();await page.keyboard.press('Enter');
   assert.equal(await button.getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#chapters').getAttribute('data-action-motion'),'paused');
   let frames=await page.evaluate(()=>window.__coreFrames.length);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.__coreFrames.length),frames);
   await page.keyboard.press('Enter');
   if(width===375&&!fallback){
    // Actual modal makes the decorative background inert; closing resumes it.
    await page.locator('#quizButton').click();await page.locator('#quizModeOverlay.qms-visible').waitFor();
    assert.equal(await page.locator('#chapters').getAttribute('data-action-motion'),'paused');
    await page.keyboard.press('Escape');await page.locator('#quizModeOverlay').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.getElementById('chapters').dataset.actionMotion==='running');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('#chapters').getAttribute('data-action-motion'),'paused');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await page.evaluate(()=>document.documentElement.setAttribute('data-native-motion-paused',''));
    await page.waitForFunction(()=>document.getElementById('chapters').dataset.actionMotion==='paused');
    await page.evaluate(()=>document.documentElement.removeAttribute('data-native-motion-paused'));
    await page.evaluate(()=>{window.__lose=document.querySelector('.web-action-core').getContext('webgl').getExtension('WEBGL_lose_context');window.__lose?.loseContext();});
    await canvas.waitFor({state:'hidden'});await page.waitForTimeout(200);
    await page.evaluate(()=>window.__lose?.restoreContext());await canvas.waitFor({state:'visible'});
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert.equal(await canvas.isVisible(),false);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await canvas.waitFor({state:'visible'});
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>document.getElementById('chapters').dataset.actionMotion==='paused').catch(async error=>{
    console.log(JSON.stringify(await page.evaluate(()=>({motion:document.getElementById('chapters').dataset.actionMotion,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:document.hidden,canvasHidden:document.querySelector('.web-action-core').hidden,toggleHidden:document.getElementById('webActionMotionToggle').hidden}))),errors);throw error;
   });
   assert.equal(await canvas.isVisible(),false);assert.equal(await button.isVisible(),false);
   assert.equal(await page.locator('#quizButton').evaluate(e=>getComputedStyle(e).animationName),'none');
   await shot('reduced');
   await page.emulateMedia({forcedColors:'active'});await shot('contrast');
   assert.equal(await canvas.isVisible(),false);
  }
  assert.deepEqual(errors,[]);report.push({width,height,native,fallback,errors});console.log(JSON.stringify(report.at(-1)));await ctx.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
}finally{await browser.close();}
