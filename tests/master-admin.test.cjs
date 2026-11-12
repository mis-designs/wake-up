const test=require('node:test'),assert=require('node:assert/strict');
const master=require('../lib/master-admin.cjs');
const code='MasterVideoFixtureOnly1234567890AB';
process.env.master_admin=code;process.env.SESSION_SECRET='fixture-session';
test('ordinary admin login remains unchanged and master needs real admin authentication',()=>{
 assert.deepEqual(master.loginClaims({isAdmin:true}),{});
 assert.throws(()=>master.loginClaims({code,isAdmin:false}),/master_admin_forbidden/);
 assert.throws(()=>master.loginClaims({code:'wrong',isAdmin:true}),/master_admin_invalid/);
 assert.throws(()=>master.loginClaims({code:{toString:()=>code},isAdmin:true}),/master_admin_invalid/);
});
test('signed-token claims contain neither the secret nor an unkeyed credential digest',()=>{
 const claims=master.loginClaims({code,isAdmin:true,now:1000});
 assert.equal(master.isMaster({...claims,role:'admin'},1001),true);
 assert.equal(master.isMaster({...claims,role:'user'},1001),false);
 assert.equal(master.isMaster({role:'admin',masterAdmin:true},1001),false);
 assert.ok(!JSON.stringify(claims).includes(code));
});
test('renewal preserves deadline; expiry, rotation and removal revoke authorization',()=>{
 const payload={role:'admin',...master.loginClaims({code,isAdmin:true,now:1000})};
 assert.deepEqual(master.preserveClaims(payload,2000),{masterAdminUntil:payload.masterAdminUntil,masterAdminRevision:payload.masterAdminRevision});
 assert.equal(master.isMaster(payload,payload.masterAdminUntil),false);
 process.env.master_admin=code+'rotated';assert.equal(master.isMaster(payload,2000),false);assert.deepEqual(master.preserveClaims(payload,2000),{});
 delete process.env.master_admin;assert.equal(master.isMaster(payload,2000),false);assert.throws(()=>master.loginClaims({code,isAdmin:true}),/not_configured/);
 process.env.master_admin=code;
});

test('configured 20–30 character keys and symbols work; invalid configuration is distinct from a wrong entry',()=>{
 const original=process.env.master_admin;
 try {
  for(const key of ['Ab12'.repeat(5),'Cd34'.repeat(6),'Ef56'.repeat(7),'Gh78'.repeat(7)+'IJ','Aa!_-9'.repeat(4)]) {
   process.env.master_admin=key;
   const claims=master.loginClaims({code:key,isAdmin:true});
   assert.equal(master.isMaster({...claims,role:'admin'}),true);
   assert.throws(()=>master.loginClaims({code:key+'wrong',isAdmin:true}),/master_admin_invalid/);
   assert.throws(()=>master.loginClaims({code:key,isAdmin:false}),/master_admin_forbidden/);
  }
  for(const key of ['x'.repeat(19),'x'.repeat(257),'a'.repeat(20)+' ','a'.repeat(20)+'\n']) {
   process.env.master_admin=key;
   assert.throws(()=>master.loginClaims({code:key,isAdmin:true}),/master_admin_configuration_invalid/);
   assert.equal(master.isMaster({role:'admin',masterAdminUntil:Date.now()+10000,masterAdminRevision:'a'.repeat(64)}),false);
  }
  process.env.master_admin='';
  assert.throws(()=>master.loginClaims({code:'any',isAdmin:true}),/master_admin_not_configured/);
  assert.deepEqual(master.loginClaims({isAdmin:true}),{});
 }finally{process.env.master_admin=original;}
});
