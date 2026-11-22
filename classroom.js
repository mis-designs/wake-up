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
  let viewerRequest, loadRequest, mediaUrl, trigger;
  const session=preview?null:window.ClassroomSession.create({allBooks,credentials,lock:clear});
  let clipCache = null;
  let theoryButton, wordVideoButton;
  let sceneCuts={}, sceneCutsReady=true, theoryStatus;
  let figureRequest=new AbortController(), lessonFigureReady;
  const figureMedia=new Map(), pendingFigures=new Map();
  function resetFigureReads(){
    figureRequest.abort();figureRequest=new AbortController();pendingFigures.clear();lessonFigureReady=undefined;
  }
  function figureVideo(number){
    const key=String(number),cached=figureMedia.get(key);
    if(cached && cached.expires>Date.now())return Promise.resolve(cached.value);
    if(pendingFigures.has(key))return pendingFigures.get(key);
    const {signal}=figureRequest;
    const read=api('getClassroomFigureVideo',{questionId:'fv_'+key},signal).then(value=>{
      signal.throwIfAborted();
      if(typeof value.available!=='boolean' || value.error || (value.available && !value.url))throw Error('video_unavailable');
      figureMedia.set(key,{value,expires:Date.now()+60000});
      if(figureMedia.size>64)figureMedia.delete(figureMedia.keys().next().value);
      return value;
    }).finally(()=>{if(pendingFigures.get(key)===read)pendingFigures.delete(key);});
    pendingFigures.set(key,read);return read;
  }
  function addFigureNumber(host,number,prefix=' · Figura '){
    if(number && session?.key && session.matches(session.key) && window.AccountRole.status(credentials().accessToken).master){
      host.append(el('span',prefix+number,'master-figure-number'));
    }
  }
  function appendFigureVideo(box,number,onStatus){
    if(!number || preview)return;
    const button=control('Guarda il video',()=>{
      if(button.dataset.retry){void check();return;}
      void showFilm('figure',button,lesson(),number);
    },'quiet');
    button.hidden=true;box.append(button);
    async function check(){
      const scope=figureRequest;
      try{
        const result=await figureVideo(number);
        if(scope.signal.aborted || !button.isConnected)return;
        delete button.dataset.retry;button.textContent='Guarda il video';addFigureNumber(button,number);
        button.hidden=!result.available;onStatus?.(result.available);
      }catch{
        if(scope.signal.aborted || !button.isConnected)return;
        button.hidden=false;button.dataset.retry='true';button.textContent='Riprova video';addFigureNumber(button,number);
        onStatus?.(undefined);
      }
    }
    void check();
  }
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
    releaseWordVideo();
    stopViewer();
    if (detail.open) detail.close();
    $('detailContent').replaceChildren(); $('related').replaceChildren();
  }
  function clear(temporary=false) {
    session?.stop();loadRequest?.abort();closeDetail();
    resetFigureReads();figureMedia.clear();
    releaseTheoryButton();window.MagicQuizVideo?.reset();
    sceneCuts={};sceneCutsReady=true;theoryStatus=null;
    for(const url of localTheory.values()) URL.revokeObjectURL(url);
    localTheory.clear();
    clipCache = null; state.chapter=null; state.photos={}; state.terms=[]; state.responses.clear(); discoveredPhotos.clear();
    studio.hidden=true; $('present').hidden=true; $('retry').hidden=temporary!==true;
    $('present').textContent='Presenta';$('present').setAttribute('aria-pressed','false');
    $('status').hidden=false; $('status').textContent=temporary===true?'Impossibile verificare l’accesso. Controlla la connessione e riprova.':'Accedi come Master admin per aprire l’aula.';
    for (const id of ['italian','bangla','tip','words','title','question','topics','chapters','folio','sourceText','sourcePages','signPlate','quizPlate','detailTitle','detailBn','sceneCaption','prompt','feedback','quizTitle','references','quizWords','uploadTopic']) $(id).replaceChildren();
    requestedChapter=1;state.index=0;state.quiz=0;state.mode='lesson';
    $('poster').removeAttribute('src'); document.body.classList.remove('presenting');
  }
  async function api(action, fields, signal) {
    if (preview) return preview(action,fields);
    if (!await session.ensure()) throw new Error('access');
    const scope=session.key;
    for(let attempt=0;attempt<2;attempt++){
      signal.throwIfAborted();
      const auth=credentials();
      const res=await fetch('/api/quiz',{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.accessToken},body:JSON.stringify({action,...auth,...fields})});
      const result=await res.json().catch(()=>({}));signal.throwIfAborted();
      if(!session.matches(scope))throw new Error('access');
      if(res.ok)return result;
      if([401,403].includes(res.status)){
        // Only read operations can be replayed automatically.
        if(!attempt && action.startsWith('get')){
          if(await session.ensure(auth.accessToken===credentials().accessToken))continue;
          throw new Error('access');
        }
        if(auth.accessToken===credentials().accessToken)clear();
        throw new Error('access');
      }
      throw new Error(result.error || 'unavailable');
    }
  }
  function inspect(title,bn,from) {
    releaseWordVideo();delete detail.dataset.word;
    stopViewer(); trigger=from;
    $('detailContent').replaceChildren(); $('related').replaceChildren();
    $('detailTitle').textContent=title; $('detailBn').textContent=bn || '';
    detail.dataset.media='false';delete detail.dataset.page;delete detail.dataset.editing;if (!detail.open) detail.showModal();detail.scrollTop=0;$('close').focus();
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
    const box=$('detailContent'), img=el('img');
    const version=Math.floor(Date.now()/photoVersionMs);
    const origin=allBooks && !preview ? location.origin : libraryOrigin;
    const params=new URLSearchParams({action:'serve',wordKey:word.id,italian:word.it,concept:'1',v:String(version)});
    const publicUrl=origin+'/api/dictionary-images?'+params;
    const fallback=photo?.proxy ? new URL(photo.proxy,origin).href : '';
    img.alt=photo?.alt || word.it;
    img.referrerPolicy='no-referrer';
    const cancel=viewerRequest=new AbortController();
    cancel.signal.addEventListener('abort',()=>{
      img.onload=img.onerror=null;img.removeAttribute('src');from?.removeAttribute('aria-busy');
    },{once:true});
    from?.setAttribute('aria-busy','true');
    img.onload=()=>{
      if(cancel.signal.aborted)return;
      box.replaceChildren(img);detail.dataset.media='true';from?.removeAttribute('aria-busy');
      if (!photo) discoveredPhotos.set(word.id,version);
      for(const button of document.querySelectorAll('[data-word-id]')) if(button.dataset.wordId===word.id)styleWord(button);
    };
    img.onerror=()=>{
      if(cancel.signal.aborted)return;
      if(fallback && img.src!==fallback){img.src=fallback;return;}
      from?.removeAttribute('aria-busy');discoveredPhotos.delete(word.id);
      for(const button of document.querySelectorAll('[data-word-id]')) if(button.dataset.wordId===word.id)styleWord(button);
      detail.dataset.media='false';box.replaceChildren();
    };
    img.src=photo?.url || publicUrl;
  }
  function releaseWordVideo(){
    if(wordVideoButton)window.MagicQuizVideo?.destroyButton(wordVideoButton);
    wordVideoButton=null;
  }
  function appendWordVideo(actions,item,from,confirmed=false){
    if(!preview && !sceneCutsReady && !confirmed){
      // A temporarily unavailable chapter index cannot establish which clip belongs to this word.
      const ctl=viewerRequest || (viewerRequest=new AbortController());
      api('getClassroomSceneSettings',{entryId:item.id},ctl.signal).then(({cut})=>{
        if(ctl.signal.aborted || !actions.isConnected)return;
        if(cut)sceneCuts[item.id]=cut;else delete sceneCuts[item.id];
        appendWordVideo(actions,item,from,true);
      }).catch(()=>{
        if(ctl.signal.aborted || !actions.isConnected)return;
        const retry=control('Riprova video',()=>{retry.remove();appendWordVideo(actions,item,from);});
        actions.append(retry);
      });
      return;
    }
    const saved=sceneCuts[item.id];
    const hasScene=Boolean(saved || (item.scene && item.id!=='strada'));
    const scene=control('Guarda il video',()=>showFilm('scene',from,item));
    scene.hidden=true;
    if(hasScene)actions.append(scene);
    if(preview){
      if(localTheory.has(item.id))actions.append(control('Guarda il video',()=>previewTheory(item,from)));
      else scene.hidden=!hasScene;
      return;
    }
    if(!document.body.classList.contains('presenting')){
      actions.append(control(saved?'Modifica spezzone':'Imposta spezzone',()=>editScene(item,from)));
    }
    if(saved){
      scene.hidden=false;return;
    }
    const button=createTheoryButton(item,{
      isCurrent:()=>wordVideoButton===button,
      isPresenting:()=>true,
      onTheoryStatus:status=>{
        button.hidden=status?.available!==true;
        scene.hidden=!hasScene || status?.available!==false || Boolean(status.error) || status.availability==='unknown';
      },
      onClose:()=>{if(from?.isConnected)from.focus({preventScroll:true});}
    });
    button.textContent='Guarda il video';button.setAttribute('aria-label','Guarda il video');
    button.setAttribute('aria-haspopup','dialog');button.hidden=true;
    button.addEventListener('click',()=>{stopViewer();detail.close();},{capture:true});
    wordVideoButton=button;actions.append(button);
  }
  function openTerm(word, from, label=word.it) {
    const formBn=word.formsBn?.[label.toLocaleLowerCase('it')];
    inspect(formBn ? label : word.it,formBn || word.bn,from);
    detail.dataset.word='true';
    showWordPhoto(word,from);
    for(const entry of [word.definition,...(word.examples || [])]){
      if(!entry?.it && !entry?.bn)continue;
      const line=el('div',null,'dictionary-line');
      if(entry.it)line.append(el('p',entry.it));
      if(entry.bn){const bn=el('p',entry.bn);bn.lang='bn';line.append(bn);}
      $('related').append(line);
    }
    const target=state.chapter.lessons.findIndex(l=>word.lessonId ? l.id===word.lessonId : l.title_it.toLocaleLowerCase('it')===word.it.toLocaleLowerCase('it'));
    const item=state.chapter.lessons[target] || state.chapter.linkedLessons?.[word.lessonId];
    if (item || word.figureNumber) {
      const links=el('div',null,'word-actions');
      $('related').append(links);
      if(item){
        const visit=quiz=>{
          if(target<0)return load(item.chapter,{id:item.id,quiz});
          selectTopic(target,true);if(quiz)renderQuiz();
        };
        if (target!==state.index) links.append(control('Apri la lezione · '+item.title_it,()=>visit(false)));
        appendWordVideo(links,item,from);
        if (item.figureExercise) {
          const button=control('Mostra figura',()=>openFigure(item.figureExercise,from));
          addFigureNumber(button,item.figureExercise.figure);links.append(button);
        }
        if(item.quizzes?.length || item.hasQuizzes) links.append(control('Quiz · '+item.title_it,()=>visit(true)));
      }
      appendFigureVideo(links,item?.figureNumber || word.figureNumber);
    }
    const relatedIds=new Set(state.chapter.comparisons.filter(ids=>ids.includes(word.id)).flat());
    const comparisons=el('div',null,'word-actions word-comparisons');
    for(const other of state.chapter.words){
      if(other.id!==word.id && relatedIds.has(other.id)) comparisons.append(control('Confronta con '+other.it,()=>openTerm(other,from)));
    }
    if(comparisons.childElementCount)$('related').append(comparisons);
  }
  function termControl(word, label, card) {
    const button=control(label,()=>openTerm(word,button,label),card?'word':'inline');
    button.dataset.wordId=word.id;button.dataset.wordLabel=label;
    button.setAttribute('aria-haspopup','dialog');
    styleWord(button);
    if (card) { const bn=el('span',word.bn);bn.lang='bn';button.replaceChildren(el('b',word.it),bn); }
    return button;
  }
  function richText(node,text) {
    const focus=new Set(lesson().focus), spans=[];
    for (const {word,re} of state.terms) {
      if (!word.formsBn && !word.lessonId && !word.figureNumber && !focus.has(word.it) && !knownPhoto(word.id) && !state.lookupOnClick) continue;
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
  function renderLessonVideo(item, status) {
    const host = $('theoryVideo'), button = host.firstElementChild;
    if (!button) return;
    theoryStatus=status;
    const cut=sceneCuts[item.id];
    const available = status?.available === true;
    const missing = status?.available === false && !status.error && status.availability !== 'unknown';
    host.hidden=Boolean(item.figureNumber && !preview && missing && lessonFigureReady!==false);
    const sample = missing && !cut && sceneCutsReady && item.scene;
    $('scene').hidden = !sample && !(missing && (cut || !sceneCutsReady));
    $('scene').querySelector('small').textContent=cut ? 'Estratto · '+(cut.end-cut.start)+' s' : sample ? 'Filmato TMM · 7 s' : 'Estratto';
    if (sample) {
      $('poster').src = sample.poster;
      $('poster').alt = sample.alt;
      $('sceneCaption').textContent = sample.caption;
    } else {
      $('poster').removeAttribute('src');
      $('poster').alt = '';
      $('sceneCaption').textContent=cut || !sceneCutsReady ? item.title_it : '';
    }
    host.classList.toggle('featured-video', available);
    if (!available) {
      button.textContent = missing ? 'Carica video teoria' : 'Apri video teoria';
      button.setAttribute('aria-label', button.textContent + ' · ' + item.title_it);
      return;
    }
    const seconds = Math.round(status.duration);
    const duration = Number.isFinite(seconds) && seconds > 0
      ? ' · ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '';
    const caption = el('span', null, 'video-caption');
    caption.append(el('small', 'Video teoria' + duration), el('strong', item.title_it));
    const play = el('span', '▶', 'video-play');
    play.setAttribute('aria-hidden', 'true');
    button.replaceChildren(caption, play);
    button.setAttribute('aria-label', 'Riproduci il video di ' + item.title_it);
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
      localTheory.set(item.id,URL.createObjectURL(file));renderLessonVideo(item,{available:true});previewTheory(item,from);
      if(previous) URL.revokeObjectURL(previous);
    };
  }
  function createTheoryButton(item,{isCurrent,...options}){
    const id='tv_'+(item.chapter || state.chapter.chapter)+'_'+item.id,scope=session.key;
    return window.MagicQuizVideo.createButton({
      theoryVideo:true,question:{id,question:item.title_it},cacheScope:scope,
      isCurrent:()=>session.matches(scope) && isCurrent(),
      request:(action,video,signal)=>api(action,{questionId:id,video},signal),...options
    });
  }
  function bindTheoryVideo(item){
    releaseTheoryButton();
    const uploads=location.hash==='#caricamenti';
    if(preview){
      theoryButton=control('Video teoria',()=>previewTheory(item,theoryButton));
    }else{
      theoryButton=createTheoryButton(item,{
        onTheoryStatus:uploads ? undefined : status=>renderLessonVideo(item,status),
        isCurrent:()=>state.chapter && lesson().id===item.id,
        isPresenting:()=>document.body.classList.contains('presenting')
      });
    }
    $(uploads?'uploadDeskControls':'theoryVideo').append(theoryButton);
    if (!uploads) renderLessonVideo(item,preview ? {available:localTheory.has(item.id)} : null);
    $('sceneTools').hidden=Boolean(preview) || uploads;
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
    for(const [index,paragraph] of item.sourceText.entries()){
      const p=el('p');p.lang='it';richText(p,paragraph);source.append(p);
      const translated=item.sourceTextBn?.[index];
      if(translated){
        const block=el('div',null,'manual-bangla');block.lang='bn';
        const label=el('h3','বাংলা অনুবাদ');
        const body=el('p');richText(body,translated);
        block.append(label,body);source.append(block);
      }
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
    const img=el('img');
    img.alt=id==='signPlate'?lesson().title_it:'Figura della domanda';img.src=figureUrl(number);
    img.onerror=()=>{img.replaceWith(control('Riprova immagine',()=>renderPlate(id,number),'quiet'));};
    box.append(img);addFigureNumber(box,number,'Figura ');
    appendFigureVideo(box,number,id==='signPlate' ? available=>{
      lessonFigureReady=available;renderLessonVideo(lesson(),theoryStatus);
    } : undefined);
  }
  function selectTopic(index, focus=false) {
    closeDetail();resetFigureReads();state.index=index;state.quiz=0;state.mode='lesson';
    const l=lesson();
    bindTheoryVideo(l);
    $('topics').value=String(index);window.TmmPicker?.refresh($('topics'));
    $('folio').textContent='Capitolo '+String(state.chapter.chapter).padStart(2,'0')+' · '+state.chapter.title_it;
    const bn=el('span',l.title_bn);bn.lang='bn';$('title').replaceChildren(l.title_it,bn);
    renderManual(l);
    $('exampleHeading').textContent=l.chapterNote?'Il capitolo in pratica':l.exampleFromQuiz?'Esempio dal quiz':'Esempio pratico';
    const uploads=location.hash==='#caricamenti';
    renderPlate('signPlate',uploads?null:l.figureNumber);
    if(uploads)appendFigureVideo($('uploadDeskControls'),l.figureNumber);
    richText($('italian'),l.theory_it);richText($('bangla'),l.theory_bn);richText($('tip'),l.memory_tip_bn);
    const inText=new Set([...$('reading').querySelectorAll('#sourceText [data-word-id],#italian [data-word-id],#bangla [data-word-id]')].map(b=>b.dataset.wordId));
    const focusWords=l.focus.length ? l.focus.map(name=>state.chapter.words.find(w=>w.it===name || w.aliases.some(a=>a.it===name))).filter(Boolean)
      : state.chapter.words.filter(w=>inText.has(w.id) && (w.lessonId || w.figureNumber || knownPhoto(w.id))).slice(0,10);
    $('words').replaceChildren(...focusWords.map(w=>termControl(w,w.it,true)));
    richText($('prompt'),l.prompt);
    $('figureExercise').hidden=!l.figureExercise;
    $('prompt').previousElementSibling.hidden=!l.prompt;
    $('prompt').parentElement.hidden=!l.prompt && !l.figureExercise;
    $('words').parentElement.hidden=!$('words').childElementCount;
    $('tip').parentElement.hidden=!l.memory_tip_bn;
    $('words').closest('.resources').hidden=$('words').parentElement.hidden && $('tip').parentElement.hidden;
    $('references').replaceChildren();
    if(!l.articles.length){
      const code=el('a','Consulta il Codice della strada in vigore','tmm-nav tmm-nav-external');
      code.href='https://aci.gov.it/approfondimento/il-codice-della-strada/';code.target='_blank';code.rel='noopener';$('references').append(code);
    }
    for(const article of l.articles){
      const a=el('a','Codice della strada · art. '+article,'tmm-nav tmm-nav-external');
      a.href='https://aci.gov.it/codice-della-strada/art-'+article+'/';a.target='_blank';a.rel='noopener';$('references').append(a);
    }
    $('startQuiz').textContent='Quiz sull’argomento · '+l.quizzes.length;
    $('startQuiz').hidden=!l.quizzes.length;
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
    $('prev').disabled=state.quiz===0;$('next').textContent=state.quiz===l.quizzes.length-1?'Torna alla lezione':'Successiva';
    $('next').classList.toggle('tmm-nav',state.quiz<l.quizzes.length-1);
    $('next').classList.toggle('tmm-nav-back',state.quiz===l.quizzes.length-1);
    if(focus)focusTitle('quizTitle');
  }
  function editScene(item,from) {
    if(preview || document.body.classList.contains('presenting'))return;
    inspect('Spezzone · '+item.title_it,'',from);
    detail.dataset.editing='true';
    const box=$('detailContent'),controller=viewerRequest=new AbortController();
    box.textContent='Apertura delle impostazioni…';
    const reopen=()=>editScene(item,from);
    window.ClassroomSceneEditor.edit({api,item,parent:'tv_'+(item.chapter || state.chapter.chapter)+'_'+item.id,box,signal:controller.signal,reopen,onSaved:cut=>{
      sceneCuts[item.id]=cut;clipCache=null;
      if(item===lesson())renderLessonVideo(item,theoryStatus);
    }}).catch(()=>{if(!controller.signal.aborted)box.replaceChildren(el('p','Impossibile aprire le impostazioni.'),control('Riprova',reopen));});
  }
  async function showFilm(kind,from,l=lesson(),figure) {
    const scene=kind==='scene', isFigure=kind==='figure';
    const title=scene?(sceneCuts[l.id]?l.title_it:l.scene?.caption || l.title_it):isFigure?'Video della figura':'Video del quiz';
    inspect(title,'',from);if(isFigure)addFigureNumber($('detailTitle'),figure,' ');
    const box=$('detailContent');box.textContent='Apertura del video…';
    const controller=viewerRequest=new AbortController();
    try {
      const action=scene?'getClassroomScene':isFigure?'getFigureVideo':'getClassroomQuizVideo';
      const fields=isFigure?{figure:String(figure)}:scene?{entryId:l.id}:{entryId:l.id,questionId:String(question().id)};
      let cut=sceneCuts[l.id];
      if(scene && !preview) {
        const settings=await api('getClassroomSceneSettings',fields,controller.signal);
        cut=settings.cut;
        if(cut)sceneCuts[l.id]=cut;else delete sceneCuts[l.id];
        if(l===lesson())renderLessonVideo(l,theoryStatus);
        if(!cut && !l.scene){
          box.textContent='Nessuno spezzone per questa lezione.';
          if(!document.body.classList.contains('presenting'))$('related').append(control('Imposta spezzone',()=>editScene(l,from)));
          return;
        }
        $('detailTitle').textContent=cut?l.title_it:l.scene.caption;
      }
      const data=isFigure && !preview ? await figureVideo(figure) : scene && cut ? null : scene && clipCache?.id===l.id ? clipCache.data : await api(action,fields,controller.signal);
      if(controller.signal.aborted || !detail.open)return;
      if(!scene && !data.available){box.textContent=preview?'I video caricati si consultano nell’aula connessa.':isFigure?'Per questa figura non è stato caricato un video.':'Per questa domanda non è stato caricato un video.';return;}
      let src=data?.url;
      if(scene && cut){
        const blob=await window.ClassroomSceneEditor.movie(api,l.id,cut,controller.signal);
        controller.signal.throwIfAborted();
        src=mediaUrl=URL.createObjectURL(blob);
      } else if(scene){
        clipCache={id:l.id,data};const bytes=Uint8Array.from(atob(data.mp4),c=>c.charCodeAt(0));
        src=mediaUrl=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
      }
      const video=el('video');video.controls=true;video.playsInline=true;video.autoplay=true;video.muted=scene && !cut?.audio;
      video.setAttribute('controlslist','nodownload');video.setAttribute('disablepictureinpicture','');video.oncontextmenu=e=>e.preventDefault();
      video.onerror=()=>{if(!controller.signal.aborted){if(isFigure)figureMedia.delete(String(figure));detail.dataset.media='false';box.replaceChildren(el('p','Video non disponibile.'),control('Riprova',()=>showFilm(kind,from,l,figure)));}};
      detail.dataset.media='true';video.src=src;box.replaceChildren(video);video.play().catch(()=>{});
      if(scene && !preview && !document.body.classList.contains('presenting')) {
        if(cut)$('related').append(el('p','Da '+cut.start+' a '+cut.end+' secondi'));
        $('related').append(control('Modifica spezzone',()=>editScene(l,from)));
      }
    }catch(err){if(!controller.signal.aborted && err.message!=='access'){
      box.replaceChildren(el('p',err.message==='scene_source_changed'?'Il filmato originale è stato rimosso o sostituito.':'Impossibile aprire il video.'),control('Riprova',()=>showFilm(kind,from,l,figure)));
      if(scene && !preview && !document.body.classList.contains('presenting'))box.append(control('Modifica spezzone',()=>editScene(l,from)));
    }}
  }
  async function load(number=1,destination) {
    if (!preview && !await session.ensure()) return;
    loadRequest?.abort();const ctl=loadRequest=new AbortController();
    requestedChapter=number;
    const switching=number!==state.chapter?.chapter;
    const chapterTrigger=document.activeElement?.closest('tmm-picker')?.select===$('chapters') ? document.activeElement : null;
    const index=switching?0:state.index, oldMode=switching?'lesson':state.mode, oldQuiz=switching?0:state.quiz;
    if(switching){
      closeDetail();resetFigureReads();releaseTheoryButton();window.MagicQuizVideo?.reset();clipCache=null;state.responses.clear();
      studio.hidden=true;$('present').hidden=true;
      $('status').hidden=false;$('status').textContent='Apertura del capitolo…';
    }
    $('retry').hidden=true;$('reloadPhotos').disabled=true;
    if (!state.chapter){$('status').hidden=false;$('status').textContent='Apertura dell’aula…';}
    try {
      const {catalogue,chapter,photos,photosReady,sceneCuts:storedCuts,sceneCutsReady:cutsReady}=await api('getClassroom',{entryId:'chapter-'+number},ctl.signal);
      if(ctl.signal.aborted)return;
      sceneCuts=storedCuts || {};sceneCutsReady=cutsReady!==false;
      state.chapter=chapter;state.photos=photos || {};state.terms=[];state.lookupOnClick=Boolean(preview) || !allBooks || !photosReady;
      for (const word of chapter.words) for(const name of new Set([word.it,...word.aliases.map(a=>a.it),...(word.forms || [])])) {
        const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        state.terms.push({word,re:new RegExp('(?<![\\p{L}\\p{M}\\p{N}_])'+escaped+'(?![\\p{L}\\p{M}\\p{N}_])','giu')});
      }
      $('chapters').replaceChildren(...(catalogue || [chapter]).map(c=>new Option(String(c.chapter).padStart(2,'0')+' · '+c.title_it,String(c.chapter))));
      $('chapters').value=String(chapter.chapter);window.TmmPicker?.refresh($('chapters'));
      $('topics').replaceChildren(...chapter.lessons.map((item,i)=>new Option(item.title_it,String(i))));
      $('photoStatus').hidden=photosReady;$('photoStatus').textContent='Tocca una parola per aprire la foto del dizionario All Books, quando disponibile.';
      $('reloadPhotos').hidden=photosReady || Boolean(preview);
      $('status').hidden=true;studio.hidden=false;$('present').hidden=false;
      selectTopic(destination?Math.max(0,chapter.lessons.findIndex(l=>l.id===destination.id)):index,Boolean(destination));
      if(destination?.quiz || oldMode==='quiz'){state.quiz=destination?0:oldQuiz;renderQuiz(false);}
      if(chapterTrigger && document.activeElement===document.body)chapterTrigger.focus({preventScroll:true});
    }catch(err){
      if(ctl.signal.aborted || err.message==='access')return;
      $('status').textContent='Impossibile caricare l’aula.';$('status').hidden=false;$('retry').hidden=false;
    }finally{if(!ctl.signal.aborted)$('reloadPhotos').disabled=false;}
  }
  function openFigure(f,from) {
    inspect('Figura','',from);addFigureNumber($('detailTitle'),f.figure,' ');
    const img=el('img');img.alt=f.question || 'Figura dell’esercizio';
    $('detailContent').append(img);
    const prompt=el('p',f.question);
    const reveal=control('Mostra risposta',()=>{reveal.replaceWith(el('strong',f.answer?'Vero':'Falso'));});
    $('related').append(prompt,reveal);reveal.disabled=true;
    appendFigureVideo($('related'),f.figure);
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
  $('editScene').onclick=()=>editScene(lesson(),$('editScene'));
  $('startQuiz').onclick=()=>renderQuiz();$('toLesson').onclick=()=>selectTopic(state.index,true);
  $('prev').onclick=()=>{if(state.quiz>0){state.quiz--;renderQuiz();}};
  $('next').onclick=()=>{if(state.quiz+1<lesson().quizzes.length){state.quiz++;renderQuiz();}else selectTopic(state.index,true);};
  for(const [id,value] of [['yes',true],['no',false]]) $(id).onclick=()=>{state.responses.set(question().id,value);renderQuiz(false);};
  $('close').onclick=closeDetail; detail.addEventListener('cancel',e=>{e.preventDefault();closeDetail();});
  detail.addEventListener('click',e=>{if(e.target===detail)closeDetail();});
  detail.addEventListener('close',()=>{if(!detail.open && trigger?.isConnected && !document.querySelector('.quiz-video-overlay'))trigger.focus({preventScroll:true});});
  $('present').onclick=()=>{const on=document.body.classList.toggle('presenting');$('present').textContent=on?'Termina presentazione':'Presenta';$('present').setAttribute('aria-pressed',String(on));};
  $('retry').onclick=()=>load(requestedChapter);$('reloadPhotos').onclick=()=>load(state.chapter.chapter);
  if(preview)$('exit').hidden=true;
  window.addEventListener('pagehide',clear);
  window.addEventListener('pageshow',e=>{if(e.persisted)load();});
  function resumeSession(){
    if(!session || document.hidden)return;
    if(session.key && !session.matches(session.key))clear();
    if(state.chapter)void session.ensure();else void load(requestedChapter);
  }
  window.addEventListener('storage',event=>{
    if(!event.key || event.key===(allBooks?'allBooks.':'')+'accessToken'){
      if(session?.key && !session.matches(session.key))clear();
      resumeSession();
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)session?.suspend();else resumeSession();});
  window.addEventListener('online',resumeSession);
  load();
})();
