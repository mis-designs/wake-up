(() => {
  'use strict';
  async function movie(api,lessonId,selection,signal) {
    if(selection.sourceVersion)return ClassroomClipMedia.excerpt(api,selection,signal);
    let cursor=selection.start;
    const chunks=[];
    do {
      const video={source:selection.source,start:selection.start,end:selection.end,cursor};
      const part=await api('getClassroomSceneSource',{entryId:lessonId,video},signal);
      signal.throwIfAborted();
      chunks.push(Uint8Array.from(atob(part.mp4),c=>c.charCodeAt(0)));
      if(part.next!==null && (!Number.isInteger(part.next) || part.next<=cursor || part.next>=selection.end)) throw Error('invalid_part');
      cursor=part.next;
    } while(cursor!==null);
    return new Blob(chunks,{type:'video/mp4'});
  }

  async function edit({api,item,parent,box,signal,onSaved,reopen}) {
    const [settings,archive]=await Promise.all([
      api('getClassroomSceneSettings',{entryId:item.id},signal),
      api('getTheorySources',{questionId:parent,video:{includeSections:true}},signal).catch(()=>null)
    ]);
    const {cut}=settings;
    const uploaded=[...(archive?.sources || [])].sort((a,b)=>Number(b.id===parent)-Number(a.id===parent) || a.title.localeCompare(b.title,'it',{numeric:true}));
    const sources=[...uploaded,...settings.sources];
    signal.throwIfAborted();
    const form=document.getElementById('sceneEditor').content.firstElementChild.cloneNode(true);
    const field=name=>form.elements.namedItem(name);
    const source=field('source'),start=field('start'),end=field('end'),audio=field('audio');
    const player=form.querySelector('video'),status=form.querySelector('[role=status]');
    const preview=field('preview'),save=field('save'),retry=field('retry');
    let revision=cut?.revision || 0, previous=cut, request, url, ready=false, saving=false, previewing=false, endTimer;
    const fileInput=field('file'),note=form.querySelector('.source-note');
    let file,prepared,chosenLocal;
    const local={id:'local',title:'File dal dispositivo',duration:0};
    const sectionNames={theory:'Teoria',figure:'Figure',quiz:'Quiz'};
    const groups={};
    for(const [id,title] of Object.entries(sectionNames)){
      const group=document.createElement('optgroup');
      group.label=title;groups[id]=group;source.append(group);
    }
    function addUploaded(s){
      const section=s.section || 'theory';
      const label=sectionNames[section]+' · '+s.title+(s.id===parent?' · Questa lezione':'');
      groups[section].append(new Option(label,s.id));
    }
    uploaded.forEach(addUploaded);
    const stock=document.createElement('optgroup');stock.label='Filmati della biblioteca';source.append(stock);
    for(const s of settings.sources)stock.append(new Option('Biblioteca · '+s.title,s.id));
    if(cut && !sources.some(s=>s.id===cut.source)){
      sources.unshift({id:cut.source,missing:true,duration:cut.end});
      source.add(new Option('Sorgente salvata non disponibile',cut.source));
    }
    const libraryDefault=archive && !archive.unavailable?.includes('theory') && item.id!=='strada' ? item.scene?.id : null;
    const defaultSource=cut?.source || uploaded.find(s=>s.id===parent)?.id || libraryDefault;
    if(!defaultSource)source.prepend(new Option('Scegli un filmato',''));
    source.value=defaultSource || '';
    if(!archive || archive.unavailable?.length){
      if(archive?.unavailable?.length)note.textContent='Video temporaneamente non disponibili · '+archive.unavailable.map(id=>sectionNames[id]).join(', ');
      note.hidden=false;field('refresh').hidden=false;field('refresh').onclick=reopen;
    }
    fileInput.onchange=()=>{
      const next=fileInput.files[0];if(!next)return;
      file=next;prepared=null;chosenLocal=null;
      if(!sources.includes(local)){sources.push(local);source.add(new Option('',local.id));}
      Array.from(source.options).find(o=>o.value==='local').textContent=file.name;
      source.value=local.id;window.TmmPicker?.refresh(source);void loadSource(true);
    };
    const selected=()=>sources.find(s=>s.id===source.value);
    function values(){
      const s=selected();
      if(!s)return {};
      return {source:s.id,...(s.version?{sourceVersion:s.version}:{}),start:start.valueAsNumber,end:end.valueAsNumber,audio:audio.checked};
    }
    function stopPreview(){previewing=false;clearTimeout(endTimer);}
    function dispose(){
      request?.abort();stopPreview();player.pause();player.removeAttribute('src');player.load();
      if(url) URL.revokeObjectURL(url);
      url=null;ready=false;
    }
    signal.addEventListener('abort',dispose,{once:true});
    function update() {
      const v=values();
      const valid=Number.isFinite(v.start) && Number.isFinite(v.end) &&
        (selected().version || selected()===local || (Number.isInteger(v.start) && Number.isInteger(v.end))) && v.start>=0 && v.end>v.start && v.end<=selected().duration;
      const unchanged=previous && Object.keys(v).every(k=>v[k]===previous[k]);
      save.disabled=!ready || !valid || saving || unchanged;
      preview.disabled=!ready || !valid || saving;
      if(ready && !valid) status.textContent='La fine deve seguire l’inizio e rientrare nella durata del filmato.';
      return valid;
    }
    async function loadSource(reset) {
      dispose();request=new AbortController();
      const active=AbortSignal.any([request.signal,signal]);
      const s=selected();
      if(!s){start.value=end.value='';form.querySelector('output').textContent='';retry.hidden=true;status.textContent='';update();return;}
      const initial=previous?.source===s.id && (!s.version || previous.sourceVersion===s.version) ? previous : null;
      const precise=s===local || Boolean(s.version);
      start.step=end.step=precise?'any':'1';end.min=precise?'0.001':'1';
      if(s===local && reset)s.duration=0;
      if(reset) {
        start.value=initial?.start ?? (item.scene?.id===s.id?s.defaultStart:0);
        end.value=initial?.end ?? Math.min(s.duration,Number(start.value)+7);
        audio.checked=initial?.audio ?? precise;
      }
      start.max=String(s.duration);end.max=String(s.duration);
      form.querySelector('output').textContent='Durata · '+s.duration+' s';
      player.muted=!audio.checked;retry.hidden=true;update();status.textContent='Apertura del filmato…';
      try {
        if(s.missing)throw Error('scene_source_changed');
        const blob=s===local ? file : s.version ? await ClassroomClipMedia.original(api,s.id,s.version,active)
          : await movie(api,item.id,{source:s.id,start:0,end:s.duration},active);
        active.throwIfAborted();url=URL.createObjectURL(blob);player.src=url;
      } catch(error) {
        if(active.aborted)return;
        if(error.message==='scene_source_changed'){
          status.textContent='Il filmato originale è stato rimosso o sostituito.';
          field('refresh').hidden=false;field('refresh').onclick=reopen;
        }else{
          status.textContent='Il filmato non si è aperto.';retry.hidden=false;
        }
      }
    }
    player.onloadedmetadata=()=>{
      if(!url || player.currentSrc!==url)return;
      if(!Number.isFinite(player.duration) || player.duration<=0){status.textContent='Durata del video non disponibile.';return;}
      if(selected()===local && !local.duration){
        local.duration=player.duration;start.max=end.max=String(local.duration);
        start.value='0';end.value=String(Math.min(7,local.duration));
      }
      if(Number.isFinite(player.duration)) {
        form.querySelector('output').textContent='Durata · '+player.duration.toLocaleString('it-IT',{maximumFractionDigits:1})+' s';
      }
      ready=true;player.currentTime=start.valueAsNumber || 0;
      if(previous?.source===source.value && selected().version && selected().version!==previous.sourceVersion){
        status.textContent='Il filmato originale è stato sostituito. Verifica inizio e fine prima di salvare.';
      }else if(!status.textContent.includes('salvato'))status.textContent='';
      update();
    };
    player.onerror=()=>{if(!url || signal.aborted)return;ready=false;update();retry.hidden=false;status.textContent='Il filmato non si è aperto.';};
    function enforceEnd() {
      if(!previewing || player.paused)return;
      const remaining=end.valueAsNumber-player.currentTime;
      clearTimeout(endTimer);
      if(remaining<=0.025){player.pause();player.currentTime=Math.min(end.valueAsNumber,player.duration);stopPreview();}
      else endTimer=setTimeout(enforceEnd,Math.min(500,remaining*1000/Math.max(.1,player.playbackRate)));
    }
    player.ontimeupdate=enforceEnd;player.onplaying=enforceEnd;player.onpause=stopPreview;
    player.oncontextmenu=e=>e.preventDefault();
    source.onchange=()=>void loadSource(true);retry.onclick=()=>void loadSource(false);
    for(const input of [start,end,audio]) input.oninput=()=>{stopPreview();player.muted=!audio.checked;status.textContent='';update();};
    for(const name of ['start','end'])field(name+'Here').onclick=()=>{
      if(!ready)return;
      field(name).value=Math.min(selected().duration,(selected().version || selected()===local ? Math.round(player.currentTime*100)/100 : Math.floor(player.currentTime)));
      field(name).dispatchEvent(new Event('input'));
    };
    preview.onclick=()=>{
      if(!ready || !update())return;
      player.currentTime=start.valueAsNumber;player.muted=!audio.checked;previewing=true;
      player.play().then(enforceEnd).catch(()=>{stopPreview();status.textContent='Premi play sul filmato per ascoltarlo.';});
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(!ready || !update() || save.disabled)return;
      const data=values();saving=true;form.querySelector('fieldset').disabled=true;update();
      status.textContent='Salvataggio…';
      try {
        let range=data;
        if(selected()===local){
          const selection=data.start+'/'+data.end;
          if(data.end-data.start>600)throw Error('clip_too_long');
          if(!prepared || prepared.selection!==selection){
            status.textContent='Preparazione dei secondi selezionati…';
            prepared={...await ClassroomClipMedia.localCut(file,data.start,data.end,signal),selection};chosenLocal=null;
          }
          const name=item.title_it+' · '+data.start+'–'+data.end+' s.mp4';
          chosenLocal ??= await ClassroomClipMedia.upload(api,parent,prepared,name,signal,text=>{status.textContent=text;});
          range={source:chosenLocal.id,sourceVersion:chosenLocal.version,start:0,end:chosenLocal.duration,audio:data.audio};
        }
        const result=await api('saveClassroomSceneSettings',{entryId:item.id,video:{...range,revision}},signal);
        if(selected()===local && !signal.aborted){
          if(!sources.some(s=>s.id===chosenLocal.id)){sources.push(chosenLocal);addUploaded(chosenLocal);}
          source.value=chosenLocal.id;window.TmmPicker?.refresh(source);start.value='0';end.value=String(chosenLocal.duration);
          start.max=end.max=String(chosenLocal.duration);
          dispose();url=URL.createObjectURL(prepared.blob);player.src=url;ready=true;
        }
        signal.throwIfAborted();previous=result.cut;revision=result.cut.revision;onSaved(result.cut);status.textContent='Intervallo salvato.';
      } catch(error) {
        if(signal.aborted)return;
        if(error.message==='clip_export_failed' || error.message==='clip_too_long'){
          status.textContent=error.message==='clip_too_long'?'Scegli uno spezzone di massimo 10 minuti.':'Taglio non riuscito. Verifica il file e riprova.';return;
        }
        if(error.message==='scene_source_changed'){
          status.textContent='Questo filmato è stato sostituito. Ricarica le sorgenti e verifica i secondi.';field('reload').hidden=false;field('reload').onclick=reopen;return;
        }
        if(error.message==='scene_changed'){
          status.textContent='La lezione è stata modificata altrove.';
          const reload=field('reload');reload.hidden=false;reload.onclick=reopen;return;
        }
        status.textContent='Salvataggio non confermato. Puoi riprovare con questi secondi.';
      } finally {
        if(!signal.aborted && field('reload').hidden){saving=false;form.querySelector('fieldset').disabled=false;update();}
      }
    };
    box.replaceChildren(form);window.TmmPicker?.attach(source,'Filmato originale');await loadSource(true);
  }
  window.ClassroomSceneEditor={movie,edit};
})();
