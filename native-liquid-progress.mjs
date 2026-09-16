// Owner-supplied SURGE shader, adapted to real quiz coverage. No external assets,
// fake click-to-drain values, network work or unbounded background animation.
export function createLiquidProgress(track) {
  const canvas = track.ownerDocument.createElement("canvas");
  canvas.className = "native-liquid-canvas";
  canvas.setAttribute("aria-hidden", "true");
  track.prepend(canvas);
  const win = track.ownerDocument.defaultView;
  let gl, program, buffer, shaders = [], uniforms;
  let value = null, active = false, motion = false, frame = 0, previous = 0, time = 0;
  let slosh = 0, disposed = false;
  const cancel = () => { win.cancelAnimationFrame(frame); frame = 0; previous = 0; };
  function release() {
    cancel();
    if (gl) {
      shaders.forEach(shader => gl.deleteShader(shader));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    shaders = []; buffer = program = null;
    track.removeAttribute("data-liquid-ready");
  }
  function initialize() {
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
      if (!gl) return;
      const vertex = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
      const fragment = `precision mediump float;
        uniform vec2 u_res;
        uniform float u_time,u_level,u_slosh;
        uniform vec3 u_paper,u_body,u_wave;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
        float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.04+vec2(11.3,7.1);a*=.5;}return v;}
        void main(){
          vec2 uv=gl_FragCoord.xy/u_res;
          float x=uv.x*(u_res.x/u_res.y),t=u_time;
          float amp=min(.035+u_slosh*.018,min(u_level,1.-u_level)*.3);
          float surface=u_level+amp*sin(x*2.1+t*1.6)+amp*.62*sin(x*3.7-t*2.3+1.7);
          float d=surface-uv.y;
          float inside=smoothstep(-.01,.01,d);
          vec3 liquid=mix(u_wave,u_body,clamp(d/max(u_level,.001),0.,1.));
          liquid*=.88+.16*fbm(vec2(x*2.2,(uv.y+t*.06)*4.2));
          vec3 color=mix(u_paper,liquid,inside);
          color=mix(color,u_wave,exp(-abs(d)*65.)*.65);
          if(u_level<=0.)color=u_paper;
          if(u_level>=1.)color=u_body;
          gl_FragColor=vec4(color,1.);
        }`;
      program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type); shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("shader_unavailable");
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program_unavailable");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(["res", "time", "level", "slosh", "paper", "body", "wave"].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
      // CSS is the palette owner; resolve its colors through a computed style.
      const probe = track.ownerDocument.createElement("span");
      probe.hidden = true; track.append(probe);
      try {
        for (const [name, token] of [["paper", "--native-canvas"], ["body", "--native-liquid-body"], ["wave", "--native-liquid-wave"]]) {
          probe.style.color = `var(${token})`;
          const channels = win.getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (channels?.length !== 3) throw new Error("palette_unavailable");
          gl.uniform3f(uniforms[name], ...channels.map(channel => channel / 255));
        }
      } finally { probe.remove(); }
      sync();
    } catch { release(); }
  }
  function paint(now = 0) {
    frame = 0;
    if (!program || !active || disposed) return;
    // Cap GPU work at 24 fps and 1.5x density for this small, decorative surface.
    if (previous && now - previous < 1000 / 24) { frame = win.requestAnimationFrame(paint); return; }
    const delta = previous ? Math.min(.1, (now - previous) / 1000) : 0;
    previous = now; time += delta; slosh *= Math.exp(-1.8 * delta);
    const dpr = Math.min(win.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(track.clientWidth * dpr));
    const height = Math.max(1, Math.round(track.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(uniforms.res, width, height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.level, value === null ? 0 : value / 100);
    gl.uniform1f(uniforms.slosh, slosh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    track.setAttribute("data-liquid-ready", "true");
    if (motion && value > 0 && value < 100) frame = win.requestAnimationFrame(paint);
  }
  function sync() { cancel(); if (active) paint(); }
  const touch = () => { if (motion && active) slosh = .6; };
  const lost = event => { event.preventDefault(); release(); };
  const restored = () => { if (!disposed) initialize(); };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  track.addEventListener("pointerdown", touch, { passive: true });
  win.addEventListener("resize", sync);
  initialize();
  return {
    setValue(next) {
      value = typeof next === "number" && Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : null;
      track.style.setProperty("--native-progress", `${value ?? 0}%`);
      sync();
    },
    setActive(visible, animate) { active = visible; motion = animate; sync(); },
    destroy() {
      disposed = true; release();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      track.removeEventListener("pointerdown", touch);
      win.removeEventListener("resize", sync);
      canvas.remove();
    }
  };
}
