(() => {
  'use strict';
  async function movie(api,lessonId,selection,signal) {
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

  async function edit({api,item,box,signal,onSaved,reopen}) {
    const {cut,sources}=await api('getClassroomSceneSettings',{entryId:item.id},signal);
    signal.throwIfAborted();
    const form=document.getElementById('sceneEditor').content.firstElementChild.cloneNode(true);
    const field=name=>form.elements.namedItem(name);
    const source=field('source'),start=field('start'),end=field('end'),audio=field('audio');
    const player=form.querySelector('video'),status=form.querySelector('[role=status]');
    const preview=field('preview'),save=field('save'),retry=field('retry');
    let revision=cut?.revision || 0, previous=cut, request, url, ready=false, saving=false, previewing=false, endTimer;
    for(const s of sources) source.add(new Option(s.title,s.id));
    source.value=cut?.source || item.scene?.id || sources[0].id;
    const selected=()=>sources.find(s=>s.id===source.value);
    function values(){return {source:source.value,start:start.valueAsNumber,end:end.valueAsNumber,audio:audio.checked};}
    function stopPreview(){previewing=false;clearTimeout(endTimer);}
    function dispose(){
      request?.abort();stopPreview();player.pause();player.removeAttribute('src');player.load();
      if(url) URL.revokeObjectURL(url);
      url=null;ready=false;
    }
    signal.addEventListener('abort',dispose,{once:true});
    function update() {
      const v=values();
      const valid=Number.isInteger(v.start) && Number.isInteger(v.end) && v.start>=0 && v.end>v.start && v.end<=selected().duration;
      const unchanged=previous && Object.keys(v).every(k=>v[k]===previous[k]);
      save.disabled=!ready || !valid || saving || unchanged;
      preview.disabled=!ready || !valid || saving;
      if(ready && !valid) status.textContent='La fine deve seguire l’inizio e rientrare nella durata del filmato.';
      return valid;
    }
    async function loadSource(reset) {
      dispose();request=new AbortController();
      const active=AbortSignal.any([request.signal,signal]);
      const s=selected(), initial=previous?.source===s.id ? previous : null;
      if(reset) {
        start.value=initial?.start ?? (item.scene?.id===s.id?s.defaultStart:0);
        end.value=initial?.end ?? Math.min(s.duration,Number(start.value)+7);
        audio.checked=initial?.audio ?? false;
      }
      start.max=String(s.duration-1);end.max=String(s.duration);
      form.querySelector('output').textContent='Durata · '+s.duration+' s';
      player.muted=!audio.checked;retry.hidden=true;update();status.textContent='Apertura del filmato…';
      try {
        const blob=await movie(api,item.id,{source:s.id,start:0,end:s.duration},active);
        active.throwIfAborted();url=URL.createObjectURL(blob);player.src=url;
      } catch {
        if(active.aborted)return;
        status.textContent='Il filmato non si è aperto.';retry.hidden=false;
      }
    }
    player.onloadedmetadata=()=>{
      if(!url || player.currentSrc!==url)return;
      if(Number.isFinite(player.duration)) {
        form.querySelector('output').textContent='Durata · '+player.duration.toLocaleString('it-IT',{maximumFractionDigits:1})+' s';
      }
      ready=true;player.currentTime=start.valueAsNumber || 0;status.textContent='';update();
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
      field(name).value=Math.min(selected().duration,Math.floor(player.currentTime));
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
        const result=await api('saveClassroomSceneSettings',{entryId:item.id,video:{...data,revision}},signal);
        signal.throwIfAborted();previous=result.cut;revision=result.cut.revision;onSaved(result.cut);status.textContent='Intervallo salvato.';
      } catch(error) {
        if(signal.aborted)return;
        if(error.message==='scene_changed'){
          status.textContent='La lezione è stata modificata altrove.';
          const reload=field('reload');reload.hidden=false;reload.onclick=reopen;return;
        }
        status.textContent='Salvataggio non confermato. Puoi riprovare con questi secondi.';
      } finally {
        if(!signal.aborted && field('reload').hidden){saving=false;form.querySelector('fieldset').disabled=false;update();}
      }
    };
    box.replaceChildren(form);await loadSource(true);
  }
  window.ClassroomSceneEditor={movie,edit};
})();
