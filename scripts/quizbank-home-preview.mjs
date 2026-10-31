// Actual Home document + local-only services; never loads production user data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf' };
const phone = '393310000000';
const token = 'test.' + Buffer.from(JSON.stringify({phone,role:'user',exp:2208988800})).toString('base64url') + '.fixture';
const counts = {};
http.createServer((req,res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const json = value => { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(value)); };
  if (u.pathname === '/qa/state') return json(counts);
  if (u.pathname.startsWith('/api/')) {
    counts[u.pathname] = (counts[u.pathname] || 0) + 1;
    return json(u.pathname === '/api/getPages' ? {success:true,role:'user',accessToken:token,accessTokenExpiresAt:Date.now()+86400000,expiry:'2035-01-01',pages:[],totalPages:0} : {success:true,items:[],words:[],figures:[],sheets:[],questionCount:0});
  }
  if (u.pathname === '/service-worker.js') { res.writeHead(404); return res.end(); }
  let name = decodeURIComponent(u.pathname).slice(1);
  if (!path.extname(name)) name = name === 'quizbank' ? 'quizbank.html' : 'index.html';
  const file = path.resolve(repo, name);
  if (!file.startsWith(repo) || name.split(/[\\/]/).some(s=>s.startsWith('.')) || !mime[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (path.extname(file) === '.html') {
    const seed = `<script>
      window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__=true;
      const originalFetch=window.fetch.bind(window);
      window.fetch=(input,init)=>new URL(typeof input==='string'?input:input.url,location.href).origin===location.origin?originalFetch(input,init):Promise.resolve(new Response('{}',{status:503}));
      const phone=${JSON.stringify(phone)},token=${JSON.stringify(token)};
      const session={phone,deviceId:'fixture-device-001',role:'user',accessToken:token,accessTokenExpiresAt:Date.now()+86400000,expiry:'2035-01-01',lastValid:Date.now()};
      for(const [k,v] of Object.entries({client_auth_reset_version:'2026-04-device-reset-1',user_session:JSON.stringify(session),session:JSON.stringify(session),loggedIn:'true',phone,deviceId:session.deviceId,accessToken:token,accessTokenExpiresAt:session.accessTokenExpiresAt,whatsapp_group_joined_or_clicked:'true',['whats_new_popup_show_count:mobile-ui-2026-08:'+phone]:'3'}))localStorage.setItem(k,String(v));
      let hash=2166136261;for(const c of phone){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}
      localStorage.setItem('magicbook.wordLearning.v1.'+(hash>>>0).toString(36),JSON.stringify({lastCompletedAt:Date.now()}));
      localStorage.setItem('magicbook.offerNotice.v1','invalid');
      const qa=new URLSearchParams(location.search),key='magicbook.quizbankIntro.v1.'+(hash>>>0).toString(36);
      if(qa.get('qa_reset')==='1')localStorage.removeItem(key);
      if(qa.get('qa_native')==='1'){document.documentElement.classList.add('android-webview');document.documentElement.dataset.appPalette='aura-fluid';}
      if(qa.get('qa_motion')==='off')document.documentElement.setAttribute('data-native-motion-paused','');
      if(qa.get('qa_storage')==='blocked'){const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k.startsWith('magicbook.quizbankIntro'))throw Error('fixture blocked');return get.call(this,k)};Storage.prototype.setItem=function(k,v){if(k.startsWith('magicbook.quizbankIntro'))throw Error('fixture blocked');return set.call(this,k,v)}}
    </script>`;
    body = Buffer.from(body.toString().replace('<head>', '<head>'+seed));
  }
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:"});
  res.end(body);
}).listen(4187,'127.0.0.1',()=>console.log('Home fixture: http://127.0.0.1:4187/home'));
