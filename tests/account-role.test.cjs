const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const sandbox={window:{},atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../account-role.js'),'utf8'),sandbox);
const {status}=sandbox.window.AccountRole,now=Date.now();
const token=(data,format)=>{const p=Buffer.from(JSON.stringify(data)).toString('base64url');return format==='magic'?p+'.signature':'header.'+p+'.signature';};
for(const format of ['magic','allbooks'])test(format+': display only current signed-session role claims; expiry and downgrade remove master label',()=>{
 const data={role:'admin',exp:format==='magic'?now+60000:Math.floor((now+60000)/1000)};
 assert.equal(status(token(data,format),now).label,'Admin');
 const master={...data,masterAdminUntil:now+30000,masterAdminRevision:'a'.repeat(64)};
 assert.equal(status(token(master,format),now).label,'Master admin');
 assert.equal(status(token(master,format),now+31000).label,'Admin');
 assert.equal(status(token(master,format),now+61000).label,'');
 assert.equal(status(token({...master,role:'user'},format),now).label,'');
 assert.equal(status(token({...master,masterAdminRevision:''},format),now).label,'Admin');
 assert.equal(status(token({...master,masterAdminUntil:now+8*3600000+500},format),now).label,'Master admin','small server/client clock skew must not hide verified master status');
 assert.equal(status('malformed',now).label,'');
});
