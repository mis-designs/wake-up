/* Uses the signed-session presentation and the existing video editor. */
(() => {
 'use strict';
 const entry=document.getElementById('videoGalleryEntry');
 let state=null,expiryTimer;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
 function session(){return readStoredSession();}
 function sync(){clearTimeout(expiryTimer);const role=window.AccountRole?.status(session()?.accessToken);entry.hidden=!role?.master;if(!role?.master)close();else expiryTimer=setTimeout(sync,Math.max(1,role.expires-Date.now()+20));}
 function close(){if(!state)return;const s=state;state=null;s.controller.abort();MagicQuizVideo.close();s.buttons.forEach(b=>MagicQuizVideo.destroyButton(b));s.unmount();s.data=null;}
 async function request(action,extra={},signal){
  const s=session();if(!window.AccountRole?.status(s?.accessToken).master)throw Error('master_admin_required');
  const response=await fetch('/api/quiz',{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.accessToken},body:JSON.stringify({action,phone:s.phone,deviceId:s.deviceId,...extra})});
  const data=await response.json();if(!response.ok||data.error)throw Object.assign(Error(data.error||'video_storage_unavailable'),{status:response.status});
  if(data.accessToken)persistSession(s.phone,{...s,...data});return data;
 }
 function counts(items,source,chapter){let total=0,done=0;for(const row of items)for(const ref of row.refs)if(ref.source===source&&(!chapter||ref.chapter===chapter)){total++;if(row.available)done++;}return{total,done};}
 function meter(title,{total,done}){const box=el('div',null,'vg-meter');box.append(el('strong',title),el('span',`${done} / ${total} · ${total-done} da completare`));const bar=el('progress');bar.max=total||1;bar.value=done;bar.setAttribute('aria-label',`${title}: ${done} di ${total}`);box.append(bar);return box;}
 function render(){const s=state;if(!s?.data)return;s.buttons.forEach(b=>MagicQuizVideo.destroyButton(b));s.buttons=[];s.grid.replaceChildren();s.stats.replaceChildren();s.chapters.replaceChildren();
  for(const [key,title]of [['magic','Magic Book'],['all','All Books'],['bank','Quiz Bank']])s.stats.append(meter(title,counts(s.data.items,key)));
  s.summary.textContent=`${s.data.uploaded} video caricati · aggiornato ${new Date(s.data.checkedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}${s.data.unmatched?` · ${s.data.unmatched} fuori dai cataloghi attuali`:''}`;
  const groups=new Map();for(const row of s.data.items)for(const ref of row.refs)if(ref.source===s.source)groups.set(ref.chapter,ref.title);
  s.chapters.append(button('Tutti i capitoli',()=>{s.chapter='';s.limit=24;render();}));
  for(const [chapter,title]of [...groups].sort((a,b)=>Number(a[0])-Number(b[0]))){const b=button('',()=>{s.chapter=chapter;s.limit=24;render();s.result.focus();});b.append(meter(title,counts(s.data.items,s.source,chapter)));b.setAttribute('aria-pressed',String(s.chapter===chapter));s.chapters.append(b);}
  const rows=s.data.items.filter(row=>row.refs.some(r=>r.source===s.source&&(!s.chapter||r.chapter===s.chapter))&&(s.mode==='missing'?!row.available:row.available)&&(!s.query||`${row.question} ${row.figure}`.toLocaleLowerCase('it').includes(s.query)));
  s.result.textContent=`${s.mode==='missing'?'Da caricare':'Video disponibili'}: ${rows.length}`;
  if(!rows.length)s.grid.append(el('p',s.query?'Nessun risultato. Modifica la ricerca.':s.mode==='missing'?'Tutti i quiz selezionati hanno un video.':'Nessun video in questa selezione. Usa Continua ad aggiungere video.','vg-empty'));
  for(const row of rows.slice(0,s.limit)){
   const card=el('article',null,'vg-card');const cover=button('',()=>manage.click());cover.className='vg-cover';cover.setAttribute('aria-label',`Apri video: ${row.question}`);
   if(row.thumbnail){const img=el('img');img.src=row.thumbnail;img.alt='';img.loading='lazy';img.onerror=()=>{img.remove();cover.append(el('span','▶ Video'));};cover.append(img);}else cover.append(el('span',row.available?'▶ Video':'＋ Aggiungi video'));
   const body=el('div',null,'vg-card-body');body.append(el('p',row.question,'vg-question'),el('strong',row.correct?'VERO':'FALSO',row.correct?'vg-true':'vg-false'));
   const refs=row.refs.filter(r=>r.source===s.source);body.append(el('p',refs.map(r=>`${r.title} · ${r.id}`).join(' / '),'vg-ref'));
   const number=String(row.figure||'').match(/(?:fig)?(\d+)(?:\.[a-z]+)?$/i)?.[1];if(number)body.append(el('p',`Figura ${number}`,'vg-ref'));
   const manage=MagicQuizVideo.createButton({gallery:true,question:row,cacheScope:s.scope,isCurrent:()=>state===s&&card.isConnected,isAdmin:()=>true,onClose:()=>{if(state===s)void load(s);},request:(action,video,signal)=>request(action,{questionId:row.id,question:row.question,figure:String(row.figure||''),video},signal)});
   s.buttons.push(manage);body.append(manage);card.append(cover,body);s.grid.append(card);
  }
  s.more.hidden=rows.length<=s.limit;
 }
 async function load(s){if(s.loading||state!==s)return;s.loading=true;s.refresh.disabled=true;s.status.replaceChildren();const loading=el('span',null,'magic-loading-indicator magic-loading-indicator--gallery');const media=el('span',null,'magic-loading-indicator__media');const image=el('img',null,'magic-loading-indicator__image');image.src='/icons/loading_backup.gif';image.alt='';media.append(image);loading.append(media,el('span','Caricamento della galleria…','magic-loading-indicator__label'));s.status.append(loading);s.status.setAttribute('role','status');
  const timer=setTimeout(()=>s.controller.abort(),35000);
  try{const data=await request('getVideoGallery',{},s.controller.signal);if(state!==s)return;s.data=data;render();s.status.textContent='';}
  catch(e){if(state!==s)return;if([401,403].includes(e.status)||['master_admin_required','unauthorized','invalid_token','expired_token'].includes(e.message)){close();sync();return;}s.status.textContent='Galleria non aggiornata. Controlla la connessione e premi Aggiorna.';s.controller=new AbortController();}
  finally{clearTimeout(timer);s.loading=false;s.refresh.disabled=false;}
 }
 function open(){sync();if(entry.hidden||state)return;const overlay=el('div',null,'vg-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','vg-title');
  const shell=el('section',null,'vg-shell'),head=el('header',null,'vg-header'),title=el('h1','Video Gallery');title.id='vg-title';const exit=button('Chiudi',close);head.append(title,exit);
  const summary=el('p',null,'vg-summary'),stats=el('div',null,'vg-stats'),toolbar=el('div',null,'vg-toolbar'),status=el('p'),source=el('select');source.setAttribute('aria-label','Catalogo');for(const [v,t]of [['magic','Magic Book'],['all','All Books'],['bank','Quiz Bank']]){const o=el('option',t);o.value=v;source.append(o);}
  const s={scope:crypto.randomUUID(),controller:new AbortController(),buttons:[],source:'magic',chapter:'',mode:'videos',query:'',limit:24,data:null};state=s;
  const videos=button('Video caricati',()=>{s.mode='videos';s.limit=24;render();}),add=button('Continua ad aggiungere video',()=>{s.mode='missing';s.limit=24;render();s.chapterDetails.open=true;s.chapterDetails.focus();});
  const refresh=button('Aggiorna',()=>load(s));refresh.title='Le modifiche dagli altri sistemi possono richiedere fino a un minuto';source.onchange=()=>{s.source=source.value;s.chapter='';s.limit=24;render();};
  const form=el('form'),search=el('input');search.type='search';search.placeholder='Cerca quiz o figura';search.setAttribute('aria-label','Cerca quiz o figura');const submit=el('button','Cerca');submit.type='submit';form.append(search,submit);form.onsubmit=e=>{e.preventDefault();s.query=search.value.trim().toLocaleLowerCase('it');s.limit=24;render();};
  toolbar.append(source,videos,add,refresh,form);const layout=el('div',null,'vg-layout'),chapters=el('details',null,'vg-chapters');chapters.open=innerWidth>800;chapters.tabIndex=-1;chapters.append(el('summary','Avanzamento per capitolo'));const chapterBody=el('div');chapters.append(chapterBody);
  const main=el('main'),result=el('h2');result.tabIndex=-1;const grid=el('div',null,'vg-grid'),more=button('Mostra altri',()=>{s.limit+=24;render();});more.hidden=true;main.append(result,grid,more);layout.append(chapters,main);shell.append(head,summary,stats,toolbar,status,layout);overlay.append(shell);document.body.append(overlay);
  Object.assign(s,{summary,stats,status,refresh,grid,result,more,chapters:chapterBody,chapterDetails:chapters});s.unmount=MagicBookPopup.mount(overlay,{returnFocus:entry,bodyClass:'vg-open',onDismiss:close,initialFocus:exit,focusable:()=>overlay.querySelectorAll('button,input,select,summary,[tabindex]')});void load(s);
 }
 entry.onclick=open;new MutationObserver(sync).observe(document.getElementById('profileRoleBadge'),{attributes:true,childList:true,subtree:true});window.addEventListener('storage',sync);window.addEventListener('magicbook:logout',()=>{close();sync();});window.addEventListener('pagehide',close);window.MagicBookPopup?.registerHistoryLayer(()=>{if(!state||document.querySelector('.quiz-video-overlay'))return false;close();return true;});sync();
})();
