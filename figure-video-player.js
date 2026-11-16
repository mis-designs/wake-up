(function(root){
 'use strict';
 const cache=new Map(),pending=new Map(),inlineBindings=new Set();let active=null,returning=false;
 function credentials(allBooks){
  try{
   if(allBooks)return{phone:localStorage.getItem('allBooks.phone')||'',deviceId:localStorage.getItem('allBooks.deviceId')||'',accessToken:localStorage.getItem('allBooks.accessToken')||''};
   const stored=JSON.parse(localStorage.getItem('user_session')||localStorage.getItem('session')||'{}');
   return{phone:stored.phone||localStorage.getItem('phone')||'',deviceId:stored.deviceId||localStorage.getItem('deviceId')||'',accessToken:localStorage.getItem('accessToken')||stored.accessToken||''};
  }catch{return{};}
 }
 async function lookupOnce(figure,options,signal,force=false){
  const auth=credentials(options.allBooks),endpoint=options.allBooks?'/api/quiz':location.pathname.includes('quizbank')?'/api/quizbank':'/api/quiz';
  if(!auth.phone||!auth.deviceId||!auth.accessToken)return{available:false};
  const key=endpoint+':'+auth.accessToken+':'+figure,hit=cache.get(key);if(!force&&hit&&hit.expires>Date.now())return hit.value;
  const response=await fetch(endpoint,{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.accessToken},body:JSON.stringify({action:'getFigureVideo',phone:auth.phone,deviceId:auth.deviceId,figure})});
  const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'unavailable');
  if(credentials(options.allBooks).accessToken!==auth.accessToken)throw Error('session_changed');
  if(value.accessToken){try{const prefix=options.allBooks?'allBooks.':'';localStorage.setItem(prefix+'accessToken',value.accessToken);localStorage.setItem(prefix+'accessTokenExpiresAt',String(value.accessTokenExpiresAt||''));}catch{}}
  cache.set(key,{value,expires:Date.now()+60000});while(cache.size>64)cache.delete(cache.keys().next().value);return value;
 }
 function lookup(figure,options,signal,force=false){
  const key=(options.allBooks?'all':location.pathname.includes('quizbank')?'bank':'magic')+':'+credentials(options.allBooks).accessToken+':'+figure;
  let task=pending.get(key);
  if(!task){const controller=new AbortController();task={controller,users:0};task.promise=lookupOnce(figure,options,controller.signal,force).finally(()=>{if(pending.get(key)===task)pending.delete(key);});pending.set(key,task);}
  task.users++;
  return new Promise((resolve,reject)=>{let done=false;const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);if(--task.users===0&&pending.get(key)===task){pending.delete(key);task.controller.abort();}error?reject(error):resolve(value);};const abort=()=>finish(new DOMException('Aborted','AbortError'));signal?.addEventListener('abort',abort,{once:true});task.promise.then(value=>finish(null,value),finish);if(signal?.aborted)abort();});
 }
 function observeFigure(image,trigger,figure,title){
  const frame=trigger.closest('.study-figure-frame');if(!frame)return()=>{};
  frame.classList.add('figure-video-inline-frame');const anchor=document.createElement('span');anchor.className='figure-video-inline-anchor';frame.append(anchor);let dispose;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();dispose=attach({figure,title,before:anchor,quiet:true,buttonClass:'fvp-action figure-video-inline'});}});observer.observe(frame);
  const binding={trigger,dispose:()=>{observer.disconnect();dispose?.();anchor.remove();frame.classList.remove('figure-video-inline-frame');inlineBindings.delete(binding);}};inlineBindings.add(binding);return binding.dispose;
 }
 const removed=new MutationObserver(()=>{for(const binding of inlineBindings)if(!binding.trigger.isConnected)binding.dispose();});removed.observe(document.body,{childList:true,subtree:true});
 function close(fromHistory=false){
  if(!active)return;const s=active;active=null;s.controller.abort();s.video.pause();s.video.removeAttribute('src');s.video.load();
  if(s.audioToken)void root.MagicAudioFocus?.completeTransient(s.audioToken,{resume:false});s.unmount();
  if(!fromHistory&&history.state?.figureVideoPlayer===s.key){returning=true;history.back();}
 }
 function open(options,value,trigger){
  if(active||returning)return;
  const overlay=document.createElement('div');overlay.className='fvp-overlay';
  overlay.innerHTML='<section class="fvp-card" role="dialog" aria-modal="true" aria-labelledby="fvp-title"><header><h2 id="fvp-title"></h2><button type="button" class="fvp-action" aria-label="Chiudi video della figura"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button></header><video controls controlslist="nodownload" playsinline preload="metadata"></video><p role="status"></p><button type="button" class="fvp-retry" hidden>Riprova video</button></section>';
  overlay.querySelector('h2').textContent=options.title;const video=overlay.querySelector('video'),exit=overlay.querySelector('.fvp-action'),status=overlay.querySelector('[role=status]'),retry=overlay.querySelector('.fvp-retry');
  video.addEventListener('contextmenu',event=>event.preventDefault());
  const s={video,trigger,controller:new AbortController(),key:crypto.randomUUID()};active=s;
  exit.onclick=()=>close();video.src=value.url;
  video.addEventListener('play',()=>{if(s.audioToken&&root.MagicAudioFocus?.isCurrent(s.audioToken))return;document.querySelectorAll('audio,video').forEach(media=>{if(media!==video)media.pause();});root.speechSynthesis?.cancel();s.audioToken=root.MagicAudioFocus?.beginTransient({key:'figure-video',stop:()=>video.pause()});});
  video.onerror=()=>{status.textContent='Il video non si apre. Controlla la connessione e riprova.';retry.hidden=false;};
  retry.onclick=async()=>{retry.disabled=true;status.textContent='Caricamento…';const timer=setTimeout(()=>s.controller.abort(),20000);try{const result=await lookup(options.figure,options,s.controller.signal,true);if(active!==s)return;if(!result.available){status.textContent='Il video non è più disponibile.';return;}video.src=result.url;status.textContent='';retry.hidden=true;void video.play().catch(()=>{status.textContent='Premi play per avviare il video.';});}catch{if(active===s)status.textContent='Video non disponibile. Riprova.';}finally{clearTimeout(timer);retry.disabled=false;if(active===s&&s.controller.signal.aborted)s.controller=new AbortController();}};
  document.body.append(overlay);s.unmount=root.MagicBookPopup.mount(overlay,{returnFocus:trigger,initialFocus:exit,bodyClass:'fvp-open',onDismiss:()=>close(),focusable:()=>overlay.querySelectorAll('button:not([hidden]),video')});
  history.pushState({...history.state,figureVideoPlayer:s.key},'',location.href);
  void video.play().catch(()=>{if(active===s)status.textContent='Premi play per avviare il video.';});
 }
 function attach(options){
  let controller=new AbortController();const button=document.createElement('button'),note=document.createElement('span');let value,disposed=false;
  button.type='button';button.className=options.buttonClass||'fvp-action';button.classList.add('figure-video-play');button.hidden=true;button.setAttribute('aria-label','Guarda il video: '+options.title);button.title='Guarda il video';
  button.innerHTML=button.classList.contains('figure-video-inline')?'<img class="figure-video-person" src="/icons/figure-video-thinking.png" alt="" draggable="false"><img class="figure-video-meaning" src="/icons/figure-video-meaning.svg" alt="" draggable="false">':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13l10-6.5Z" fill="currentColor"/></svg>';
  note.className='figure-video-status';note.setAttribute('role','status');options.before.before(button,note);
  button.onclick=()=>{if(value?.available)open(options,value,button);else void load(true);};
  async function load(force=false){if(controller.signal.aborted)controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);button.disabled=true;try{value=await lookup(options.figure,options,controller.signal,force);if(disposed)return;button.hidden=!value.available;button.dataset.available=String(value.available===true);button.setAttribute('aria-label','Guarda il video: '+options.title);button.title='Guarda il video';note.textContent='';button.innerHTML=button.classList.contains('figure-video-inline')?'<img class="figure-video-person" src="/icons/figure-video-thinking.png" alt="" draggable="false"><img class="figure-video-meaning" src="/icons/figure-video-meaning.svg" alt="" draggable="false">':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13l10-6.5Z" fill="currentColor"/></svg>';}catch{if(disposed)return;value=null;button.dataset.available='false';note.textContent=options.quiet?'':'Video non verificato.';button.hidden=options.quiet===true;button.textContent='↻';button.title='Riprova verifica video';button.setAttribute('aria-label','Riprova verifica video');}finally{clearTimeout(timer);button.disabled=false;}}
  void load();return()=>{disposed=true;controller.abort();if(active?.trigger===button)close();button.remove();note.remove();};
 }
 root.MagicBookPopup?.registerHistoryLayer(()=>{if(returning){returning=false;return true;}if(active){close(true);return true;}return false;});
 for(const event of ['pagehide','magicbook:logout','magicbook:quiz-question-change'])root.addEventListener(event,()=>{cache.clear();close(event==='pagehide');});
 root.addEventListener('storage',()=>{cache.clear();close();});
 root.MagicFigureVideo=Object.freeze({attach,observeFigure,close,ownsHistory:()=>Boolean(active||returning)});
})(window);
