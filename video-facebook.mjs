import { trackYouTubePlayer } from './video-player.mjs?v=3';
let sdk;
function loadFacebook() {
  if (window.FB?.XFBML) return Promise.resolve(window.FB);
  if (!sdk) {
    const pending = new Promise((resolve,reject) => {
      const script=document.createElement('script');
      const timer=setTimeout(()=>{script.remove();reject(Error('facebook_timeout'));},12000);
      script.src='https://connect.facebook.net/it_IT/sdk.js'; script.async=true;
      script.onload=()=>{clearTimeout(timer);try { window.FB.init({xfbml:false,version:'v22.0'});resolve(window.FB); } catch(error){reject(error);} };
      script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('facebook_unavailable'));};document.head.append(script);
    });
    sdk=pending;pending.catch(()=>{if(sdk===pending)sdk=null;});
  }
  return sdk;
}
// Adapt the documented Facebook controls to our shared coverage/lifecycle tracker.
export function trackFacebookPlayer(options) {
  return trackYouTubePlayer({...options,loadAPI:async()=>{
    const FB=await loadFacebook();
    return {Player:class {
      constructor(frame,{events}) {
        this.frame=frame;this.events=events;this.state=-1;this.tokens=[];this.dead=false;
        this.listener=message=>{
          if(this.dead||message.type!=='video'||message.id!==frame.id)return;
          FB.Event.unsubscribe('xfbml.ready',this.listener);this.instance=message.instance;
          for(const [name,state] of [['startedPlaying',1],['paused',2],['finishedPlaying',0],['startedBuffering',3]]) {
            const token=this.instance.subscribe(name,()=>{if(this.dead)return;this.state=state;events.onStateChange({data:state});});this.tokens.push([token,name]);
          }
          this.tokens.push([this.instance.subscribe('error',()=>events.onError()),'error']);
          events.onReady();
        };
        FB.Event.subscribe('xfbml.ready',this.listener);FB.XFBML.parse(frame.parentElement);
      }
      getCurrentTime(){return this.instance?.getCurrentPosition()||0;}
      getDuration(){return this.instance?.getDuration()||0;}
      getPlaybackRate(){return 1;}
      getPlayerState(){return this.state;}
      playVideo(){this.instance?.play();}
      pauseVideo(){this.instance?.pause();}
      seekTo(time){this.instance?.seek(time);}
      destroy(){this.dead=true;FB.Event.unsubscribe('xfbml.ready',this.listener);try{this.instance?.pause();}catch{}for(const [token,name] of this.tokens)token?.release(name);this.frame.remove();}
    }};
  }});
}
