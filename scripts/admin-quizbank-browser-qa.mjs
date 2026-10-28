// Local fixture: actual Admin form, stylesheet, popup owner and submit handlers.
// No production network or real customer writes.
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
const source = read("script.js"), pageSource = read("index.html");
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/^(?:async )?function \w+\(/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
const modal = pageSource.slice(pageSource.indexOf('<div id="adminUserModal"'), pageSource.indexOf('<div id="adminConfirmModal"'));
const functions = ["normalizePhone", "isValidPhoneNumber", "formatDateInput", "setAdminMessage", "getAdminErrorMessage",
  "hasAdminQuizBank", "setAdminUserFormBusy", "adminUpdateUserFormSummary", "adminMarkInvalidPhones", "adminOpenUserModal", "adminCloseUserModal",
  "resetAdminBulkFields", "getAdminBulkEntries", "getExistingAdminUser", "adminSubmitUserModal", "adminSubmitBulkCreate",
  "parseClipboardAdminEntries", "adminFillBulkFromClipboard"].map(extract).join("\n");
const fixture = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/daisyui.css"><link rel="stylesheet" href="/loading-ui.css"><link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/admin-user-editor.css"><link rel="stylesheet" href="/android-app-theme.css"></head><body>
<main><h1>Admin</h1><button id="open" onclick="adminOpenUserModal('create')">Nuovo utente</button><p id="adminMessage"></p></main>
${modal}<script src="/app-popup.js"></script><script>
const adminState = {users:[]};
window.calls=[]; window.refreshes=0; window.failPhone=""; window.hold=false;
function isCurrentSessionAdmin(){return true;}
function getAdminPhoneKey(value){return normalizePhone(value);}
function showAdminDuplicateUsers(){}
async function adminLoadUsers(){window.refreshes++;}
async function adminRequest(action, fields) {
  calls.push({action,...fields});
  if(window.hold) await new Promise(resolve=>window.release=resolve);
  if(fields.phone===window.failPhone) throw Error("quizbank_column_missing");
  if(action==="create") adminState.users.push({...fields});
  else if(action==="update") {
    const user=adminState.users.find(user=>user.phone===fields.phone);
    if(user) Object.assign(user,fields,{phone:fields.newPhone||fields.phone});
  }
  return {success:true,Quiz_bank:fields.Quiz_bank};
}
${functions}
document.getElementById("adminUserForm").addEventListener("submit",event=>{event.preventDefault();void adminSubmitUserModal();});
document.getElementById("adminClipboardBtn").addEventListener("click",adminFillBulkFromClipboard);
document.getElementById("adminUserForm").addEventListener("input",adminUpdateUserFormSummary);
document.getElementById("adminUserForm").addEventListener("change",adminUpdateUserFormSummary);
</script></body></html>`;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const reports=[];
try {
  for(const [width,height,native] of [[1525,717,false],[1920,1080,false],[1440,900,false],[375,812,false],[320,640,false],[375,812,true],[640,450,false],[760,358,false]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",serviceWorkers:"block"});
    let external=0; const errors=[];
    await context.route("**/*",async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=="admin.local"){external++;return route.fulfill({status:404,body:""});}
      if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:fixture});
      const file=path.resolve(repo,"."+decodeURIComponent(url.pathname));
      if(!file.startsWith(repo)||!fs.existsSync(file))return route.fulfill({status:404,body:""});
      const types={".css":"text/css",".js":"text/javascript",".png":"image/png",".svg":"image/svg+xml",".woff2":"font/woff2"};
      return route.fulfill({contentType:types[path.extname(file)]||"application/octet-stream",body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto("https://admin.local/");
    if(native)await page.evaluate(()=>document.documentElement.classList.add("android-webview"));
    await page.getByRole("button",{name:"Nuovo utente",exact:true}).click();
    await page.waitForFunction(()=>document.activeElement===document.querySelector(".admin-bulk-phone"));
    const checks=page.locator(".admin-bulk-quizbank");
    assert.equal(await checks.count(),6);
    for(let i=0;i<6;i++)assert.equal(await checks.nth(i).isChecked(),false);
    await page.locator(".admin-bulk-phone").nth(0).fill("3331112222");
    await page.locator(".admin-bulk-phone").nth(1).fill("3332223333");
    await checks.nth(0).focus(); await page.keyboard.press("Space");
    assert.equal(await checks.nth(0).isChecked(),true);
    assert.match(await page.locator("#adminUserFormSummary").innerText(),/2 numeri inseriti · 1 con QuizBank/);
    assert.equal(await page.evaluate(()=>calls.length),0,"Toggle makes no request");
    const bounds=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      modal:document.querySelector(".admin-modal-card").getBoundingClientRect().toJSON(),
      labels:[...document.querySelectorAll(".admin-bulk-qb")].map(el=>el.getBoundingClientRect().toJSON()),
      footer:document.querySelector("#adminUserModal .admin-modal-actions").getBoundingClientRect().toJSON(),
      body:document.querySelector(".admin-editor-body").getBoundingClientRect().toJSON(),
      lastRow:document.querySelector(".admin-bulk-row:last-child").getBoundingClientRect().toJSON(),
      inert:document.querySelector("main").inert
    }));
    assert.equal(bounds.overflow,false); assert.equal(bounds.inert,true);
    assert.ok(bounds.modal.x>=0 && bounds.modal.right<=width && bounds.modal.bottom<=height);
    assert.ok(bounds.labels.every(r=>r.width>=44&&r.height>=44));
    assert.ok(bounds.footer.bottom<=height && bounds.footer.y>=0,"Actions stay inside viewport");
    if(width>=920 && height>=717) {
      assert.ok(bounds.modal.width>=900,"Desktop worksheet is deliberately wide");
      assert.ok(bounds.lastRow.bottom<=bounds.footer.top,"All six rows visible on a laptop");
    }
    await page.locator("#adminModalSave").focus(); await page.keyboard.press("Tab");
    assert.equal(await page.locator(".admin-modal-close").evaluate(el=>document.activeElement===el),true,"Focus cycles within modal");
    await checks.nth(0).focus();
    await page.screenshot({path:path.join(out,`create-${width}x${height}${native?"-native":""}.png`)});
    await page.evaluate(()=>{window.hold=true;});
    await page.locator("#adminModalSave").click();
    await page.waitForFunction(()=>calls.length===1);
    assert.equal(await checks.nth(0).isDisabled(),true);
    assert.equal(await checks.nth(0).evaluate(el=>getComputedStyle(el).opacity),"0","Native control stays visually hidden while saving");
    await page.screenshot({path:path.join(out,`pending-${width}${native?"-native":""}.png`)});
    await page.evaluate(()=>adminSubmitUserModal());
    assert.equal(await page.evaluate(()=>calls.length),1,"Duplicate submit ignored");
    await page.evaluate(()=>{window.hold=false;window.release();});
    await page.waitForFunction(()=>document.getElementById("adminUserModal").classList.contains("hidden"));
    assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.Quiz_bank)),[1,0]);
    assert.equal(await page.evaluate(()=>refreshes),1);
    await page.evaluate(()=>adminOpenUserModal("edit",adminState.users[0]));
    assert.equal(await page.locator("#adminModalQuizBank").isChecked(),true);
    await page.locator("#adminModalQuizBank").uncheck();
    await page.screenshot({path:path.join(out,`edit-${width}${native?"-native":""}.png`)});
    await page.locator("#adminModalSave").click();
    await page.waitForFunction(()=>document.getElementById("adminUserModal").classList.contains("hidden"));
    assert.equal(await page.evaluate(()=>calls.at(-1).Quiz_bank),0);
    await page.evaluate(()=>adminOpenUserModal("edit",adminState.users[0]));
    assert.equal(await page.locator("#adminModalQuizBank").isChecked(),false,"Reload saved revocation");
    await page.locator("#adminModalPhone").focus();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(()=>document.querySelector("main").inert),false);
    // Partial failure must retain the unresolved phone, days and checked flag.
    await page.locator("#open").click();
    await page.waitForFunction(()=>document.activeElement===document.querySelector(".admin-bulk-phone"));
    assert.equal(await checks.nth(0).isChecked(),false);
    await page.locator(".admin-bulk-phone").nth(0).fill("3334445555");
    await page.locator(".admin-bulk-phone").nth(1).fill("3335556666");
    await checks.nth(1).check();
    await page.evaluate(()=>window.failPhone="393335556666");
    await page.locator("#adminModalSave").click();
    await page.waitForFunction(()=>!document.getElementById("adminModalSave").disabled);
    assert.equal(await page.locator(".admin-bulk-phone").nth(0).inputValue(),"");
    assert.equal(await page.locator(".admin-bulk-phone").nth(1).inputValue(),"3335556666");
    assert.equal(await checks.nth(1).isChecked(),true);
    assert.match(await page.locator("#adminUserFormMessage").innerText(),/Quiz_bank/);
    assert.equal(await page.locator(".admin-editor-body").evaluate(el=>el.scrollTop),0,"Server error is brought into view");
    await page.screenshot({path:path.join(out,`error-${width}${native?"-native":""}.png`)});
    await page.evaluate(()=>{window.failPhone="";});
    await page.locator("#adminModalSave").click();
    await page.waitForFunction(()=>document.getElementById("adminUserModal").classList.contains("hidden"));
    assert.equal(await page.evaluate(()=>calls.filter(c=>c.phone==="393334445555").length),1,"Confirmed rows not replayed");
    // Local validation is accessible, retains inputs, and cannot write anything.
    await page.locator("#open").click();
    await page.waitForFunction(()=>document.activeElement===document.querySelector(".admin-bulk-phone"));
    const callCount=await page.evaluate(()=>calls.length);
    await page.locator(".admin-bulk-phone").nth(0).fill("123");
    await page.locator("#adminModalSave").click();
    assert.equal(await page.locator(".admin-bulk-phone").nth(0).getAttribute("aria-invalid"),"true");
    assert.equal(await page.locator(".admin-bulk-phone").nth(0).evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.evaluate(()=>calls.length),callCount);
    await page.locator(".admin-bulk-phone").nth(0).fill("3337778888");
    assert.equal(await page.locator(".admin-bulk-phone").nth(0).getAttribute("aria-invalid"),null);
    await page.emulateMedia({forcedColors:"active"});
    await checks.nth(0).check(); assert.equal(await checks.nth(0).isChecked(),true);
    const forcedStyle=await page.locator("#adminModalSave").evaluate(el=>{
      const style=getComputedStyle(el);return {color:style.color,background:style.backgroundColor,textFill:style.webkitTextFillColor,content:el.textContent,classes:el.className};
    });
    assert.notEqual(forcedStyle.color,forcedStyle.background,"Forced-colors submit label remains contrasting");
    await page.screenshot({path:path.join(out,`forced-colors-${width}${native?"-native":""}.png`)});
    await page.emulateMedia({forcedColors:"none",colorScheme:"dark"});
    assert.equal(await page.locator("#adminModalSave").isVisible(),true);
    await page.emulateMedia({colorScheme:"light"});
    await page.locator(".admin-bulk-phone").nth(0).focus(); await page.keyboard.press("Escape");
    // Legacy / blank flags remain unchecked; renewal does not expose the flag.
    await page.evaluate(()=>adminOpenUserModal("edit",{phone:"393331112222"}));
    assert.equal(await page.locator("#adminModalQuizBank").isChecked(),false);
    await page.locator("#adminModalPhone").focus();
    await page.keyboard.press("Escape");
    await page.evaluate(()=>adminOpenUserModal("renew",{phone:"393331112222",Quiz_bank:1}));
    assert.equal(await page.locator("#adminQuizBankField").isVisible(),false);
    await page.screenshot({path:path.join(out,`renew-${width}${native?"-native":""}.png`)});
    await page.locator("#adminModalSave").click();
    await page.waitForFunction(()=>document.getElementById("adminUserModal").classList.contains("hidden"));
    assert.equal(await page.evaluate(()=>Object.hasOwn(calls.at(-1),"Quiz_bank")),false);
    assert.deepEqual(errors,[]);
    assert.equal(external,0,"No production or third-party request in the fixture");
    reports.push({width,height,native,bounds,forcedStyle,calls:await page.evaluate(()=>calls.length),external,errors,passed:true});
    await context.close();
  }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,"browser-report.json"),JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports.map(({width,height,native,passed})=>({width,height,native,passed}))));
