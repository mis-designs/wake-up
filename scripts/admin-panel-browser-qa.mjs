// Real Admin markup/styles/controllers; synthetic records and a local-only transport.
// This fixture never contacts the production app or changes customer records.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const repo = fileURLToPath(new URL("../", import.meta.url));
const out = process.argv[2];
if (!out) throw Error("Supply an output directory");
fs.mkdirSync(out, { recursive: true });
const read = file => fs.readFileSync(path.join(repo, file), "utf8");
const source = read("script.js"), markup = read("index.html");
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const rest = source.slice(start), next = rest.slice(1).search(/^(?:async )?function \w+\(/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
const panel = markup.slice(markup.indexOf('<div id="adminPanel"'), markup.indexOf('<div id="adminUserModal"'));
const functions = ["normalizePhone", "getAdminPhoneKey", "getAdminStatus", "formatAdminDate", "escapeHtml",
  "isAdminPromoUser", "isRenewActionVisible", "getAdminDuplicatePhones", "getAdminRegistrationTime", "mergeAdminPromoUsers",
  "normalizeAdminSearch", "getAdminResponseUsers", "updateAdminDatasetControls", "renderAdminLoading", "getFilteredAdminUsers",
  "updateAdminStats", "renderAdminUserCard", "renderAdminUsers", "setAdminTab", "setAdminMessage",
  "getAdminErrorMessage", "scheduleAdminPhoneSearch", "clearAdminPhoneSearch", "adminLoadAllUsers", "adminRefreshUsers",
  "adminLoadUsers", "adminLoadPromoUsers", "adminRetryPromoUsers", "setupAdminUI", "hasAdminQuizBank"].map(extract).join("\n");
const fixture = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/daisyui.css"><link rel="stylesheet" href="/loading-ui.css"><link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/mobile-experience.css"><link rel="stylesheet" href="/admin-user-editor.css"><link rel="stylesheet" href="/admin-panel.css"><link rel="stylesheet" href="/android-app-theme.css">
</head><body class="admin-mode">${panel}<script>
const ADMIN_EXPIRING_DAYS=16, ADMIN_SEARCH_MIN_DIGITS=6, ADMIN_SEARCH_DEBOUNCE_MS=300, ADMIN_RECENT_LIMIT=10;
const trialGuestMode=false;
const adminState={users:[],tab:'users',query:'',mode:'recent',totalAvailable:null,loading:false,loadVersion:0,searchTimer:null,searchComposing:false,promoLoading:false,promoLoaded:false,promoError:''};
const day=86400000;
const records=Array.from({length:20},(_,i)=>({phone:'39333000'+String(1000+i), expiry:i===4?null:new Date(Date.now()+([90,-40,10,180][i%4]*day)).toISOString(), device1:i%3?'test-device-a':'',device2:i%3===2?'test-device-b':'', Quiz_bank:i%3===0?1:0, createdAt:new Date(Date.now()-i*day).toISOString()}));
records[19]={...records[18], expiry:records[1].expiry};
window.calls=[]; window.actions=[]; window.failAction=''; window.hold=false; window.pending=[];
function isCurrentSessionAdmin(){return true;}
function adminOpenUserModal(mode,user){actions.push({action:mode,phone:user?.phone});}
function adminOpenConfirm(action,user){actions.push({action,phone:user.phone});}
function adminOpenUserWhatsApp(user){actions.push({action:'send',phone:user.phone});}
function showHome(){actions.push({action:'home'});}
async function adminRequest(action,fields={}) {
  calls.push({action,...fields});
  if(window.hold) await new Promise(resolve=>pending.push(resolve));
  if(action===window.failAction)throw Error('service_unavailable');
  if(action==='promo_users')return {success:true,list:[{phone:records[0].phone,isPromo:true,accessSource:'promo'}]};
  const list=action==='recent'?records.slice(0,10):action==='search'?records.filter(r=>r.phone.includes(normalizeAdminSearch(fields.phone))):records;
  return {success:true,list:list.map(r=>({...r})),total:records.length};
}
${functions}
document.getElementById('adminPanel').classList.remove('hidden');setupAdminUI();void adminLoadUsers(false,'recent');
</script></body></html>`;
const browser = await chromium.launch({headless:true,channel:"msedge"});
const reports=[];
try {
  for(const [width,height,native] of [[1920,1080,false],[1515,800,false],[1280,720,false],[1024,768,false],[820,900,false],[640,640,false],[375,812,false],[320,640,false],[375,812,true]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",serviceWorkers:"block"});
    let external=0;const errors=[];
    await context.route("**/*",async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=="admin.local"){external++;return route.fulfill({status:404,body:""});}
      if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:fixture});
      const file=path.resolve(repo,"."+decodeURIComponent(url.pathname));
      if(!file.startsWith(repo)||!fs.existsSync(file))return route.fulfill({status:404,body:""});
      const types={".css":"text/css",".js":"text/javascript",".png":"image/png",".jpg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".woff2":"font/woff2"};
      return route.fulfill({contentType:types[path.extname(file)]||"application/octet-stream",body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto("https://admin.local/");
    await page.waitForFunction(()=>!adminState.loading&&adminState.users.length===10);
    if(native)await page.evaluate(()=>document.documentElement.classList.add('android-webview'));
    const bounds=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      shell:document.querySelector('.admin-shell').getBoundingClientRect().toJSON(),
      row:document.querySelector('.admin-user-card').getBoundingClientRect().toJSON(),
      targets:[...document.querySelectorAll('.admin-action-btn,.admin-action-pill')].map(el=>el.getBoundingClientRect().toJSON()),
      collisions:[...document.querySelectorAll('.admin-user-card')].some(el=>el.scrollWidth>el.clientWidth),
      toolbar:document.querySelector('.admin-toolbar').getBoundingClientRect().toJSON(),
      tabs:document.querySelector('.admin-tabs').getBoundingClientRect().toJSON(),
      tools:document.querySelector('.admin-tools-row').getBoundingClientRect().toJSON(),
      search:document.querySelector('.admin-search-box').getBoundingClientRect().toJSON(),
      actions:document.querySelector('.admin-utility-actions').getBoundingClientRect().toJSON(),
      cards:[...document.querySelectorAll('.admin-user-card')].map(el=>el.getBoundingClientRect().toJSON()),
      style:{
        heading:document.querySelector('.admin-title span').textContent,
        pillRadius:getComputedStyle(document.querySelector('.admin-action-pill')).borderRadius,
        pillBackground:getComputedStyle(document.querySelector('.admin-action-pill')).backgroundImage,
        iconBackground:getComputedStyle(document.querySelector('.admin-action-pill__icon')).backgroundImage,
        cardShadow:getComputedStyle(document.querySelector('.admin-user-card')).boxShadow,
        cardRadius:getComputedStyle(document.querySelector('.admin-user-card')).borderRadius
      }
    }));
    assert.equal(bounds.overflow,false,`Page overflow at ${width}`);
    assert.equal(bounds.collisions,false,`Row overflow at ${width}`);
    assert.ok(bounds.targets.every(r=>r.width>=38&&r.height>=38),"Original action sizes retained");
    if(width>760){assert.ok(bounds.row.width<bounds.shell.width*.55);assert.equal(bounds.cards[0].y,bounds.cards[1].y);}
    else assert.ok(bounds.row.width>bounds.shell.width*.95);
    assert.ok(bounds.tabs.x-bounds.toolbar.x>=15&&bounds.toolbar.right-bounds.tabs.right>=15,'Tabs inset from both edges');
    assert.ok(bounds.tools.x-bounds.toolbar.x>=15&&bounds.toolbar.right-bounds.tools.right>=15,'Search/actions inset from both edges');
    assert.ok(bounds.tools.y-bounds.tabs.bottom>=17,'Gap below filters');
    if(width>1040){assert.ok(bounds.actions.x-bounds.search.right>=19);assert.ok(Math.abs(bounds.actions.y-bounds.search.y)<1);}
    else assert.ok(bounds.actions.y-bounds.search.bottom>=17);
    assert.equal(bounds.style.heading,'Admin Panel');
    assert.equal(bounds.style.pillRadius,'999px');
    assert.match(bounds.style.pillBackground,/linear-gradient/);
    assert.match(bounds.style.iconBackground,/radial-gradient/);
    assert.notEqual(bounds.style.cardShadow,'none');
    assert.equal(bounds.style.cardRadius,'18px');
    assert.equal(await page.locator('.admin-user-card').count(),10);
    assert.equal(await page.locator('#adminSearchClear').isVisible(),false,'Clear is absent without a query');
    assert.equal(await page.locator('#adminStatTotal').innerText(),'10');
    assert.match(await page.locator('#adminDatasetCaption').innerText(),/10 caricati su 20/);
    assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.action)),['recent']);
    await page.screenshot({path:path.join(out,`workspace-${width}${native?'-native':''}.png`),fullPage:true});
    await page.screenshot({path:path.join(out,`viewport-${width}${native?'-native':''}.png`)});
    // All existing row actions retain the correct record; destructive actions only open confirmation.
    const expired=page.locator('.admin-user-card.is-expired').first();
    const phone=await expired.locator('.admin-phone').innerText();
    for(const action of ['edit','renew','send','reset','delete'])await expired.locator(`[data-admin-action="${action}"]`).click();
    assert.deepEqual(await page.evaluate(()=>actions),['edit','renew','send','reset_devices','delete'].map(action=>({action,phone})));
    assert.equal(await page.locator('.admin-user-card.is-active [data-admin-action="renew"]').count(),0);
    assert.equal(await page.evaluate(()=>calls.length),1,'Actions themselves did not save anything');
    await page.locator('#adminTabExpired').click();
    assert.equal(await page.locator('.admin-user-card:not(.is-expired)').count(),0);
    assert.equal(await page.evaluate(()=>calls.length),1,'Local filter makes no request');
    await page.locator('#adminTabExpired').focus();await page.keyboard.press('Home');
    assert.equal(await page.locator('#adminTabUsers').getAttribute('aria-selected'),'true');
    await page.locator('#adminTabPromo').click();
    assert.equal(await page.locator('.admin-requires-all').count(),1);
    assert.equal(await page.evaluate(()=>calls.length),1,'Promo requires explicit full-list permission');
    await page.screenshot({path:path.join(out,`requires-all-${width}${native?'-native':''}.png`)});
    await page.locator('#adminLoadAllUsers').click();
    await page.waitForFunction(()=>adminState.promoLoaded);
    assert.equal(await page.locator('.admin-user-card.is-promo').count(),1);
    assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.action)),['recent','list','promo_users']);
    await page.locator('#adminTabDuplicates').click();
    assert.equal(await page.locator('.admin-duplicate-group').count(),1);
    assert.equal(await page.locator('.admin-user-card').count(),2);
    await page.screenshot({path:path.join(out,`duplicates-${width}${native?'-native':''}.png`),fullPage:true});
    await page.locator('#adminTabPromo').click();
    assert.equal(await page.evaluate(()=>calls.length),3,'Promo is not reloaded per click');
    const input=page.locator('#adminSearchInput');
    await input.fill('333');await input.press('Enter');
    assert.equal(await page.locator('.admin-empty').count(),1);
    assert.equal(await page.evaluate(()=>calls.length),3,'Below six digits never searches');
    await input.fill('3330001000');await input.press('Enter');
    await page.waitForFunction(()=>adminState.mode==='search'&&!adminState.loading);
    assert.equal(await page.locator('.admin-user-card').count(),1);
    assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='search').length),1);
    await input.fill('999999');await input.press('Enter');
    await page.waitForFunction(()=>!adminState.loading&&adminState.mode==='search'&&adminState.users.length===0);
    await page.screenshot({path:path.join(out,`empty-${width}${native?'-native':''}.png`)});
    await page.locator('#adminSearchClear').click();
    await page.waitForFunction(()=>!adminState.loading&&adminState.mode==='recent');
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    await page.evaluate(()=>{window.hold=true;});
    await page.getByRole('button',{name:'Aggiorna la lista corrente'}).click();
    await page.waitForFunction(()=>pending.length===1);
    assert.equal(await page.locator('#adminUserList').getAttribute('aria-busy'),'true');
    assert.equal(await page.locator('#adminLoadAllUsers').isDisabled(),true);
    const loader=await page.locator('.admin-loading .magic-loading-indicator__media').evaluate(el=>{
      const size=el.getBoundingClientRect(),style=getComputedStyle(el),mark=getComputedStyle(el,'::after');
      return {width:size.width,height:size.height,radius:style.borderRadius,markHeight:parseFloat(mark.height)};
    });
    assert.ok(loader.width>=64&&loader.width<=88&&loader.height===loader.width,'Shared panel loader stays compact');
    assert.equal(loader.radius,'0px','White loading surface remains unframed');
    assert.ok(loader.markHeight>15,'Reduced-motion marker does not collapse into a line');
    await page.screenshot({path:path.join(out,`loading-${width}${native?'-native':''}.png`)});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.screenshot({path:path.join(out,`loading-motion-${width}${native?'-native':''}.png`)});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>{window.hold=false;pending.shift()();});
    await page.waitForFunction(()=>!adminState.loading);
    await page.evaluate(()=>{window.failAction='recent';});
    await page.getByRole('button',{name:'Aggiorna la lista corrente'}).click();
    await page.waitForFunction(()=>!adminState.loading&&document.querySelector('#adminMessage').classList.contains('is-error'));
    assert.equal(await page.locator('.admin-user-card').count(),10,'Existing records survive a failed refresh');
    await page.screenshot({path:path.join(out,`error-${width}${native?'-native':''}.png`)});
    await page.evaluate(()=>{window.failAction='';});
    await page.getByRole('button',{name:'Aggiorna la lista corrente'}).click();
    await page.waitForFunction(()=>!adminState.loading&&!document.querySelector('#adminMessage').classList.contains('is-error'));
    // Stale transport completion cannot replace a more recent search result.
    await page.evaluate(()=>{window.hold=true;void adminLoadUsers(true,'recent');});
    await page.waitForFunction(()=>pending.length===1);
    await page.evaluate(()=>{window.hold=false;});
    await input.fill('3330001002');await input.press('Enter');
    await page.waitForFunction(()=>adminState.mode==='search'&&!adminState.loading);
    await page.evaluate(()=>pending.shift()());
    assert.equal(await page.locator('.admin-user-card').count(),1);
    assert.equal(await page.locator('.admin-phone').innerText(),'393330001002');
    await page.locator('#adminSearchClear').click();await page.waitForFunction(()=>!adminState.loading);
    // Very long/malformed server text is escaped and wraps instead of breaking columns.
    await page.evaluate(()=>{adminState.users=[{...records[0],phone:'393330001001'.repeat(6)}];renderAdminUsers();});
    assert.equal(await page.locator('.admin-user-card').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.evaluate(()=>{adminState.users=records.slice(0,10);renderAdminUsers();});
    await page.emulateMedia({forcedColors:'active'});
    await page.screenshot({path:path.join(out,`forced-${width}${native?'-native':''}.png`)});
    const primary=await page.locator('.admin-action-pill--user').evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
    assert.notEqual(primary.fg,primary.bg);
    await page.emulateMedia({forcedColors:'none',colorScheme:'dark'});
    assert.equal(await page.locator('#adminSearchInput').isVisible(),true);
    assert.deepEqual(errors,[]);
    assert.equal(external,0,'No production or external requests');
    reports.push({width,height,native,bounds,requests:await page.evaluate(()=>calls),errors,external});
    await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({passed:reports.length,viewports:reports.map(r=>[r.width,r.height,r.native])}));
} finally {await browser.close();}
