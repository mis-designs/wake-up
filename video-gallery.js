/* Uses the signed-session presentation and the existing video editor. */
(() => {
 'use strict';
 const entry=document.getElementById('videoGalleryEntry');
 let state=null,expiryTimer;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
 function session(){return readStoredSession();}
 function sync(){clearTimeout(expiryTimer);const role=window.AccountRole?.status(session()?.accessToken);entry.hidden=!role?.master;if(!role?.master)close();else expiryTimer=setTimeout(sync,Math.max(1,role.expires-Date.now()+20));}
 function close(){if(!state)return;const s=state;state=null;s.controller.abort();window.MagicBookFigureDetail?.close();MagicQuizVideo.close();s.buttons.forEach(b=>MagicQuizVideo.destroyButton(b));s.unmount();s.data=null;}
 async function request(action,extra={},signal){
  const s=session();if(!window.AccountRole?.status(s?.accessToken).master)throw Error('master_admin_required');
  const response=await fetch('/api/quiz',{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.accessToken},body:JSON.stringify({action,phone:s.phone,deviceId:s.deviceId,...extra})});
  const data=await response.json();if(!response.ok||data.error)throw Object.assign(Error(data.error||'video_storage_unavailable'),{status:response.status});
  if(data.accessToken)persistSession(s.phone,{...s,...data});return data;
 }
 function counts(items,source,chapter){let total=0,done=0;for(const row of items){const refs=row.refs.filter(ref=>ref.source===source&&(!chapter||ref.chapter===chapter));const amount=source==='figures'?Number(refs.length>0):refs.length;total+=amount;if(row.available)done+=amount;}return{total,done};}
 function meter(title,{total,done},unit='quiz'){const box=el('div',null,'vg-meter');box.append(el('strong',title),el('b',String(done),'vg-count'),el('span',`${done} su ${total.toLocaleString('it-IT')} ${unit} · ${total-done} da completare`));const bar=el('progress');bar.max=total||1;bar.value=done;bar.setAttribute('aria-label',`${title}: ${done} di ${total}`);box.append(bar);return box;}
 function render(){const s=state;if(!s?.data)return;s.buttons.forEach(b=>MagicQuizVideo.destroyButton(b));s.buttons=[];s.grid.replaceChildren();s.stats.replaceChildren();s.chapters.replaceChildren();
  for(const [key,title]of (s.kind==='figures'?[['figures','Video figure']]:[['magic','Magic Book'],['all','All Books'],['bank','Quiz Bank']]))s.stats.append(meter(title,counts(s.data.items,key),s.kind==='figures'?'figure':'quiz'));
  s.search.placeholder=s.kind==='figures'?'Cerca numero o nome della figura':'Cerca quiz o figura';s.search.setAttribute('aria-label',s.search.placeholder);
  s.quizKind.setAttribute('aria-pressed',String(s.kind==='quiz'));s.figureKind.setAttribute('aria-pressed',String(s.kind==='figures'));s.sourceControl.hidden=s.kind==='figures';s.chapterDetails.hidden=false;s.layout.classList.toggle('vg-layout--figures',s.kind==='figures');s.add.textContent=s.kind==='figures'?'Aggiungi video alle figure':'Continua ad aggiungere video';
  s.videos.setAttribute('aria-pressed',String(s.mode==='videos'));s.add.setAttribute('aria-pressed',String(s.mode==='missing'));s.summary.textContent=`${s.data.uploaded} video caricati · aggiornato ${new Date(s.data.checkedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}${s.data.unmatched?` · ${s.data.unmatched} fuori dai cataloghi attuali`:''}`;
  const groups=new Map(s.kind==='figures'?(s.data.chapters||[]).map(c=>[c.chapter,c.title]):[]);for(const row of s.data.items)for(const ref of row.refs)if(ref.source===s.source)groups.set(ref.chapter,ref.title);
  const allChapters=button('Tutti i capitoli',()=>{s.chapter='';s.limit=24;render();s.result.focus();});allChapters.setAttribute('aria-pressed',String(!s.chapter));s.chapters.append(allChapters);
  for(const [chapter,title]of [...groups].sort((a,b)=>(Number(a[0])||999)-(Number(b[0])||999))){const b=button('',()=>{s.chapter=chapter;s.limit=24;render();s.result.focus();});b.append(meter(s.kind==='figures'&&chapter!=='unassigned'?`Capitolo ${chapter.padStart(2,'0')} · ${title}`:title,counts(s.data.items,s.source,chapter),s.kind==='figures'?'figure':'quiz'));b.setAttribute('aria-pressed',String(s.chapter===chapter));s.chapters.append(b);}
  const rows=s.data.items.filter(row=>row.refs.some(r=>r.source===s.source&&(!s.chapter||r.chapter===s.chapter))&&(s.mode==='missing'?!row.available:row.available)&&(!s.query||`${row.question} ${row.figure}`.toLocaleLowerCase('it').includes(s.query)));
  s.result.textContent=`${s.mode==='missing'?'Da caricare':'Video disponibili'}: ${rows.length}${s.chapter?' · '+(s.kind==='figures'&&s.chapter!=='unassigned'?'Capitolo '+s.chapter+' · ':'')+(groups.get(s.chapter)||''):''}`;
  if(!rows.length)s.grid.append(el('p',s.query?'Nessun risultato. Modifica la ricerca.':s.mode==='missing'?(s.kind==='figures'?(counts(s.data.items,s.source,s.chapter).total?'Tutte le figure selezionate hanno un video.':'Nessuna figura associata a questo capitolo.'):'Tutti i quiz selezionati hanno un video.'):(s.kind==='figures'?'Nessun video in questa selezione. Usa Aggiungi video alle figure.':'Nessun video in questa selezione. Usa Continua ad aggiungere video.'),'vg-empty'));
  for(const row of rows.slice(0,s.limit)){
   const card=el('article',null,'vg-card');const cover=button('',()=>manage.click());cover.className='vg-cover';cover.setAttribute('aria-label',`Apri video: ${row.question}`);
   if(s.kind==='figures'){const img=el('img');img.src='/api/asset?'+new URLSearchParams({kind:'figure',figure:row.figure,presentation:'numberless-v2'});img.alt='Figura '+row.number;img.loading='lazy';img.onerror=()=>{img.remove();cover.append(el('span','Figura non disponibile'));};cover.classList.add('vg-cover--figure');cover.append(img);}else if(row.thumbnail){const img=el('img');img.src=row.thumbnail;img.alt='';img.loading='lazy';img.onerror=()=>{img.remove();cover.append(el('span','▶ Video'));};cover.append(img);}else cover.append(el('span',row.available?'▶ Video':'＋ Aggiungi video'));
   const body=el('div',null,'vg-card-body');body.append(el('p',row.question,'vg-question'),...(s.kind==='figures'?[]:[el('strong',row.correct?'VERO':'FALSO',row.correct?'vg-true':'vg-false')]));
   const refs=row.refs.filter(r=>r.source===s.source);body.append(el('p',refs.map(r=>s.kind==='figures'?(r.chapter==='unassigned'?r.title:`Capitolo ${r.chapter} · ${r.title}`):`${r.title} · ${r.id}`).join(' / '),'vg-ref'));
   const number=String(row.figure||'').match(/(?:fig)?(\d+)(?:\.[a-z]+)?$/i)?.[1];if(number)body.append(el('p',`Figura ${number}`,'vg-ref'));
   if(number&&s.kind!=='figures'){
    const figureBox=el('div',null,'vg-figure-box'),image=el('img',null,'vg-figure-image');image.alt=`Figura ${number}`;image.loading='lazy';
    const url='/api/asset?'+new URLSearchParams({kind:'figure',figure:String(row.figure),presentation:'numberless-v2'});
    const zoom=button('',()=>window.MagicBookFigureDetail?.open(image,zoom));zoom.className='vg-figure-zoom';zoom.setAttribute('aria-label',`Ingrandisci figura ${number}`);zoom.setAttribute('aria-haspopup','dialog');zoom.disabled=true;zoom.append(image);
    const note=el('span',null,'vg-copy-feedback');note.setAttribute('role','status');
    const copyImage=button('Copia figura',async()=>{
     copyImage.disabled=true;note.textContent='';
     try{
      if(!navigator.clipboard?.write||!window.ClipboardItem)throw Error('unsupported');
      const png=new Promise((resolve,reject)=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);canvas.toBlob(blob=>blob?resolve(blob):reject(Error('conversion')),'image/png');});
      await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);note.textContent='Figura copiata!';
     }catch{note.textContent='Copia non disponibile. Apri la figura e tieni premuta l’immagine per copiarla o salvarla.';}
     finally{copyImage.disabled=!image.naturalWidth;}
    });copyImage.className='vg-copy-image';copyImage.disabled=true;
    image.onload=()=>{zoom.disabled=false;copyImage.disabled=false;note.textContent='';};
    image.onerror=()=>{zoom.disabled=true;copyImage.disabled=true;note.textContent='Figura non disponibile.';retry.hidden=false;};
    const retry=button('Riprova figura',()=>{retry.hidden=true;note.textContent='';image.src=url;});retry.hidden=true;
    image.src=url;figureBox.append(zoom,copyImage,note,retry);body.append(figureBox);
   }
   if(s.mode==='missing'&&s.kind!=='figures'){
    const feedback=el('span',null,'vg-copy-feedback');feedback.setAttribute('role','status');
    const copy=button('Copia domanda e risposta',async()=>{
     const text=`${row.question}\nRisposta: ${row.correct?'VERO':'FALSO'}${number?'\nFigura '+number:''}`;
     copy.disabled=true;feedback.textContent='';
     try{
      try{await navigator.clipboard.writeText(text);}
      catch(error){const field=el('textarea');field.value=text;field.setAttribute('aria-label','Domanda e risposta da copiare');field.style.cssText='position:fixed;left:0;top:0;opacity:0;width:1px;height:1px';body.append(field);field.focus();field.select();try{if(!document.execCommand('copy'))throw error;}finally{field.remove();copy.focus({preventScroll:true});}}
      feedback.textContent='Copiato!';
     }catch{feedback.textContent='Copia non riuscita. Riprova.';}finally{copy.disabled=false;}
    });copy.className='vg-copy';body.append(copy,feedback);
   }
   const manage=MagicQuizVideo.createButton({gallery:true,figureVideo:s.kind==='figures',question:row,cacheScope:s.scope,isCurrent:()=>state===s&&card.isConnected,isAdmin:()=>true,onClose:()=>{if(state===s)void load(s);},request:(action,video,signal)=>request(action,{questionId:row.id,question:row.question,figure:String(row.figure||''),video},signal)});
   s.buttons.push(manage);body.append(manage);card.append(cover,body);s.grid.append(card);
  }
  s.more.hidden=rows.length<=s.limit;
 }
 async function load(s){if(s.loading||state!==s)return;s.loading=true;s.refresh.disabled=true;s.quizKind.disabled=s.figureKind.disabled=true;s.status.replaceChildren();const loading=el('span',null,'magic-loading-indicator magic-loading-indicator--gallery');const media=el('span',null,'magic-loading-indicator__media');const image=el('img',null,'magic-loading-indicator__image');image.src='/icons/loading_backup.gif';image.alt='';media.append(image);loading.append(media,el('span','Caricamento della galleria…','magic-loading-indicator__label'));s.status.append(loading);s.status.setAttribute('role','status');
  const timer=setTimeout(()=>s.controller.abort(),35000);
  try{const data=await request(s.kind==='figures'?'getFigureVideoGallery':'getVideoGallery',{},s.controller.signal);if(state!==s)return;s.data=data;render();s.status.textContent='';}
  catch(e){if(state!==s)return;if([401,403].includes(e.status)||['master_admin_required','unauthorized','invalid_token','expired_token'].includes(e.message)){close();sync();return;}s.status.textContent='Galleria non aggiornata. Controlla la connessione e premi Aggiorna.';s.controller=new AbortController();}
  finally{clearTimeout(timer);s.loading=false;s.refresh.disabled=false;s.quizKind.disabled=s.figureKind.disabled=false;}
 }
 function open(){sync();if(entry.hidden||state)return;const overlay=el('div',null,'vg-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','vg-title');
  const shell=el('section',null,'vg-shell'),head=el('header',null,'vg-header'),title=el('h1','Video Gallery');title.id='vg-title';const exit=button('Chiudi',close);const heading=el('div',null,'vg-heading');heading.append(el('span','MAGIC BOOK / MASTER ADMIN','vg-eyebrow'),title);exit.className='vg-close';head.append(heading,exit);
  const summary=el('p',null,'vg-summary'),stats=el('div',null,'vg-stats'),toolbar=el('div',null,'vg-toolbar'),status=el('p'),source=el('select');source.setAttribute('aria-label','Catalogo');for(const [v,t]of [['magic','Magic Book'],['all','All Books'],['bank','Quiz Bank']]){const o=el('option',t);o.value=v;source.append(o);}
  const s={scope:crypto.randomUUID(),controller:new AbortController(),buttons:[],kind:'quiz',source:'magic',chapter:'',mode:'videos',query:'',limit:24,data:null};state=s;
  const kinds=el('nav',null,'vg-kinds');kinds.setAttribute('aria-label','Tipo di video');
  const changeKind=kind=>{if(s.loading||s.kind===kind)return;s.kind=kind;s.source=kind==='figures'?'figures':source.value;s.chapter='';s.query='';search.value='';clearSearch.hidden=true;s.mode=kind==='figures'?'missing':'videos';s.limit=24;s.data=null;s.buttons.forEach(b=>MagicQuizVideo.destroyButton(b));s.buttons=[];s.grid.replaceChildren();s.stats.replaceChildren();s.result.textContent='';s.summary.textContent='';void load(s);};
  const quizKind=button('Video quiz',()=>changeKind('quiz')),figureKind=button('Video figure',()=>changeKind('figures'));const theoryKind=button('Video teoria',()=>location.assign('/aula#caricamenti'));kinds.append(quizKind,figureKind,theoryKind);
  const videos=button('Video caricati',()=>{s.mode='videos';s.limit=24;render();}),add=button('Continua ad aggiungere video',()=>{s.mode='missing';s.limit=24;render();s.chapterDetails.open=true;s.chapterDetails.focus();});
  videos.className='vg-tab';add.className='vg-add';const refresh=button('Aggiorna',()=>load(s));refresh.className='vg-refresh';refresh.title='Le modifiche dagli altri sistemi possono richiedere fino a un minuto';source.onchange=()=>{s.source=source.value;s.chapter='';s.limit=24;render();};
  const form=el('form'),search=el('input');form.noValidate=true;search.type='search';search.placeholder='Cerca quiz o figura';search.setAttribute('aria-label','Cerca quiz o figura');const submit=el('button','Cerca');submit.type='submit';const clearSearch=button('×',()=>{search.value='';s.query='';s.limit=24;clearSearch.hidden=true;render();search.focus();});clearSearch.setAttribute('aria-label','Cancella ricerca');clearSearch.hidden=true;search.oninput=()=>{clearSearch.hidden=!search.value;};search.addEventListener('search',()=>{if(!search.value)clearSearch.click();});form.append(search,clearSearch,submit);form.onsubmit=e=>{e.preventDefault();s.query=search.value.trim().toLocaleLowerCase('it');s.limit=24;render();};
  toolbar.append(source,videos,add,refresh,form);const layout=el('div',null,'vg-layout'),chapters=el('details',null,'vg-chapters');chapters.open=innerWidth>800;chapters.tabIndex=-1;chapters.append(el('summary','Avanzamento per capitolo','tmm-disclosure'));const chapterBody=el('div');chapters.append(chapterBody);
  const main=el('main'),result=el('h2');result.tabIndex=-1;const grid=el('div',null,'vg-grid'),more=button('Mostra altri',()=>{s.limit+=24;render();});more.hidden=true;main.append(result,grid,more);layout.append(chapters,main);shell.append(head,kinds,summary,stats,toolbar,status,layout);overlay.append(shell);document.body.append(overlay);window.TmmPicker?.attach(source,'Catalogo');
  Object.assign(s,{search,quizKind,figureKind,sourceControl:source,layout,videos,add,summary,stats,status,refresh,grid,result,more,chapters:chapterBody,chapterDetails:chapters});s.unmount=MagicBookPopup.mount(overlay,{returnFocus:entry,bodyClass:'vg-open',onDismiss:close,initialFocus:exit,focusable:()=>overlay.querySelectorAll('button,input,select:not([inert]),summary,[tabindex]:not([inert])')});void load(s);
 }
 entry.onclick=open;new MutationObserver(sync).observe(document.getElementById('profileRoleBadge'),{attributes:true,childList:true,subtree:true});window.addEventListener('storage',sync);window.addEventListener('magicbook:logout',()=>{close();sync();});window.addEventListener('pagehide',close);window.MagicBookPopup?.registerHistoryLayer(()=>{if(!state||document.querySelector('.quiz-video-overlay,.figure-detail-overlay'))return false;close();return true;});sync();
})();
