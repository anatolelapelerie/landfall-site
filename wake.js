// The wake, as the ship leaves it in the game: the pointer drops a ring every few points as it
// moves; each ring widens and dies away, and where they pile up they draw the V of a wake. The
// sea under the page — its paper grain and its ink wavelets — is bent by them and lit from the
// upper left. The text stays as it is, on top.
//
// Desktop only: a mouse to follow, motion not reduced, and WebGL to draw with. Anywhere else
// the page is exactly the plain parchment it was.
(() => {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || calm) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%',
                                zIndex: '-1', pointerEvents: 'none' });
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  document.body.prepend(canvas);

  const MAX = 64;
  const vertex = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
  const fragment = `
    precision highp float;
    uniform vec2 size;        // CSS pixels
    uniform float dpr;
    uniform vec4 rings[${MAX}]; // x, y, radius, amplitude
    uniform int count;
    uniform vec3 paper, ink;
    uniform float dark;

    float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }

    // the paper's grain, a little blotchy
    float grain(vec2 q) {
      vec2 i = floor(q / 3.0), f = fract(q / 3.0);
      float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + 1.0);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    // the chart's sparse wavelets: a pair of shallow arcs in some cells of a grid
    float wavelet(vec2 q) {
      float cell = 110.0;
      vec2 id = floor(q / cell);
      if (hash(id + 7.0) > 0.55) return 0.0;
      vec2 c = (id + vec2(0.1 + 0.8 * hash(id), 0.1 + 0.8 * hash(id + 3.0))) * cell;
      float w = 7.0 + 6.0 * hash(id + 5.0);
      vec2 d = q - c;
      if (abs(d.x) > w * 2.0) return 0.0;
      float s = mod(d.x + w * 2.0, w * 2.0) - w;      // two arcs side by side
      float y = -3.0 * (1.0 - (s * s) / (w * w));
      return smoothstep(1.1, 0.2, abs(d.y - y));
    }

    void main() {
      vec2 pt = vec2(gl_FragCoord.x, size.y * dpr - gl_FragCoord.y) / dpr;
      float k = 6.2831853 / 6.5;
      float h = 0.0; vec2 slope = vec2(0.0);
      for (int i = 0; i < ${MAX}; i++) {
        if (i >= count) break;
        vec4 r = rings[i];
        vec2 d = pt - r.xy;
        float dist = length(d);
        float width = 4.0 + r.z * 0.12;
        float x = (dist - r.z) / width;
        if (abs(x) > 2.6 || dist < 0.001) continue;
        float env = exp(-x * x);
        float ph = k * (dist - r.z);
        h += r.w * env * cos(ph);
        float s = r.w * env * (-k * sin(ph) - 2.0 * x / width * cos(ph));
        slope += d / dist * s;
      }
      // the sea bends what lies under it
      vec2 q = pt - slope * 3.0;
      float g = grain(q) * 0.06 + grain(q * 0.23) * 0.05;
      vec3 col = mix(paper, paper * 0.86, g);
      col = mix(col, ink, wavelet(q) * (dark > 0.5 ? 0.22 : 0.16));
      // and is lit from the upper left: a glint on the side toward the light, a shade away
      float lit = dot(normalize(vec3(-slope * 1.4, 1.0)), normalize(vec3(-0.55, -0.6, 0.58)));
      float rel = clamp((lit - 0.58) * 2.2, -1.0, 1.0);
      col += rel > 0.0 ? vec3(1.0) * rel * 0.16 : ink * 0.0 + (col * rel * 0.14);
      gl_FragColor = vec4(col, 1.0);
    }`;

  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (e) { canvas.remove(); return; }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = name => gl.getUniformLocation(program, name);
  const U = { size: u('size'), dpr: u('dpr'), rings: u('rings'), count: u('count'),
              paper: u('paper'), ink: u('ink'), dark: u('dark') };

  // the page's own colours, light or dark
  const rgb = v => { const c = document.createElement('div'); c.style.color = v; document.body.append(c);
                     const m = getComputedStyle(c).color.match(/\d+/g).map(Number); c.remove();
                     return m.slice(0, 3).map(x => x / 255); };
  const colours = () => {
    const css = getComputedStyle(document.documentElement);
    return { paper: rgb(css.getPropertyValue('--paper')), ink: rgb(css.getPropertyValue('--ink')),
             dark: matchMedia('(prefers-color-scheme: dark)').matches ? 1 : 0 };
  };
  let palette = colours();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { palette = colours(); draw(); });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    draw();
  };

  // the rings: dropped every few points of travel, spreading at a steady pace
  const SPREAD = 70, LIFE = 2.6, STEP = 7, STRENGTH = 0.55;
  let drops = [], last = null, frame = 0;
  const now = () => performance.now() / 1000;

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const p = { x: e.clientX, y: e.clientY };
    if (!last) { last = p; return; }
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < STEP) return;
    // fill the gap a quick movement leaves, so the wake stays unbroken
    const n = Math.min(6, Math.floor(d / STEP));
    for (let i = 1; i <= n; i++) {
      drops.push({ x: last.x + (p.x - last.x) * i / n, y: last.y + (p.y - last.y) * i / n, born: now() });
    }
    last = p;
    if (drops.length > MAX) drops = drops.slice(-MAX);
    if (!frame) frame = requestAnimationFrame(tick);
  }, { passive: true });

  const data = new Float32Array(MAX * 4);
  function draw() {
    const t = now();
    let n = 0;
    for (const d of drops) {
      const age = t - d.born;
      const radius = SPREAD * age;
      // rises over the first instant, then dies away as it widens
      const amp = STRENGTH * Math.min(1, age / 0.12) * Math.exp(-age / 0.9) * (1 / (1 + radius / 140));
      if (amp < 0.01) continue;
      data.set([d.x, d.y, radius, amp], n * 4); n++;
    }
    gl.uniform2f(U.size, innerWidth, innerHeight);
    gl.uniform1f(U.dpr, canvas.width / innerWidth);
    gl.uniform4fv(U.rings, data);
    gl.uniform1i(U.count, n);
    gl.uniform3fv(U.paper, palette.paper);
    gl.uniform3fv(U.ink, palette.ink);
    gl.uniform1f(U.dark, palette.dark);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return n;
  }
  function tick() {
    const t = now();
    drops = drops.filter(d => t - d.born < LIFE);
    draw();
    // drawn while the water moves, and left still once it has settled
    frame = drops.length ? requestAnimationFrame(tick) : 0;
  }

  addEventListener('resize', resize);
  resize();
})();
