(function(root) {
  'use strict';
  function node(tag, text, cls) { const el=document.createElement(tag); if(text)el.textContent=text;if(cls)el.className=cls;return el; }
  function create({ signal, initial = null, currentUrl = '', onChange = () => {} }) {
    const element=node('div','','quiz-video-thumbnail'),label=node('label','Carica copertina (facoltativa)','quiz-video-upload-label');
    const input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';label.append(input);
    const hint=node('p','JPG, PNG o WebP, fino a 8 MB. Anche verticale: l’immagine resta intera.','quiz-video-hint');
    const preview=node('img');preview.alt='Anteprima della copertina';preview.hidden=true;
    const status=node('p','','quiz-video-hint');status.setAttribute('role','status');status.id='quiz-cover-status-'+crypto.randomUUID();input.setAttribute('aria-describedby',status.id);
    const clear=node('button','Annulla selezione');clear.type='button';clear.hidden=true;
    element.append(label,hint,preview,status,clear);
    let selection=initial,busy=false,invalid=false,disabled=false,dead=false,generation=0,url='';
    const show = () => {
      if(url)URL.revokeObjectURL(url);url='';
      preview.src=selection ? 'data:image/jpeg;base64,'+selection.imageBase64 : currentUrl;
      preview.hidden=!selection&&!currentUrl;clear.hidden=!selection&&!invalid;input.disabled=disabled||busy;clear.disabled=disabled||busy;onChange();
    };
    const destroy=()=>{dead=true;generation++;if(url)URL.revokeObjectURL(url);signal?.removeEventListener('abort',destroy);};
    signal?.addEventListener('abort',destroy,{once:true});
    clear.onclick=()=>{selection=null;invalid=false;input.value='';input.removeAttribute('aria-invalid');status.textContent=currentUrl?'Copertina attuale mantenuta.':'';show();};
    input.onchange=async()=>{
      const file=input.files[0];if(!file||disabled||dead)return;
      const version=++generation;busy=true;invalid=false;selection=null;show();status.textContent='Preparazione della copertina…';
      try {
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>8*1024*1024)throw Error('Scegli un’immagine JPG, PNG o WebP fino a 8 MB.');
        const image=new Image();url=URL.createObjectURL(file);image.src=url;await image.decode();
        if(dead||version!==generation)return;
        const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w*h>16_000_000)throw Error('L’immagine è troppo grande. Scegli una copertina fino a 16 megapixel.');
        const scale=Math.min(1,1600/w,1600/h),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
        const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL('image/jpeg',.92),imageBase64=data.split(',')[1];
        if(!imageBase64||imageBase64.length>1398104)throw Error('La copertina è troppo pesante. Scegli un’immagine più piccola.');
        selection={imageBase64,operationId:crypto.randomUUID()};status.textContent='Copertina pronta per il caricamento.';input.removeAttribute('aria-invalid');
      } catch(error) { if(!dead){invalid=true;status.textContent=error.message.startsWith('Scegli')||error.message.startsWith('La copertina')||error.message.startsWith('L’immagine')?error.message:'L’immagine non si apre. Scegli un altro file.';input.setAttribute('aria-invalid','true');} }
      finally{if(!dead&&version===generation){busy=false;show();}}
    };
    show();
    return {element,get selection(){return selection;},get busy(){return busy;},get invalid(){return invalid;},setDisabled(value){disabled=value;input.disabled=disabled||busy;clear.disabled=disabled||busy;},destroy};
  }
  root.QuizVideoThumbnail=Object.freeze({create});
})(window);
