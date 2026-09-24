/* Owner-supplied Valence Core, adapted to the existing browser actions.
 * Decorative only: navigation, permissions and labels stay with their owners.
 * No GSAP/CDN, API calls or persistent user data. */
(function webActionEffects(win) {
  'use strict';
  const doc = win.document, root = doc.documentElement;
  if (root.classList.contains('android-webview')) return;
  const page = doc.getElementById('chapters');
  const button = doc.getElementById('webClassButton');
  const row = page.querySelector('.lesson-actions');
  const toggle = doc.getElementById('webActionMotionToggle');
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const contrast = win.matchMedia('(forced-colors: active)');
  const canvas = doc.createElement('canvas');
  canvas.className = 'web-action-core';
  canvas.setAttribute('aria-hidden', 'true');
  button.prepend(canvas);
  let gl, program, buffer, uniforms, shaders = [];
  let frame = 0, previous = 0, time = 3, arcs = 2.4, hovered = false;
  let visible = false, paused = false, suspended = false, lost = false, attempted = false;
  const stop = () => { win.cancelAnimationFrame(frame); frame = 0; previous = 0; };
  const allowed = () => visible && !suspended && !doc.hidden && !page.classList.contains('hidden') && !page.inert &&
    !root.hasAttribute('data-app-transition') && !root.hasAttribute('data-native-motion-paused') &&
    !paused && !reduced.matches && !contrast.matches;

  function release() {
    stop();
    if (gl && !lost) {
      shaders.forEach(shader => gl.deleteShader(shader));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    shaders = []; buffer = program = null;
    canvas.hidden = true;
  }

  function initialize() {
    attempted = true;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
      if (!gl) return;
      const vertex = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
      // Original noise / six overlapping edge arcs. Transparency outside the
      // rounded plate prevents the black rectangular canvas in the reference.
      const fragment = `precision mediump float;
        uniform vec2 u_res,u_size;
        uniform float u_time,u_arcs,u_radius;
        uniform vec3 u_base,u_edge,u_highlight;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
        float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.05+vec2(9.7,3.1);a*=.5;}return v;}
        float sdRBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
        void main(){
          vec2 p=(gl_FragCoord.xy-.5*u_res)/u_res.y;
          float d=sdRBox(p,u_size*.5/u_res.y,u_radius/u_res.y),t=u_time;
          float plate=1.-smoothstep(-.006,.006,d);
          vec3 col=u_base*(.78+.22*fbm(p*9.));
          col+=u_edge*.10*exp(min(d,0.)*9.);
          float a=atan(p.y,p.x);vec3 arcCol=vec3(0.);
          for(int i=0;i<6;i++){
            float fi=float(i),w=clamp(u_arcs-fi,0.,1.);
            float n1=fbm(vec2(a*2.4+fi*11.3,t*(1.6+fi*.27)+fi*53.1));
            float off=(n1-.5)*.07;
            float seg=.3+.7*smoothstep(.35,.75,noise(vec2(a*1.8+fi*7.7,t*(.9+fi*.13)+fi*19.)));
            float g=.0032/(abs(d+off)+.006);
            arcCol+=(u_edge*g+u_highlight*g*g*.55)*w*seg;
          }
          float mask=1.-smoothstep(.025,.10,d);
          col+=arcCol*.7*mask;
          float alpha=max(plate,(1.-smoothstep(0.,.10,d))*.65);
          gl_FragColor=vec4(col,alpha);
        }`;
      program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type); shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader_unavailable');
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('program_unavailable');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['res','size','time','arcs','radius','base','edge','highlight'].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
      // CSS owns the palette, as in native-liquid-progress.mjs.
      const probe = doc.createElement('span'); probe.hidden = true; page.append(probe);
      try {
        for (const name of ['base', 'edge', 'highlight']) {
          probe.style.color = `var(--action-core-${name})`;
          const channels = win.getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (channels?.length !== 3) throw new Error('palette_unavailable');
          gl.uniform3f(uniforms[name], ...channels.map(channel => channel / 255));
        }
      } finally { probe.remove(); }
    } catch { release(); }
  }

  function paint(now) {
    frame = 0;
    if (!program || lost) return;
    // A preference/visibility change can precede its event after restoration.
    // Settle CSS and controls too, rather than leaving a stale running state.
    if (!allowed()) { sync(); return; }
    // One small canvas only; same 24fps / 1.5 DPR budget as native liquid.
    if (previous && now - previous < 1000 / 24) { frame = win.requestAnimationFrame(paint); return; }
    const delta = previous ? Math.min(.1, (now - previous) / 1000) : 0;
    previous = now; time += delta * .35;
    arcs += ((hovered ? 4.2 : 2.4) - arcs) * Math.min(1, delta * 5);
    const dpr = Math.min(win.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round((button.clientWidth + 24) * dpr));
    const height = Math.max(1, Math.round((button.clientHeight + 24) * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(uniforms.res, width, height);
    gl.uniform2f(uniforms.size, button.clientWidth * dpr, button.clientHeight * dpr);
    gl.uniform1f(uniforms.radius, parseFloat(win.getComputedStyle(button).borderRadius) * dpr);
    gl.uniform1f(uniforms.time, time); gl.uniform1f(uniforms.arcs, arcs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.hidden = false;
    frame = win.requestAnimationFrame(paint);
  }

  function sync() {
    stop();
    const running = allowed();
    page.dataset.actionMotion = running ? 'running' : 'paused';
    toggle.hidden = reduced.matches || contrast.matches || root.hasAttribute('data-native-motion-paused');
    toggle.setAttribute('aria-pressed', String(paused));
    const label = paused ? 'Riprendi animazioni' : 'Pausa animazioni';
    toggle.setAttribute('aria-label', label); toggle.title = label;
    if (!running) { canvas.hidden = true; return; }
    if (!attempted && !lost) initialize();
    if (program) frame = win.requestAnimationFrame(paint);
  }

  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
  observer.observe(row);
  const attributes = new MutationObserver(sync);
  attributes.observe(root, { attributes: true, attributeFilter: ['data-native-motion-paused','data-app-transition'] });
  attributes.observe(page, { attributes: true, attributeFilter: ['class','inert'] });
  toggle.addEventListener('click', () => { paused = !paused; sync(); });
  button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hovered = true; });
  button.addEventListener('pointerleave', () => { hovered = false; });
  button.addEventListener('focus', () => { hovered = true; });
  button.addEventListener('blur', () => { hovered = false; });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; release(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; attempted = false; sync(); });
  reduced.addEventListener('change', sync); contrast.addEventListener('change', sync);
  doc.addEventListener('visibilitychange', sync);
  win.addEventListener('resize', sync);
  win.addEventListener('pagehide', () => {
    suspended = true; sync(); release(); observer.disconnect(); attributes.disconnect();
    reduced.removeEventListener('change', sync); contrast.removeEventListener('change', sync);
  });
  win.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    suspended = false; attempted = false;
    // Reattach the document's original live media-query subscriptions.
    reduced.addEventListener('change', sync); contrast.addEventListener('change', sync);
    observer.observe(row);
    attributes.observe(root, { attributes: true, attributeFilter: ['data-native-motion-paused','data-app-transition'] });
    attributes.observe(page, { attributes: true, attributeFilter: ['class','inert'] });
    sync();
  });
  sync();
})(window);
