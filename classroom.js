(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const studio = $('studio'), detail = $('detail');
  const preview = window.classroomLocalPreview;
  const allBooks = document.documentElement.dataset.product === 'allbooks';
  const libraryOrigin = 'https://www.tmmbooks.eu';
  const photoVersionMs = 5 * 60 * 1000;
  const get = key => localStorage.getItem((allBooks ? 'allBooks.' : '') + key) || '';
  function credentials() {
    return {phone:get('phone'), deviceId:get('deviceId'), accessToken:get('accessToken')};
  }
  const state = {chapter:null, photos:{}, lookupOnClick:false, index:0, quiz:0, mode:'lesson', terms:[], responses:new Map()};
  const discoveredPhotos = new Map();
  let viewerRequest, loadRequest, expiryTimer, activeToken = '', mediaUrl, trigger;
  let clipCache = null;
  let theoryButton;
  let requestedChapter=1;
  const localTheory = new Map();
  function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function control(text, click, className) {
    const button = el('button',text,className);
    button.type='button'; button.addEventListener('click',click); return button;
  }
  const lesson = () => state.chapter.lessons[state.index];
  const question = () => lesson().quizzes[state.quiz];
  function stopViewer() {
    viewerRequest?.abort();
    viewerRequest = null;
    const player = detail.querySelector('video');
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = null;
  }
  function closeDetail() {
    stopViewer();
    if (detail.open) detail.close();
    $('detailContent').replaceChildren(); $('related').replaceChildren();
  }
  function clear() {
    clearTimeout(expiryTimer); loadRequest?.abort(); closeDetail();
    releaseTheoryButton();window.MagicQuizVideo?.reset();
    for(const url of localTheory.values()) URL.revokeObjectURL(url);
    localTheory.clear();
    clipCache = null; state.chapter=null; state.photos={}; state.terms=[]; state.responses.clear(); discoveredPhotos.clear();
    activeToken=''; studio.hidden=true; $('present').hidden=true; $('retry').hidden=true;
    $('present').textContent='Presenta';$('present').setAttribute('aria-pressed','false');
    $('status').hidden=false; $('status').textContent='Accedi come Master admin per aprire l’aula.';
    for (const id of ['italian','bangla','tip','words','title','question','topics','chapters','folio','sourceText','sourcePages','signPlate','quizPlate','detailTitle','detailBn','sceneCaption','prompt','feedback','quizTitle','references','quizWords','uploadTopic']) $(id).replaceChildren();
    requestedChapter=1;state.index=0;state.quiz=0;state.mode='lesson';
    $('poster').removeAttribute('src'); document.body.classList.remove('presenting');
  }
  function authorize() {
    if (preview) return true;
    const token=credentials().accessToken, role=window.AccountRole?.status(token);
    if (!role?.master || (activeToken && activeToken !== token)) { clear(); return false; }
    clearTimeout(expiryTimer); activeToken=token;
    expiryTimer=setTimeout(authorize, Math.min(role.expires-Date.now()+20,2147483647));
    return true;
  }
  async function api(action, fields, signal) {
    if (preview) return preview(action,fields);
    if (!authorize()) throw new Error('access');
    const auth=credentials();
    const res=await fetch('/api/quiz',{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.accessToken},body:JSON.stringify({action,...auth,...fields})});
    if ([401,403].includes(res.status)) {clear();throw new Error('access');}
    if (!res.ok) {
      const body=await res.json().catch(()=>({}));
      throw new Error(body.error || 'unavailable');
    }
    const result = await res.json();
    if (signal.aborted) throw new DOMException('Annullato','AbortError');
    if (!authorize()) throw new Error('access');
    return result;
  }
  function inspect(title,bn,from) {
    stopViewer(); trigger=from;
    $('detailContent').replaceChildren(); $('related').replaceChildren();
    $('detailTitle').textContent=title; $('detailBn').textContent=bn || '';
    detail.dataset.media='false';delete detail.dataset.page;if (!detail.open) detail.showModal();detail.scrollTop=0;$('close').focus();
  }
  function showLessonStill(word) {
    if (lesson().scene && lesson().focus.includes(word.it)) {
      const still=el('img');still.src=lesson().scene.poster;still.alt=lesson().scene.alt;still.className='context-still';
      const caption=el('small','Dalla scena della lezione · '+lesson().scene.caption,'context-caption');
      $('detailContent').append(still,caption);
    }
  }
  function knownPhoto(id) {
    return Boolean(state.photos[id] || discoveredPhotos.get(id) === Math.floor(Date.now()/photoVersionMs));
  }
  function styleWord(button) {
    const illustrated=knownPhoto(button.dataset.wordId);
    button.classList.toggle('photo',illustrated);
    button.setAttribute('aria-label',button.dataset.wordLabel+(illustrated?' · Mostra foto e significato':' · Mostra significato'));
  }
  function showWordPhoto(word, from) {
    const photo=state.photos[word.id];
    if (!photo && !state.lookupOnClick) {showLessonStill(word);return;}
    const box=$('detailContent'), img=el('img');
    const version=Math.floor(Date.now()/photoVersionMs);
    const origin=allBooks && !preview ? location.origin : libraryOrigin;
    const params=new URLSearchParams({action:'serve',wordKey:word.id,italian:word.it,concept:'1',v:String(version)});
    const publicUrl=origin+'/api/dictionary-images?'+params;
    const fallback=photo?.proxy ? new URL(photo.proxy,origin).href : '';
    const pending=el('p','Apertura della foto da All Books…');
    pending.setAttribute('role','status'); img.hidden=true;img.alt=photo?.alt || word.it;
    img.referrerPolicy='no-referrer';
    const cancel=viewerRequest=new AbortController();
    cancel.signal.addEventListener('abort',()=>{
      img.onload=img.onerror=null;img.removeAttribute('src');from?.removeAttribute('aria-busy');
    },{once:true});
    from?.setAttribute('aria-busy','true');
    box.append(pending,img);
    img.onload=()=>{
      if(cancel.signal.aborted)return;
      pending.remove();img.hidden=false;detail.dataset.media='true';from?.removeAttribute('aria-busy');
      if (!photo) discoveredPhotos.set(word.id,version);
      for(const button of document.querySelectorAll('[data-word-id]')) if(button.dataset.wordId===word.id)styleWord(button);
    };
    img.onerror=()=>{
      if(cancel.signal.aborted)return;
      if(fallback && img.src!==fallback){img.src=fallback;return;}
      from?.removeAttribute('aria-busy');discoveredPhotos.delete(word.id);
      for(const button of document.querySelectorAll('[data-word-id]')) if(button.dataset.wordId===word.id)styleWord(button);
      detail.dataset.media='false';box.replaceChildren(el('p','Foto del dizionario non disponibile.'),control('Riprova foto',()=>openTerm(word,from)));
      showLessonStill(word);
    };
    img.src=photo?.url || publicUrl;
  }
  function openTerm(word, from) {
    inspect(word.it,word.bn,from);
    showWordPhoto(word,from);
    for(const entry of [word.definition,...(word.examples || [])]){
      if(!entry?.it || !entry.bn)continue;
      const line=el('div',null,'dictionary-line'), bn=el('p',entry.bn);
      bn.lang='bn';line.append(el('p',entry.it),bn);$('related').append(line);
    }
    const target=state.chapter.lessons.findIndex(l=>l.id===word.lessonId);
    if (target>=0) {
      const item=state.chapter.lessons[target], links=$('related');
      if (target!==state.index) links.append(control('Apri la lezione · '+item.title_it,()=>selectTopic(target,true)));
      if (item.scene) links.append(control('Video · '+item.scene.caption,()=>showFilm('scene',from,item)));
      if (item.figureExercise) links.append(control('Figura '+item.figureExercise.figure,()=>openFigure(item.figureExercise,from)));
      if(item.quizzes.length) links.append(control('Quiz · '+item.title_it,()=>{selectTopic(target);renderQuiz();}));
    }
    const relatedIds=new Set(state.chapter.comparisons.filter(ids=>ids.includes(word.id)).flat());
    for(const other of state.chapter.words){
      if(other.id!==word.id && relatedIds.has(other.id)) $('related').append(control('Confronta con '+other.it,()=>openTerm(other,from)));
    }
  }
  function termControl(word, label, card) {
    const button=control(label,()=>openTerm(word,button),card?'word':'inline');
    button.dataset.wordId=word.id;button.dataset.wordLabel=label;
    button.setAttribute('aria-haspopup','dialog');
    styleWord(button);
    if (card) { const bn=el('span',word.bn);bn.lang='bn';button.replaceChildren(el('b',word.it),bn); }
    return button;
  }
  function richText(node,text) {
    const focus=new Set(lesson().focus), spans=[];
    for (const {word,re} of state.terms) {
      if (!word.lessonId && !focus.has(word.it) && !knownPhoto(word.id) && !state.lookupOnClick) continue;
      for (const m of text.matchAll(re)) spans.push({start:m.index,end:m.index+m[0].length,word});
    }
    const chosen=[];
    spans.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
    for (const s of spans) if (!chosen.some(c=>s.start<c.end && c.start<s.end)) chosen.push(s);
    chosen.sort((a,b)=>a.start-b.start);
    node.replaceChildren(); let pos=0;
    for (const s of chosen) {
      node.append(text.slice(pos,s.start));
      const button=termControl(s.word,text.slice(s.start,s.end),false);
      const mark=/^[,.!?]/.exec(text.slice(s.end));
      if (mark) {
        const wrap=el('span',null,'word-punctuation');wrap.append(button,mark[0]);node.append(wrap);
      } else node.append(button);
      pos=s.end+(mark?1:0);
    }
    node.append(text.slice(pos));
  }
  function releaseTheoryButton(){
    if(theoryButton) window.MagicQuizVideo?.destroyButton(theoryButton);
    theoryButton=null;$('theoryVideo').replaceChildren();$('uploadDeskControls').replaceChildren();
  }
  function previewTheory(item,from){
    inspect(item.title_it,item.title_bn,from);
    const box=$('detailContent'), previous=localTheory.get(item.id);
    if(previous){
      const player=el('video');player.src=previous;player.controls=true;player.playsInline=true;
      player.setAttribute('controlslist','nodownload');player.oncontextmenu=e=>e.preventDefault();box.append(player);
    }
    if(document.body.classList.contains('presenting')){
      if(!previous)box.textContent='Nessun video selezionato in questa anteprima.';
      return;
    }
    const label=el('label',previous?'Sostituisci MP4 locale':'Scegli un MP4 locale'),input=el('input');
    input.type='file';input.accept='video/mp4,.mp4';label.append(input);
    box.append(label,el('p','Prova sul computer. Il video resta in questa anteprima fino alla chiusura o al ricaricamento.'));
    input.onchange=()=>{
      const file=input.files[0];if(!file)return;
      localTheory.set(item.id,URL.createObjectURL(file));previewTheory(item,from);
      if(previous) URL.revokeObjectURL(previous);
    };
  }
  function bindTheoryVideo(item){
    releaseTheoryButton();
    if(preview){
      theoryButton=control('Video teoria',()=>previewTheory(item,theoryButton));
    }else{
      const id='tv_'+state.chapter.chapter+'_'+item.id,token=activeToken;
      theoryButton=window.MagicQuizVideo.createButton({
        theoryVideo:true,question:{id,question:item.title_it},cacheScope:token,
        isCurrent:()=>state.chapter && lesson().id===item.id && credentials().accessToken===token,
        isPresenting:()=>document.body.classList.contains('presenting'),
        request:(action,video,signal)=>api(action,{questionId:id,video},signal)
      });
    }
    const uploads=location.hash==='#caricamenti';
    $(uploads?'uploadDeskControls':'theoryVideo').append(theoryButton);
  }
  async function openPage(page,from) {
    inspect('Manuale · pagina '+(page-3),'',from);
    detail.dataset.page='true';
    const box=$('detailContent'), controller=viewerRequest=new AbortController();
    const entryId='page-'+state.chapter.chapter+'-'+page;
    box.textContent='Apertura della pagina illustrata…';
    try {
      const {webp}=await api('getClassroomPage',{entryId},controller.signal);
      if(controller.signal.aborted)return;
      const img=el('img');
      img.alt='Pagina '+(page-3)+' del manuale di Platia e Mastri, edizione 2008';
      img.src='data:image/webp;base64,'+webp;
      await img.decode();
      if(!controller.signal.aborted)box.replaceChildren(img);
    } catch(err){
      if(!controller.signal.aborted && err.message!=='access')box.replaceChildren(el('p','La pagina non si è aperta.'),control('Riprova',()=>openPage(page,from)));
    }
  }
  function renderManual(item) {
    const source=$('sourceText'),pages=$('sourcePages');
    source.replaceChildren();pages.replaceChildren();
    $('manual').hidden=!item.sourceText?.length;
    if($('manual').hidden)return;
    for(const paragraph of item.sourceText){
      const p=el('p');richText(p,paragraph);source.append(p);
    }
    for(let page=item.pdfPage;page<=(item.pdfEnd || item.pdfPage);page++){
      const button=control('Vedi pagina '+(page-3),()=>openPage(page,button),'quiet');
      button.setAttribute('aria-haspopup','dialog');button.title='Pagina '+page+' del PDF';
      pages.append(button);
    }
  }
  function figureUrl(number){
    if(preview)return window.classroomLocalFigures?.[number];
    return (allBooks?'/api/figure-asset?kind=figure&figure=':'/api/asset?kind=figure&presentation=numberless-v2&figure=')+number;
  }
  function renderPlate(id,number) {
    const box=$(id);box.replaceChildren();box.hidden=!number;
    if(!number)return;
    const img=el('img'),label='Figura '+number;
    img.alt=label;img.src=figureUrl(number);
    img.onerror=()=>{box.replaceChildren(el('span',label+' · Immagine non disponibile'),control('Riprova',()=>renderPlate(id,number),'quiet'));};
    box.append(img,el('span',label));
  }
  function selectTopic(index, focus=false) {
    closeDetail(); state.index=index;state.quiz=0;state.mode='lesson';
    const l=lesson();
    bindTheoryVideo(l);
    $('topics').value=String(index);
    $('folio').textContent='Capitolo '+String(state.chapter.chapter).padStart(2,'0')+' · '+state.chapter.title_it;
    const bn=el('span',l.title_bn);bn.lang='bn';$('title').replaceChildren(l.title_it,bn);
    renderManual(l);
    $('exampleHeading').textContent=l.chapterNote?'Il capitolo in pratica':l.exampleFromQuiz?'Esempio dal quiz':'Esempio pratico';
    renderPlate('signPlate',l.figureNumber);
    richText($('italian'),l.theory_it);richText($('bangla'),l.theory_bn);richText($('tip'),l.memory_tip_bn);
    $('words').replaceChildren(...l.focus.map(name=>state.chapter.words.find(w=>w.it===name || w.aliases.some(a=>a.it===name))).filter(Boolean).map(w=>termControl(w,w.it,true)));
    $('scene').hidden=!l.scene;
    if(l.scene){$('poster').src=l.scene.poster;$('poster').alt=l.scene.alt;$('sceneCaption').textContent=l.scene.caption;}
    else {$('poster').removeAttribute('src');$('poster').alt='';$('sceneCaption').replaceChildren();}
    richText($('prompt'),l.prompt);
    $('figureExercise').hidden=!l.figureExercise;
    $('prompt').previousElementSibling.hidden=!l.prompt;
    $('prompt').parentElement.hidden=!l.prompt && !l.figureExercise;
    $('words').parentElement.hidden=!$('words').childElementCount;
    $('tip').parentElement.hidden=!l.memory_tip_bn;
    $('words').closest('.resources').hidden=$('words').parentElement.hidden && $('tip').parentElement.hidden;
    $('references').replaceChildren();
    if(!l.articles.length){
      const code=el('a','Consulta il Codice della strada in vigore ↗');
      code.href='https://aci.gov.it/approfondimento/il-codice-della-strada/';code.target='_blank';code.rel='noopener';$('references').append(code);
    }
    for(const article of l.articles){
      const a=el('a','Codice della strada · art. '+article+' ↗');
      a.href='https://aci.gov.it/codice-della-strada/art-'+article+'/';a.target='_blank';a.rel='noopener';$('references').append(a);
    }
    $('startQuiz').textContent='Quiz sull’argomento · '+l.quizzes.length+' →';
    $('startQuiz').hidden=!l.quizzes.length;
    const uploads=location.hash==='#caricamenti';
    $('uploadDesk').hidden=!uploads;$('uploadTopic').textContent=l.title_it;
    $('reading').hidden=uploads;$('practice').hidden=true;$('present').hidden=uploads;
    if(focus)focusTitle(uploads?'uploadTitle':'title');
  }
  function focusTitle(id) { const node=$(id);node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({block:'nearest'}); }
  function renderQuiz(focus=true) {
    if(!question())return;
    closeDetail(); state.mode='quiz';$('reading').hidden=true;$('practice').hidden=false;
    const l=lesson(),q=question();$('quizTitle').textContent=l.title_it;$('position').textContent='Domanda '+(state.quiz+1)+' / '+l.quizzes.length;
    richText($('question'),q.question);$('filmStatus').textContent='';
    renderPlate('quizPlate',/^\/img_sign\/(\d+)\.png$/i.exec(q.figure || '')?.[1]);
    $('quizWords').replaceChildren(...q.wordIds.map(id=>state.chapter.words.find(w=>w.id===id)).filter(Boolean).map(w=>termControl(w,w.it,true)));
    const answer=state.responses.get(q.id);
    $('feedback').textContent=answer===undefined?'':(answer===q.answer?'Risposta corretta.':'La risposta corretta è '+(q.answer?'vero.':'falso.'));
    for (const [id,value] of [['yes',true],['no',false]]) {$(id).classList.toggle('selected',answer===value);$(id).setAttribute('aria-pressed',String(answer===value));}
    $('prev').disabled=state.quiz===0;$('next').textContent=state.quiz===l.quizzes.length-1?'Torna alla lezione':'Successiva →';
    if(focus)focusTitle('quizTitle');
  }
  async function showFilm(kind,from,l=lesson(),figure) {
    const scene=kind==='scene', isFigure=kind==='figure';
    const title=scene?l.scene.caption:isFigure?'Video della figura '+figure:'Video del quiz';
    inspect(title,'',from);const box=$('detailContent');box.textContent='Apertura del video…';
    const controller=viewerRequest=new AbortController();
    try {
      const action=scene?'getClassroomScene':isFigure?'getFigureVideo':'getClassroomQuizVideo';
      const fields=isFigure?{figure:String(figure)}:scene?{entryId:l.id}:{entryId:l.id,questionId:String(question().id)};
      const data=scene && clipCache?.id===l.id ? clipCache.data : await api(action,fields,controller.signal);
      if(controller.signal.aborted || !detail.open)return;
      if(!scene && !data.available){box.textContent=preview?'I video caricati si consultano nell’aula connessa.':isFigure?'Per questa figura non è stato caricato un video.':'Per questa domanda non è stato caricato un video.';return;}
      let src=data.url;
      if(scene){
        clipCache={id:l.id,data};const bytes=Uint8Array.from(atob(data.mp4),c=>c.charCodeAt(0));
        src=mediaUrl=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
      }
      const video=el('video');video.controls=true;video.playsInline=true;video.autoplay=true;video.muted=scene;
      video.setAttribute('controlslist','nodownload');video.setAttribute('disablepictureinpicture','');video.oncontextmenu=e=>e.preventDefault();
      video.onerror=()=>{if(!controller.signal.aborted){detail.dataset.media='false';box.replaceChildren(el('p','Video non disponibile.'),control('Riprova',()=>showFilm(kind,from,l,figure)));}};
      detail.dataset.media='true';video.src=src;box.replaceChildren(video);video.play().catch(()=>{});
    }catch(err){if(!controller.signal.aborted && err.message!=='access')box.replaceChildren(el('p','Impossibile aprire il video.'),control('Riprova',()=>showFilm(kind,from,l,figure)));}
  }
  async function load(number=1) {
    if (!authorize()) return;
    loadRequest?.abort();const ctl=loadRequest=new AbortController();
    requestedChapter=number;
    const switching=number!==state.chapter?.chapter;
    const index=switching?0:state.index, oldMode=switching?'lesson':state.mode, oldQuiz=switching?0:state.quiz;
    if(switching){
      closeDetail();releaseTheoryButton();window.MagicQuizVideo?.reset();clipCache=null;state.responses.clear();
      studio.hidden=true;$('present').hidden=true;
      $('status').hidden=false;$('status').textContent='Apertura del capitolo…';
    }
    $('retry').hidden=true;$('reloadPhotos').disabled=true;
    if (!state.chapter){$('status').hidden=false;$('status').textContent='Apertura dell’aula…';}
    try {
      const {catalogue,chapter,photos,photosReady}=await api('getClassroom',{entryId:'chapter-'+number},ctl.signal);
      if(ctl.signal.aborted)return;
      state.chapter=chapter;state.photos=photos || {};state.terms=[];state.lookupOnClick=Boolean(preview) || !allBooks || !photosReady;
      for (const word of chapter.words) for(const name of new Set([word.it,...word.aliases.map(a=>a.it),...(word.forms || [])])) {
        const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        state.terms.push({word,re:new RegExp('(?<![\\p{L}\\p{M}\\p{N}_])'+escaped+'(?![\\p{L}\\p{M}\\p{N}_])','giu')});
      }
      $('chapters').replaceChildren(...(catalogue || [chapter]).map(c=>new Option(String(c.chapter).padStart(2,'0')+' · '+c.title_it,String(c.chapter))));
      $('chapters').value=String(chapter.chapter);
      $('topics').replaceChildren(...chapter.lessons.map((item,i)=>new Option(item.title_it,String(i))));
      $('photoStatus').hidden=photosReady;$('photoStatus').textContent='Tocca una parola per aprire la foto del dizionario All Books, quando disponibile.';
      $('reloadPhotos').hidden=photosReady || Boolean(preview);
      $('status').hidden=true;studio.hidden=false;$('present').hidden=false;
      selectTopic(index);if(oldMode==='quiz'){state.quiz=oldQuiz;renderQuiz(false);}
    }catch(err){
      if(ctl.signal.aborted || err.message==='access')return;
      $('status').textContent='Impossibile caricare l’aula.';$('status').hidden=false;$('retry').hidden=false;
    }finally{if(!ctl.signal.aborted)$('reloadPhotos').disabled=false;}
  }
  function openFigure(f,from) {
    inspect('Figura '+f.figure,'',from);
    const img=el('img');img.alt='Figura '+f.figure+' · '+f.question;
    $('detailContent').append(img);
    const prompt=el('p',f.question);
    const reveal=control('Mostra risposta',()=>{reveal.replaceWith(el('strong',f.answer?'Vero':'Falso'));});
    $('related').append(prompt,reveal);reveal.disabled=true;
    if(!preview) $('related').append(control('Cerca video della figura',()=>showFilm('figure',from,lesson(),f.figure)));
    img.onload=()=>{reveal.disabled=false;};
    const src=figureUrl(f.figure);
    img.onerror=()=>{img.hidden=true;const retry=control('Figura non disponibile · Riprova',()=>{retry.remove();img.hidden=false;img.src=src;});$('detailContent').append(retry);};
    img.src=src;
  }
  $('figureExercise').onclick=()=>openFigure(lesson().figureExercise,$('figureExercise'));
  window.addEventListener('hashchange',()=>{if(state.chapter)selectTopic(state.index,true);});
  $('topics').onchange=()=>selectTopic(Number($('topics').value));
  $('chapters').onchange=()=>load(Number($('chapters').value));
  $('scene').onclick=()=>showFilm('scene',$('scene'));$('quizFilm').onclick=()=>showFilm('quiz',$('quizFilm'));
  $('startQuiz').onclick=()=>renderQuiz();$('toLesson').onclick=()=>selectTopic(state.index,true);
  $('prev').onclick=()=>{if(state.quiz>0){state.quiz--;renderQuiz();}};
  $('next').onclick=()=>{if(state.quiz+1<lesson().quizzes.length){state.quiz++;renderQuiz();}else selectTopic(state.index,true);};
  for(const [id,value] of [['yes',true],['no',false]]) $(id).onclick=()=>{state.responses.set(question().id,value);renderQuiz(false);};
  $('close').onclick=closeDetail; detail.addEventListener('cancel',e=>{e.preventDefault();closeDetail();});
  detail.addEventListener('click',e=>{if(e.target===detail)closeDetail();});
  detail.addEventListener('close',()=>{if(!detail.open && trigger?.isConnected)trigger.focus({preventScroll:true});});
  $('present').onclick=()=>{const on=document.body.classList.toggle('presenting');$('present').textContent=on?'Termina presentazione':'Presenta';$('present').setAttribute('aria-pressed',String(on));};
  $('retry').onclick=()=>load(requestedChapter);$('reloadPhotos').onclick=()=>load(state.chapter.chapter);
  if(preview)$('exit').hidden=true;
  window.addEventListener('pagehide',clear);
  window.addEventListener('pageshow',e=>{if(e.persisted)load();});
  window.addEventListener('storage',()=>{if(!preview && credentials().accessToken!==activeToken){clear();load();}});
  load();
})();
