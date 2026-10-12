// Exhibit 04 — the Forge Flight route plan: scroll to fly a camera through a home.
// Telemetry is computed from the plan: altitude, planned speed and timecode,
// distance flown, and clearance to the nearest wall.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector3, Vector2, CatmullRomCurve3, Color, FogExp2, Mesh,
  SphereGeometry, ShaderMaterial, BackSide, HemisphereLight, DirectionalLight, ACESFilmicToneMapping,
  PMREMGenerator, BufferGeometry, BufferAttribute, Points, AdditiveBlending, TextureLoader, SRGBColorSpace, MathUtils,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildHouse, ROUTE } from './house.js';
import { clamp, damp, loop, visibility, qualityTier, rng } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';

/* ---------- route maths --------------------------------------------------- */
function makeRoute() {
  const pos = new CatmullRomCurve3(ROUTE.map((r) => new Vector3(...r.p)), false, 'centripetal');
  const look = new CatmullRomCurve3(ROUTE.map((r) => new Vector3(...r.look)), false, 'centripetal');
  const N = ROUTE.length - 1;
  // cumulative distance and planned flight time, sampled along t
  const S = 800;
  const dist = new Float32Array(S + 1);
  const time = new Float32Array(S + 1);
  const speedAt = (t) => {
    const f = t * N;
    const i = Math.min(N - 1, Math.floor(f));
    return MathUtils.lerp(ROUTE[i].speed, ROUTE[i + 1].speed, f - i);
  };
  let prev = pos.getPoint(0);
  for (let i = 1; i <= S; i++) {
    const t = i / S;
    const p = pos.getPoint(t);
    const d = p.distanceTo(prev);
    dist[i] = dist[i - 1] + d;
    time[i] = time[i - 1] + d / speedAt(t);
    prev = p;
  }
  const sample = (arr, t) => {
    const f = clamp(t, 0, 1) * S;
    const i = Math.min(S - 1, Math.floor(f));
    return MathUtils.lerp(arr[i], arr[i + 1], f - i);
  };
  // caption stops and the scroll timeline (holds at each stop, moves between)
  const stops = ROUTE.map((r, i) => (r.wp != null ? { wp: r.wp, t: i / N } : null)).filter(Boolean);
  const segs = [];
  stops.forEach((s, i) => {
    segs.push({ hold: true, t0: s.t, t1: s.t, w: i === 0 ? 0.35 : i === stops.length - 1 ? 0.55 : 0.42 });
    if (i < stops.length - 1) {
      const n = stops[i + 1];
      const len = sample(dist, n.t) - sample(dist, s.t);
      segs.push({ hold: false, t0: s.t, t1: n.t, w: 0.55 + len / 14 });
    }
  });
  const total = segs.reduce((a, s) => a + s.w, 0);
  let acc = 0;
  segs.forEach((s) => { s.p0 = acc / total; acc += s.w; s.p1 = acc / total; });
  const tAt = (p) => {
    p = clamp(p, 0, 1);
    const s = segs.find((x) => p <= x.p1) || segs[segs.length - 1];
    if (s.hold) return s.t0;
    const k = (p - s.p0) / (s.p1 - s.p0);
    return MathUtils.lerp(s.t0, s.t1, k * k * (3 - 2 * k));
  };
  const pAtStop = (i) => { const s = segs.filter((x) => x.hold)[i]; return s ? (s.p0 + s.p1) / 2 : 0; };
  return { pos, look, N, dist, time, sample, speedAt, stops, tAt, pAtStop };
}

/* ---------- minimap (SVG, drawn from the same plan) ----------------------- */
function drawMinimap(host, plan, route) {
  const view = { x: -17, y: -24, w: 34, h: 47 };
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const el = (name, attrs, parent = svg) => {
    const n = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    parent.append(n);
    return n;
  };
  const fills = { house: 'rgba(255,236,214,0.08)', patio: 'rgba(255,236,214,0.12)', pool: 'rgba(79,216,255,0.32)', path: 'rgba(255,236,214,0.07)', hedge: 'rgba(124,196,127,0.25)' };
  el('rect', { x: view.x + 0.5, y: view.y + 0.5, width: view.w - 1, height: view.h - 1, fill: 'none', stroke: 'rgba(255,220,180,0.12)', 'stroke-width': 0.15 });
  for (const r of plan.rects) el('rect', { x: r.x, y: r.z, width: r.w, height: r.d, fill: fills[r.kind] || 'none', stroke: r.kind === 'house' ? 'rgba(255,236,214,0.55)' : 'none', 'stroke-width': 0.18 });
  for (const c of plan.circles) el('circle', { cx: c.x, cy: c.z, r: c.r, fill: 'rgba(124,196,127,0.16)', stroke: 'rgba(124,196,127,0.35)', 'stroke-width': 0.12 });
  for (const l of plan.lines) {
    if (l.ext) continue;
    el('line', { x1: l.x1, y1: l.z1, x2: l.x2, y2: l.z2, stroke: 'rgba(255,236,214,0.5)', 'stroke-width': 0.14 });
  }
  const pts = [];
  for (let i = 0; i <= 160; i++) { const p = route.pos.getPoint(i / 160); pts.push(`${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
  el('polyline', { points: pts.join(' '), fill: 'none', stroke: '#ff7a1a', 'stroke-width': 0.28, 'stroke-dasharray': '0.7 0.45', 'stroke-linecap': 'round' });
  route.stops.forEach((s, i) => {
    const p = route.pos.getPoint(s.t);
    el('circle', { cx: p.x, cy: p.z, r: 0.75, fill: '#0b0907', stroke: '#ffb547', 'stroke-width': 0.2 });
    const tx = el('text', { x: p.x, y: p.z + 0.36, 'text-anchor': 'middle', 'font-size': 1.0, fill: '#ffb547', 'font-family': 'IBM Plex Mono, monospace' });
    tx.textContent = String(i + 1);
  });
  const drone = el('g', {});
  el('path', { d: 'M0,0 L-1.6,-3.6 A4,4 0 0,1 1.6,-3.6 Z', fill: 'rgba(255,181,71,0.28)' }, drone);
  el('circle', { cx: 0, cy: 0, r: 0.7, fill: '#ffb547', stroke: '#0b0907', 'stroke-width': 0.2 }, drone);
  host.replaceChildren(svg);
  return (x, z, heading) => drone.setAttribute('transform', `translate(${x.toFixed(2)} ${z.toFixed(2)}) rotate(${heading.toFixed(1)})`);
}

/* ---------- sky ------------------------------------------------------------ */
function sky() {
  const m = new Mesh(new SphereGeometry(260, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false, toneMapped: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 sunDir = normalize(vec3(-0.9, 0.04, -0.35));
        float sun = max(dot(vDir, sunDir), 0.0);
        vec3 zenith = vec3(0.012, 0.018, 0.045);
        vec3 mid = vec3(0.05, 0.06, 0.13);
        vec3 horizon = vec3(0.62, 0.25, 0.10);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, y));
        col = mix(col, zenith, smoothstep(0.18, 0.75, y));
        col += vec3(0.9, 0.36, 0.12) * pow(sun, 6.0) * smoothstep(-0.05, 0.12, y + 0.08);
        col = mix(col, vec3(0.03, 0.025, 0.022), smoothstep(0.0, -0.06, y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  m.renderOrder = -5;
  return m;
}
function stars(n = 700) {
  const r = rng(17);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * Math.PI * 2;
    const v = 0.12 + r() * 0.88;
    const s = Math.sqrt(1 - v * v);
    pos.set([Math.cos(u) * s * 240, v * 240, Math.sin(u) * s * 240], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  return new Points(g, new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'uniform float uTime; varying float vA; void main(){ vA = 0.55 + 0.45 * sin(uTime * 1.3 + position.x * 0.13 + position.z * 0.07); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = 1.6 + 1.4 * fract(position.x * 0.37); }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.94, 0.86) * smoothstep(0.5, 0.0, d) * vA * 0.9, 1.0); }',
    transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  }));
}

/* ---------- the exhibit ------------------------------------------------------ */
export async function createFlythrough(track, { reduce, gl }) {
  const section = track.closest('.flight') || track;
  const mount = track.querySelector('[data-flight-canvas]');
  const items = [...track.querySelectorAll('[data-route] li')];
  const minimapHost = track.querySelector('[data-minimap]');
  const controls = track.querySelector('[data-flight-controls]');
  const vertical = track.querySelector('[data-hud-vertical]');
  const hud = Object.fromEntries([...track.querySelectorAll('[data-hud]')].map((n) => [n.dataset.hud, n]));
  const route = makeRoute();
  const tier = qualityTier();
  const low = tier === 'low';

  const setActive = (i) => items.forEach((li, k) => li.classList.toggle('is-active', k === i));

  if (!gl) {
    // No WebGL: a readable route plan with the drawn floor plan.
    const { plan } = buildHouse({ low: true });
    section.classList.add('is-plan');
    if (minimapHost) drawMinimap(minimapHost, plan, route);
    return;
  }

  section.classList.add('is-live');
  const isStatic = () => reduce.matches;
  section.classList.toggle('is-static', isStatic());
  section.style.setProperty('--track-h', low ? '560vh' : '640vh');
  controls?.removeAttribute('hidden');
  setActive(0);

  // build the scene only when the visitor gets close
  await new Promise((resolve) => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); resolve(); } }, { rootMargin: '120% 0px' });
    io.observe(track);
  });

  const renderer = new WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.25 : 1.6));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  mount.append(renderer.domElement);

  const scene = new Scene();
  scene.fog = new FogExp2(new Color(0.05, 0.035, 0.035), 0.012);
  scene.add(sky());
  const starField = stars(low ? 300 : 700);
  scene.add(starField);
  // reflections for glass and metal come from the dusk sky
  {
    const env = new Scene();
    env.add(sky());
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.6;
    pmrem.dispose();
  }
  scene.add(new HemisphereLight(0x8a9ccc, 0x4a3624, 1.75));
  const sun = new DirectionalLight(0xffa765, 1.7);   // low western light grazing the facade
  sun.position.set(-40, 8, 14);
  const moon = new DirectionalLight(0x9fb4ff, 0.35);  // cool top light so the yard reads from above
  moon.position.set(10, 40, -20);
  scene.add(moon);
  scene.add(sun);

  const emblem = await new Promise((res) => new TextureLoader().load(new URL('../../img/emblem-640.webp', import.meta.url).href, (t) => { t.colorSpace = SRGBColorSpace; res(t); }, undefined, () => res(null)));
  const house = buildHouse({ low, emblem });
  scene.add(house.group);
  const setDrone = minimapHost ? drawMinimap(minimapHost, house.plan, route) : () => {};

  const camera = new PerspectiveCamera(55, 1, 0.05, 600);
  let composer = null;
  if (!low) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.55, 0.88));
    composer.addPass(new OutputPass());
  }

  const resize = () => {
    const w = Math.max(1, mount.clientWidth);
    const h = Math.max(1, mount.clientHeight);
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // keep a drone-like ~78° horizontal view on any screen shape
    camera.fov = clamp(MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(78) / 2) / camera.aspect)), 42, 82);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(mount);
  resize();

  /* scroll → route position */
  let target = 0;        // where the scroll says we should be (route t)
  let current = 0;       // where the camera is (damped)
  let manual = null;     // static mode: chosen stop
  const stickyEl = track.firstElementChild;
  const progress = () => {
    const r = track.getBoundingClientRect();
    const stickTop = parseFloat(getComputedStyle(stickyEl).top) || 0;
    const span = Math.max(1, r.height - stickyEl.offsetHeight);
    return clamp((stickTop - r.top) / span, 0, 1);
  };
  const readScroll = () => { if (!isStatic()) target = route.tAt(progress()); };

  // the caption switches a third of the way toward the next stop, because the camera
  // starts looking at the next room before it gets there
  const captionAt = (t) => {
    let i = 0;
    for (let k = 1; k < route.stops.length; k++) {
      const a = route.stops[k - 1].t, b = route.stops[k].t;
      if (t >= a + (b - a) * 0.33) i = k;
    }
    return i;
  };
  const stopIndex = () => {
    let best = 0;
    route.stops.forEach((s, i) => { if (Math.abs(s.t - target) < Math.abs(route.stops[best].t - target)) best = i; });
    return best;
  };
  const goStop = (i) => {
    i = clamp(i, 0, route.stops.length - 1);
    if (isStatic()) { manual = i; target = route.stops[i].t; current = target; wake(); return; }
    const r = track.getBoundingClientRect();
    const span = r.height - stickyEl.offsetHeight;
    const y = scrollY + r.top + route.pAtStop(i) * span - (parseFloat(getComputedStyle(stickyEl).top) || 0);
    scrollTo({ top: y, behavior: reduce.matches ? 'auto' : 'smooth' });
  };
  track.querySelector('[data-wp-next]')?.addEventListener('click', () => goStop(stopIndex() + 1));
  track.querySelector('[data-wp-prev]')?.addEventListener('click', () => goStop(stopIndex() - 1));
  const frameBtn = track.querySelector('[data-frame-toggle]');
  frameBtn?.addEventListener('click', () => {
    const on = frameBtn.getAttribute('aria-pressed') !== 'true';
    frameBtn.setAttribute('aria-pressed', String(on));
    if (vertical) vertical.hidden = !on;
  });
  reduce.addEventListener?.('change', () => { section.classList.toggle('is-static', isStatic()); readScroll(); wake(); });

  /* telemetry helpers */
  const clearance = (p) => {
    if (p.y > 3.4) return Infinity;
    let best = Infinity;
    for (const w of house.walls) {
      if (p.y < w.y0 - 0.05 || p.y > w.y1 + 0.05) continue;
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const len2 = dx * dx + dz * dz || 1;
      const k = clamp(((p.x - w.x1) * dx + (p.z - w.z1) * dz) / len2, 0, 1);
      const d = Math.hypot(p.x - (w.x1 + k * dx), p.z - (w.z1 + k * dz)) - 0.11;
      if (d < best) best = d;
    }
    return best;
  };
  const tc = (sec) => {
    const f = Math.floor((sec % 1) * 30);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60);
    return `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  };

  /* the frame */
  let visible = false;
  let clock = 0;
  let frames = 0;
  let slowFrames = 0;
  let lastHud = 0;
  let lastCaption = -1;
  const camPos = new Vector3();
  const lookAt = new Vector3();
  const ahead = new Vector3();
  let roll = 0;
  const step = (dt) => {
    clock += dt;
    readScroll();
    current = isStatic() ? target : damp(current, target, 4.2, dt);
    route.pos.getPoint(current, camPos);
    route.look.getPoint(current, lookAt);
    // a small amount of drone life: hover drift and banking into turns
    if (!isStatic()) {
      camPos.x += Math.sin(clock * 1.3) * 0.012;
      camPos.y += Math.sin(clock * 1.7 + 1) * 0.01;
      route.pos.getPoint(Math.min(1, current + 0.012), ahead);
      const turn = Math.atan2(ahead.x - camPos.x, ahead.z - camPos.z) - Math.atan2(lookAt.x - camPos.x, lookAt.z - camPos.z);
      roll = damp(roll, clamp(Math.sin(turn) * 0.09, -0.08, 0.08), 3, dt);
    } else roll = 0;
    camera.position.copy(camPos);
    camera.lookAt(lookAt);
    camera.rotateZ(roll);

    house.tick(clock, low);
    starField.material.uniforms.uTime.value = clock;
    if (composer) composer.render(dt); else renderer.render(scene, camera);

    // if this device can't keep up, drop the glow pass and render at 1x
    frames++;
    if (frames > 20 && frames < 160 && dt > 1 / 32) slowFrames++;
    if (frames === 160 && slowFrames > 50 && tier !== 'max' && (composer || renderer.getPixelRatio() > 1)) {
      composer = null;
      renderer.setPixelRatio(1);
      resize();
    }

    // caption + HUD (throttled)
    const cap = captionAt(current);
    if (cap !== lastCaption) { setActive(cap); lastCaption = cap; }
    if (clock - lastHud > 0.08) {
      lastHud = clock;
      const sec = route.sample(route.time, current);
      if (hud.tc) hud.tc.textContent = tc(sec);
      if (hud.alt) hud.alt.textContent = Math.max(0, camPos.y).toFixed(1);
      if (hud.spd) hud.spd.textContent = (Math.abs(target - current) < 0.0005 ? 0 : route.speedAt(current)).toFixed(1);
      if (hud.dist) hud.dist.textContent = Math.round(route.sample(route.dist, current));
      if (hud.clr) {
        const c = clearance(camPos);
        hud.clr.textContent = c === Infinity ? 'open air' : c > 5 ? '> 5 m' : `${c.toFixed(2)} m`;
        hud.clr.classList.toggle('is-warn', c < 0.5);
        hud.clr.classList.toggle('is-ok', c >= 0.5);
      }
      const heading = MathUtils.radToDeg(Math.atan2(lookAt.x - camPos.x, -(lookAt.z - camPos.z)));
      setDrone(camPos.x, camPos.z, heading);
    }
    return Math.abs(target - current) > 0.00005;
  };

  let moving = true;
  const ticker = loop((dt) => { moving = step(dt); }, () => visible && (!isStatic() || moving));
  function wake() { ticker.wake(); }
  addEventListener('scroll', () => { if (visible) wake(); }, { passive: true });
  visibility(track, (v) => { visible = v; if (v) wake(); });
  readScroll();
  current = target;
  section.classList.add('is-ready');
  step(1 / 60);
  wake();
}
