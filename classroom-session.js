(() => {
  'use strict';
  function create({allBooks,credentials,lock}) {
    const skew=60000, prefix=allBooks?'allBooks.':'';
    let timer, pending, controller, key='', retryAfter=0;
    function read() {
      const auth=credentials();
      // Decode claims solely to decide whether renewal is possible. Both APIs verify the signature.
      const role=window.AccountRole.status(auth.accessToken,0);
      return {...auth,expires:role.expires || 0,key:role.master?JSON.stringify([auth.phone,auth.deviceId,role.principal]):''};
    }
    function stop() {
      clearTimeout(timer);controller?.abort();controller=null;pending=null;key='';retryAfter=0;
    }
    function accept(auth) {
      key=auth.key;clearTimeout(timer);
      if(!document.hidden) {
        const when=retryAfter>Date.now()?auth.expires:auth.expires-skew;
        timer=setTimeout(()=>void ensure(),Math.max(0,Math.min(when-Date.now(),2147483647)));
      }
      return true;
    }
    function persist(data,role) {
      localStorage.setItem(prefix+'accessToken',data.accessToken);
      localStorage.setItem(prefix+'accessTokenExpiresAt',String(role.expires));
      if(!allBooks) {
        let stored;
        try{stored=JSON.parse(localStorage.getItem('user_session'));}catch{return;}
        if(stored && (!stored.phone || stored.phone===data.phone) && (!stored.deviceId || stored.deviceId===data.deviceId)){
          Object.assign(stored,{accessToken:data.accessToken,accessTokenExpiresAt:role.expires,lastValid:Date.now()});
          localStorage.setItem('user_session',JSON.stringify(stored));
        }
      }
    }
    async function renew(auth,signal,force) {
      const endpoint=allBooks?'/api/auth':'/api/getPages';
      const body=allBooks?{action:'validate',accessToken:auth.accessToken,deviceId:auth.deviceId}:
        {action:'validate',phone:auth.phone,deviceId:auth.deviceId};
      try{
        const response=await fetch(endpoint,{method:'POST',cache:'no-store',
          signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.accessToken},body:JSON.stringify(body)});
        const data=await response.json().catch(()=>({}));
        signal.throwIfAborted();
        const latest=read();
        // Another tab may have renewed the session or logged out during the request.
        if(latest.accessToken!==auth.accessToken || latest.key!==auth.key) {
          if(latest.key===auth.key && latest.expires>Date.now())return accept(latest);
          lock();return false;
        }
        if([401,403].includes(response.status)){lock();return false;}
        if(!response.ok || !(allBooks?data.ok:data.success) || !data.accessToken)throw Error('renew_unavailable');
        const role=window.AccountRole.status(data.accessToken);
        if(!role.master || JSON.stringify([auth.phone,auth.deviceId,role.principal])!==auth.key){lock();return false;}
        persist(data,role);retryAfter=0;
        return accept(read());
      }catch{
        if(signal.aborted)return false;
        const latest=read();
        if(!latest.key || latest.key!==auth.key){lock();return false;}
        if(latest.expires>Date.now() && !force) {
          retryAfter=Date.now()+30000;return accept(latest);
        }
        lock(true);return false;
      }
    }
    async function ensure(force=false) {
      const auth=read();
      if(!auth.key || (key && key!==auth.key)){lock();return false;}
      if(!force && auth.expires>Date.now() && (auth.expires-Date.now()>skew || Date.now()<retryAfter))return accept(auth);
      if(pending)return pending;
      controller=new AbortController();
      const request=renew(auth,controller.signal,force);
      pending=request;
      try{return await request;}finally{if(pending===request){pending=null;controller=null;}}
    }
    return {ensure,stop,get key(){return key;},matches:scope=>Boolean(scope && read().key===scope),
      suspend:()=>clearTimeout(timer)};
  }
  window.ClassroomSession={create};
})();
