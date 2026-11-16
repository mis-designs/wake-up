// Local assets and mocked API responses only; never contacts production.
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
 for(const [width,height,native] of [[320,740,false],[375,812,false],[430,844,false],[1440,900,false]]){
  if(process.env.QA_WIDTH && +process.env.QA_WIDTH!==width)continue;
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<800,serviceWorkers:'block',reducedMotion:'reduce',...(native?{userAgent:'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3'}:{})});
  const errors=[],api=[],missing=[];let failArtwork=false;
  await ctx.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.hostname!=='actions.local')return r.fulfill({status:503,body:''});
   if(u.pathname.startsWith('/api/')){
    api.push(u.pathname);
    if(u.pathname==='/api/getPages')return r.fulfill({json:{success:true,role:'user',accessToken:token,accessTokenExpiresAt:Date.now()+86400000,expiry:'2035-01-01',pages:[],totalPages:0}});
    return r.fulfill({json:{success:true,items:[],results:[],figures:[]}});
   }
   if(u.pathname==='/studia-quiz'||(u.pathname.startsWith('/quiz/') || u.pathname === '/quiz'))return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Destination fixture</title><h1>Destination</h1>'});
   let name=decodeURIComponent(u.pathname).replace(/^\//,'');if(!path.extname(name))name='index.html';
   if(failArtwork&&/easy_video|easy-video|new-class/.test(name))return r.fulfill({status:404,body:''});
   const file=path.join(repo,name);
   if(name.includes('..')||!fs.existsSync(file)||!mime[path.extname(file)]){missing.push(name);return r.fulfill({status:404,body:''});}
   return r.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]});
  });
  await ctx.addInitScript(({phone,token})=>{
   const s={phone,deviceId:'fixture-device-001',role:'user',accessToken:token,accessTokenExpiresAt:Date.now()+86400000,expiry:'2035-01-01',lastValid:Date.now()};
   for(const[k,v]of Object.entries({user_session:JSON.stringify(s),session:JSON.stringify(s),loggedIn:'true',phone,deviceId:s.deviceId,accessToken:token,accessTokenExpiresAt:s.accessTokenExpiresAt,client_auth_reset_version:'2026-04-device-reset-1',whatsapp_group_joined_or_clicked:'true',['whats_new_popup_show_count:mobile-ui-2026-08:'+phone]:'3'}))localStorage.setItem(k,String(v));
   window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__=true;
   let hash=2166136261;for(const c of phone){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619);}
   localStorage.setItem('magicbook.wordLearning.v1.'+(hash>>>0).toString(36),JSON.stringify({lastCompletedAt:Date.now()}));
  },{phone,token});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  const ready=async()=>{
   await page.goto('http://actions.local/home',{waitUntil:'networkidle'});
   await page.locator('#home:not(.hidden)').waitFor();
   if(await page.getByRole('button',{name:'Capito',exact:true}).isVisible())await page.getByRole('button',{name:'Capito',exact:true}).click();
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-app-transition'));
  };
  await ready();
  if(width<821){
   assert.equal(await page.locator('#home .member-learning-actions>.lesson-tool').count(),3);
   const ys=await page.locator('#home .member-link').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().top)));
   assert.equal(new Set(ys).size,1);assert.ok(await page.evaluate(()=>document.querySelector('#webClassButton').getBoundingClientRect().bottom<=document.querySelector('.member-links').getBoundingClientRect().top));
   await page.locator('#webClassButton').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.locator('#quizButton').click();await page.locator('#quizModeOverlay.qms-visible').waitFor();
   await page.keyboard.press('Escape');await page.locator('#quizModeOverlay').waitFor({state:'hidden'});
   assert.ok(page.url().endsWith('/home'));
   assert.equal(await page.evaluate(()=>document.activeElement.id),'quizButton');
   for(const [id,view]of [['webStudyButton','chapters'],['webClassButton','videos']]){
    await page.locator('#'+id).click();await page.waitForURL('**/studia-quiz?view='+view);await ready();
   }
   await page.locator('.member-open').click();await page.locator('#chapters:not(.hidden)').waitFor();
   assert.equal(await page.locator('#chapters .lesson-actions').isVisible(),false);
   assert.equal(await page.locator('#engineBtn').isVisible(),true);
   assert.equal(await page.locator('#chapters>.web-chapter-heading').count(),1);
   assert.ok(await page.evaluate(()=>document.querySelector('#backBtn').getBoundingClientRect().bottom < document.querySelector('#chapters>.web-chapter-heading').getBoundingClientRect().top));
   await page.screenshot({path:path.join(out,`chapters-${width}.png`),fullPage:true});
  }else{assert.equal(await page.locator('#chapters #quizButton').count(),1);assert.equal(await page.locator('.member-learning-actions').isVisible(),false);}
  assert.deepEqual(errors,[]);
  report.push({width,height,native,errors,requests:api.length});console.log(JSON.stringify(report.at(-1)));await ctx.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
}finally{await browser.close();}
