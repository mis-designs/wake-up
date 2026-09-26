// Local browser QA only. No provider network or production account.
window.YT = { Player:class {
  constructor(frame,{events}) {
    this.frame=frame;this.events=events;this.position=0;this.duration=60;this.rate=1;this.state=-1;this.started=performance.now();this.playCalls=0;
    window.__videoFixture=this;
    setTimeout(()=>events.onReady({target:this}),0);
  }
  getCurrentTime(){return Math.min(this.duration,this.position+(this.state===1?(performance.now()-this.started)/1000*this.rate:0));}
  getDuration(){return this.duration;}
  getPlaybackRate(){return this.rate;}
  getPlayerState(){return this.state;}
  setState(state){this.position=this.getCurrentTime();this.started=performance.now();this.state=state;this.events.onStateChange({data:state,target:this});}
  playVideo(){this.playCalls++;this.setState(1);}
  pauseVideo(){this.setState(2);}
  seekTo(time){const playing=this.state===1;this.setState(3);this.position=time;this.setState(playing?1:2);}
  destroy(){this.destroyed=true;this.frame.remove();}
} };
window.onYouTubeIframeAPIReady();
