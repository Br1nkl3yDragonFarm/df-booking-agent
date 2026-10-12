// A home at dusk, modeled in code for the Forge Flight route plan.
// Units are meters. +z faces the street, y is up. Walls are recorded as data so
// the HUD can show real clearance and the minimap is drawn from the same plan.
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, IcosahedronGeometry,
  CircleGeometry, TorusGeometry, MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, CanvasTexture, SRGBColorSpace,
  RepeatWrapping, PointLight, Color, DoubleSide, AdditiveBlending, Vector3, BufferGeometry, BufferAttribute, Points,
  CatmullRomCurve3, TubeGeometry,
} from 'three';
import { rng } from './util.js';

const H = 3.0;        // wall height
const T_EXT = 0.22;   // exterior wall thickness
const T_INT = 0.12;   // interior wall thickness

/* ---------- procedural textures ------------------------------------------- */
function canvasTex(size, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(...repeat);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const planks = (repeat) => canvasTex(512, (g, s) => {
  const r = rng(5);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 300;
    while (x < s) {
      const len = 180 + r() * 220;
      const l = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${Math.round(150 * l)},${Math.round(112 * l)},${Math.round(78 * l)})`;
      g.fillRect(x, (i * s) / rows, len, s / rows);
      for (let k = 0; k < 6; k++) { // grain
        g.fillStyle = `rgba(60,35,15,${0.05 + r() * 0.06})`;
        g.fillRect(x, (i * s) / rows + r() * (s / rows), len, 1 + r() * 2);
      }
      g.fillStyle = 'rgba(30,18,8,0.55)';
      g.fillRect(x, (i * s) / rows, 2, s / rows);
      x += len;
    }
    g.fillStyle = 'rgba(30,18,8,0.5)';
    g.fillRect(0, (i * s) / rows, s, 2);
  }
}, repeat);
const tiles = (repeat, base = [138, 129, 120]) => canvasTex(256, (g, s) => {
  const r = rng(9);
  const n = 4;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 0.9 + r() * 0.18;
    g.fillStyle = `rgb(${Math.round(base[0] * l)},${Math.round(base[1] * l)},${Math.round(base[2] * l)})`;
    g.fillRect((i * s) / n, (j * s) / n, s / n, s / n);
  }
  g.strokeStyle = 'rgba(40,34,28,0.7)';
  g.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo((i * s) / n, 0); g.lineTo((i * s) / n, s); g.stroke();
    g.beginPath(); g.moveTo(0, (i * s) / n); g.lineTo(s, (i * s) / n); g.stroke();
  }
}, repeat);
const grass = (repeat) => canvasTex(256, (g, s) => {
  const r = rng(13);
  g.fillStyle = '#3d5932';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const l = r();
    g.fillStyle = `rgba(${l > 0.5 ? '90,120,60' : '20,34,16'},${0.12 + r() * 0.2})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
  }
}, repeat);
const gravel = (repeat) => canvasTex(256, (g, s) => {
  const r = rng(31);
  g.fillStyle = '#4b4641';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 3000; i++) {
    const l = r();
    g.fillStyle = `rgba(${l > 0.5 ? '120,112,104' : '28,25,22'},${0.25 + r() * 0.35})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
}, repeat);
const solar = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#0d1826';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(150,180,220,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo((i * s) / 6, 0); g.lineTo((i * s) / 6, s); g.stroke(); }
  for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(0, (i * s) / 10); g.lineTo(s, (i * s) / 10); g.stroke(); }
}, [1, 1]);
const slats = (repeat) => canvasTex(256, (g, s) => {
  const r = rng(21);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const l = 0.85 + r() * 0.25;
    g.fillStyle = `rgb(${Math.round(120 * l)},${Math.round(80 * l)},${Math.round(50 * l)})`;
    g.fillRect((i * s) / n, 0, s / n - 3, s);
    g.fillStyle = 'rgba(20,12,6,0.9)';
    g.fillRect(((i + 1) * s) / n - 3, 0, 3, s);
  }
}, repeat);

/* ---------- builder -------------------------------------------------------- */
export function buildHouse({ low = false, emblem = null } = {}) {
  const group = new Group();
  const walls = [];        // { x1, z1, x2, z2, y0, y1 } for clearance + minimap
  const plan = { rects: [], lines: [], circles: [] };
  const lights = [];
  const animated = [];

  const M = {
    ext: new MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.92 }),
    int: new MeshStandardMaterial({ color: 0xf1e9dc, roughness: 0.95 }),
    ceiling: new MeshStandardMaterial({ color: 0xf4ede2, roughness: 1 }),
    floor: new MeshStandardMaterial({ map: planks([9, 6]), roughness: 0.5 }),
    frame: new MeshStandardMaterial({ color: 0x1d1814, roughness: 0.45, metalness: 0.4 }),
    glass: new MeshStandardMaterial({ color: 0x223040, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 1.8, depthWrite: false }),
    roof: new MeshStandardMaterial({ color: 0x2b2622, roughness: 0.85 }),
    roofTop: new MeshStandardMaterial({ map: gravel([8, 6]), roughness: 0.95 }),
    fascia: new MeshStandardMaterial({ color: 0xd8cfc1, roughness: 0.8 }),
    solar: new MeshStandardMaterial({ map: solar(), roughness: 0.18, metalness: 0.5, envMapIntensity: 1.6 }),
    soffit: new MeshStandardMaterial({ map: slats([6, 1]), roughness: 0.7 }),
    cladding: new MeshStandardMaterial({ map: slats([2, 1]), roughness: 0.7 }),
    stone: new MeshStandardMaterial({ map: tiles([5, 3]), roughness: 0.85 }),
    path: new MeshStandardMaterial({ map: tiles([1, 6], [150, 142, 132]), roughness: 0.85 }),
    grass: new MeshStandardMaterial({ map: grass([18, 18]), roughness: 1 }),
    asphalt: new MeshStandardMaterial({ color: 0x232120, roughness: 0.95 }),
    curb: new MeshStandardMaterial({ color: 0x8d8780, roughness: 0.9 }),
    fabric: new MeshStandardMaterial({ color: 0x3a5a40, roughness: 0.97 }),
    cushion: new MeshStandardMaterial({ color: 0xc9b89c, roughness: 0.95 }),
    wood: new MeshStandardMaterial({ color: 0x6e4b31, roughness: 0.6 }),
    darkwood: new MeshStandardMaterial({ color: 0x3b2819, roughness: 0.6 }),
    counter: new MeshStandardMaterial({ color: 0xe6dfd4, roughness: 0.28 }),
    cabinet: new MeshStandardMaterial({ color: 0x2f3f37, roughness: 0.55 }),
    metal: new MeshStandardMaterial({ color: 0x2a2421, roughness: 0.35, metalness: 0.8 }),
    brass: new MeshStandardMaterial({ color: 0xb98a4b, roughness: 0.3, metalness: 1 }),
    rug: new MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }),
    hearth: new MeshStandardMaterial({ color: 0x3b3531, roughness: 0.9 }),
    firebox: new MeshStandardMaterial({ color: 0x0c0907, roughness: 1 }),
    leaf: new MeshStandardMaterial({ color: 0x3d5e35, roughness: 0.9, flatShading: true }),
    leafDark: new MeshStandardMaterial({ color: 0x24391f, roughness: 0.9, flatShading: true }),
    bark: new MeshStandardMaterial({ color: 0x4a3426, roughness: 1 }),
    pot: new MeshStandardMaterial({ color: 0xb19c80, roughness: 0.8 }),
    coping: new MeshStandardMaterial({ color: 0xd9d1c4, roughness: 0.7 }),
    poolWall: new MeshStandardMaterial({ color: 0x2c8fa6, roughness: 0.4, emissive: 0x0b4a5c, emissiveIntensity: 0.9 }),
    warm: new MeshBasicMaterial({ color: new Color(4.2, 3.0, 1.6), toneMapped: false }),
    warmSoft: new MeshBasicMaterial({ color: new Color(2.4, 1.6, 0.8), toneMapped: false }),
    tv: new MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.2, metalness: 0.5 }),
  };
  if (emblem) M.art = new MeshStandardMaterial({ map: emblem, roughness: 0.5, emissive: 0xffffff, emissiveMap: emblem, emissiveIntensity: 0.35 });

  const add = (mesh) => { group.add(mesh); return mesh; };
  const box = (w, h, d, mat, x, y, z, ry = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return add(m);
  };
  const point = (color, intensity, x, y, z, flicker = 0, essential = false) => {
    if (low && !essential) return null;
    const l = new PointLight(color, intensity, 0, 2);
    l.position.set(x, y, z);
    add(l);
    lights.push({ light: l, base: intensity, flicker });
    return l;
  };

  /* walls with openings ---------------------------------------------------- */
  // wallX: runs along x at fixed z. wallZ: runs along z at fixed x.
  // openings: [{ a, b, y0, y1, glass }] in wall-local distance from the start.
  const wall = (axis, fixed, from, to, thick, mat, openings = []) => {
    const len = to - from;
    const pieces = [];
    const sorted = [...openings].sort((p, q) => p.a - q.a);
    let cursor = 0;
    for (const o of sorted) {
      if (o.a > cursor) pieces.push([cursor, o.a, 0, H]);
      if (o.y0 > 0) pieces.push([o.a, o.b, 0, o.y0]);
      if (o.y1 < H) pieces.push([o.a, o.b, o.y1, H]);
      cursor = o.b;
    }
    if (cursor < len) pieces.push([cursor, len, 0, H]);
    for (const [a, b, y0, y1] of pieces) {
      const w = b - a;
      const mid = from + (a + b) / 2;
      if (axis === 'x') box(w, y1 - y0, thick, mat, mid, (y0 + y1) / 2, fixed);
      else box(thick, y1 - y0, w, mat, fixed, (y0 + y1) / 2, mid);
      const seg = axis === 'x' ? { x1: from + a, z1: fixed, x2: from + b, z2: fixed } : { x1: fixed, z1: from + a, x2: fixed, z2: from + b };
      walls.push({ ...seg, y0, y1 });
    }
    plan.lines.push(axis === 'x' ? { x1: from, z1: fixed, x2: to, z2: fixed, ext: thick > 0.15 } : { x1: fixed, z1: from, x2: fixed, z2: to, ext: thick > 0.15 });
    for (const o of sorted) {
      if (!o.glass) continue;
      const w = o.b - o.a;
      const mid = from + (o.a + o.b) / 2;
      const hgt = o.y1 - o.y0;
      const cy = (o.y0 + o.y1) / 2;
      const pane = new Mesh(new PlaneGeometry(w, hgt), M.glass);
      pane.renderOrder = 2;
      if (axis === 'x') pane.position.set(mid, cy, fixed); else { pane.position.set(fixed, cy, mid); pane.rotation.y = Math.PI / 2; }
      add(pane);
      // frame + mullions
      const f = 0.06;
      const bars = [[0, hgt / 2 - f / 2, w, f], [0, -hgt / 2 + f / 2, w, f], [-w / 2 + f / 2, 0, f, hgt], [w / 2 - f / 2, 0, f, hgt]];
      const mullions = Math.max(0, Math.round(w / 1.4) - 1);
      for (let i = 1; i <= mullions; i++) bars.push([-w / 2 + (i * w) / (mullions + 1), 0, f * 0.8, hgt]);
      for (const [ox, oy, bw, bh] of bars) {
        if (axis === 'x') box(bw, bh, thick + 0.02, M.frame, mid + ox, cy + oy, fixed);
        else box(thick + 0.02, bh, bw, M.frame, fixed, cy + oy, mid + ox);
      }
    }
  };

  /* ground, street, paths --------------------------------------------------- */
  const flat = (w, d, mat, x, z, y = -0.02) => {
    const m = new Mesh(new PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return add(m);
  };
  // lawn in four pieces, leaving a hole where the pool is (x ±3.8, z -16.2 … -9.6)
  const lawn = (x0, x1, z0, z1) => {
    const m = flat(x1 - x0, z1 - z0, M.grass, (x0 + x1) / 2, (z0 + z1) / 2, -0.04);
    m.material = M.grass.clone();
    m.material.map = M.grass.map.clone();
    m.material.map.repeat.set((x1 - x0) / 5, (z1 - z0) / 5);
    m.material.map.needsUpdate = true;
  };
  lawn(-45, 45, -9.6, 45);
  lawn(-45, 45, -45, -16.2);
  lawn(-45, -3.8, -16.2, -9.6);
  lawn(3.8, 45, -16.2, -9.6);
  flat(90, 8, M.asphalt, 0, 19, -0.03);                   // street
  box(90, 0.14, 0.3, M.curb, 0, 0.03, 15.1);               // curb
  flat(90, 1.6, M.path, 0, 14.1, -0.01);                   // sidewalk
  flat(1.6, 8.6, M.path, 0, 9.4, -0.005);                  // front walk
  flat(3.6, 18, M.asphalt, 9.2, 5.6, -0.012);              // driveway
  plan.rects.push({ x: -0.8, z: 5.1, w: 1.6, d: 8.6, kind: 'path' }, { x: 7.4, z: -3.4, w: 3.6, d: 18, kind: 'path' });
  // street lines
  for (let x = -40; x < 40; x += 4) flat(2, 0.14, M.coping, x, 19, -0.02);

  /* house shell ------------------------------------------------------------- */
  box(14, 0.12, 10, M.floor, 0, -0.05, 0);                  // floor slab (wood on top face)
  // flat roof with overhang; its underside is the wood soffit
  const roof = new Mesh(new BoxGeometry(15.6, 0.28, 11.6), [M.fascia, M.fascia, M.roofTop, M.soffit, M.fascia, M.fascia]);
  roof.position.set(0, H + 0.14, 0);
  add(roof);
  // parapet, skylights that glow from above, and a solar array on the back half
  const pY = H + 0.28 + 0.09;
  box(15.6, 0.18, 0.14, M.fascia, 0, pY, 5.73); box(15.6, 0.18, 0.14, M.fascia, 0, pY, -5.73);
  box(0.14, 0.18, 11.6, M.fascia, 7.73, pY, 0); box(0.14, 0.18, 11.6, M.fascia, -7.73, pY, 0);
  for (const [x, z] of [[-4.4, 1.6], [4.3, 0.9]]) {
    box(1.5, 0.16, 1.0, M.frame, x, H + 0.36, z);
    box(1.32, 0.04, 0.82, M.warm, x, H + 0.45, z);
  }
  for (let i = 0; i < 3; i++) {
    const panel = box(1.9, 0.06, 1.2, M.solar, 1.2 + i * 2.05, H + 0.42, -3.3);
    panel.rotation.x = -0.22;
  }
  const ceil = new Mesh(new PlaneGeometry(14, 10), M.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H - 0.01;
  add(ceil);
  plan.rects.push({ x: -7, z: -5, w: 14, d: 10, kind: 'house' });

  // front (z = +5): living window, door, dining window
  wall('x', 5, -7, 7, T_EXT, M.ext, [
    { a: 0.8, b: 5.0, y0: 0.45, y1: 2.6, glass: true },
    { a: 6.35, b: 7.65, y0: 0, y1: 2.45 },
    { a: 9.0, b: 13.2, y0: 0.45, y1: 2.6, glass: true },
  ]);
  // wood cladding framing the entry (left, right, and above the door)
  box(0.95, H, 0.05, M.cladding, -1.125, H / 2, 5.135);
  box(0.95, H, 0.05, M.cladding, 1.125, H / 2, 5.135);
  box(1.3, H - 2.45, 0.05, M.cladding, 0, 2.45 + (H - 2.45) / 2, 5.135);
  // back (z = -5): two windows and the big slider
  wall('x', -5, -7, 7, T_EXT, M.ext, [
    { a: 0.6, b: 3.0, y0: 0.9, y1: 2.4, glass: true },
    { a: 4.8, b: 9.2, y0: 0, y1: 2.65 },
    { a: 11.0, b: 13.4, y0: 0.9, y1: 2.4, glass: true },
  ]);
  // sides
  wall('z', -7, -5, 5, T_EXT, M.ext, [{ a: 1.0, b: 3.0, y0: 0.9, y1: 2.4, glass: true }]);
  wall('z', 7, -5, 5, T_EXT, M.ext, [{ a: 5.6, b: 7.4, y0: 0.9, y1: 2.4, glass: true }]);
  // interior: entry walls, back rooms
  wall('z', -1.7, 3.8, 5, T_INT, M.int);
  wall('z', 1.7, 3.9, 5, T_INT, M.int);
  wall('x', -1.7, -7, -2.5, T_INT, M.int);
  wall('x', -1.7, 2.5, 7, T_INT, M.int);
  wall('z', -2.5, -5, -1.7, T_INT, M.int, [{ a: 1.2, b: 2.1, y0: 0, y1: 2.2 }]);
  wall('z', 2.5, -5, -1.7, T_INT, M.int, [{ a: 1.2, b: 2.1, y0: 0, y1: 2.2 }]);

  // the slider: glass panels pushed open to the sides
  for (const side of [-1, 1]) {
    const px = side * 1.75;
    const pane = new Mesh(new PlaneGeometry(1.15, 2.6), M.glass);
    pane.position.set(px, 1.3, -5.06);
    add(pane);
    box(1.15, 0.05, 0.06, M.frame, px, 2.6, -5.06);
    box(0.05, 2.6, 0.06, M.frame, px - side * 0.55, 1.3, -5.06);
  }
  // front door, swung open inward
  const door = box(0.06, 2.4, 1.24, M.darkwood, -0.62 + 0.03, 1.2, 4.35);
  door.rotation.y = 0;
  box(0.04, 0.05, 0.2, M.brass, -0.55, 1.05, 3.9);
  // porch lights and house number plate
  for (const sx of [-1.0, 1.0]) {
    box(0.1, 0.32, 0.1, M.frame, sx, 2.0, 5.2);
    box(0.06, 0.2, 0.06, M.warm, sx, 2.0, 5.26);
  }
  point(0xffc27a, 4, 0, 2.2, 5.9, 0, true);
  point(0xffb469, 7, -4.5, 0.4, 6.4, 0, false);   // warm wash on the facade
  point(0xffb469, 7, 4.5, 0.4, 6.4, 0, false);
  // path lights
  for (let z = 6.5; z <= 12.5; z += 2) {
    for (const sx of [-1.2, 1.2]) {
      box(0.12, 0.45, 0.12, M.frame, sx, 0.22, z);
      box(0.13, 0.08, 0.13, M.warm, sx, 0.4, z);
    }
  }

  /* living room (west) ------------------------------------------------------ */
  // fireplace on the west wall
  box(0.5, 1.3, 2.6, M.hearth, -6.64, 0.65, 2.4);
  box(0.52, 0.7, 1.5, M.firebox, -6.58, 0.65, 2.4);
  box(0.3, H - 1.3, 2.0, M.hearth, -6.74, 1.3 + (H - 1.3) / 2, 2.4);
  const flame = new Mesh(new PlaneGeometry(1.3, 0.62), new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv; float t = uTime;
        float n = noise(vec2(p.x*6.0, p.y*3.0 - t*2.6)) * 0.6 + noise(vec2(p.x*13.0, p.y*7.0 - t*4.1)) * 0.4;
        float shape = smoothstep(0.0, 0.35, p.y * (1.15 - abs(p.x-0.5)*1.6)) ;
        float flame = smoothstep(0.15, 0.9, (1.0 - p.y) * (0.65 + n) - abs(p.x - 0.5) * 0.9);
        vec3 col = mix(vec3(1.6, 0.35, 0.04), vec3(3.2, 1.9, 0.6), flame * flame);
        gl_FragColor = vec4(col * flame * 1.6, 1.0);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide,
  }));
  flame.position.set(-6.31, 0.62, 2.4);
  flame.rotation.y = Math.PI / 2;
  add(flame);
  animated.push((t) => { flame.material.uniforms.uTime.value = t; });
  point(0xff7a2a, 9, -5.9, 0.9, 2.4, 0.35, true);
  // the brand on the wall: the Dragon Forge emblem, framed
  if (M.art) {
    box(0.06, 1.24, 1.24, M.darkwood, -6.57, 2.15, 2.4);
    const art = new Mesh(new CircleGeometry(0.55, 48), M.art);
    art.position.set(-6.53, 2.15, 2.4);
    art.rotation.y = Math.PI / 2;
    add(art);
  }
  // sofa (green, of course), coffee table, rug, armchair, lamp, plants
  const sofa = (x, z, ry, len = 2.6) => {
    const g = new Group();
    const b = (w, h, d, m, px, py, pz) => { const mm = new Mesh(new BoxGeometry(w, h, d), m); mm.position.set(px, py, pz); g.add(mm); };
    b(len, 0.42, 0.95, M.fabric, 0, 0.21, 0);
    b(len, 0.5, 0.22, M.fabric, 0, 0.62, -0.38);
    b(0.2, 0.62, 0.95, M.fabric, -len / 2 + 0.1, 0.31, 0);
    b(0.2, 0.62, 0.95, M.fabric, len / 2 - 0.1, 0.31, 0);
    b(len - 0.5, 0.12, 0.7, M.cushion, 0, 0.47, 0.08);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    add(g);
  };
  sofa(-3.3, 2.4, -Math.PI / 2);
  sofa(-4.9, 0.25, 0, 2.2);
  box(1.0, 0.36, 0.62, M.wood, -4.8, 0.18, 2.3);
  box(3.2, 0.012, 2.6, M.rug, -4.9, 0.006, 2.1);
  const lamp = (x, z) => {
    box(0.04, 1.5, 0.04, M.metal, x, 0.75, z);
    const shade = new Mesh(new CylinderGeometry(0.16, 0.24, 0.3, 20, 1, true), M.warmSoft);
    shade.position.set(x, 1.55, z);
    add(shade);
    point(0xffcf8a, 3.2, x, 1.5, z, 0, false);
  };
  lamp(-6.4, 0.0);
  const plant = (x, z, s = 1) => {
    const pot = new Mesh(new CylinderGeometry(0.18 * s, 0.14 * s, 0.4 * s, 16), M.pot);
    pot.position.set(x, 0.2 * s, z);
    add(pot);
    for (let i = 0; i < 3; i++) {
      const leaf = new Mesh(new IcosahedronGeometry(0.28 * s * (1 - i * 0.18), 0), i % 2 ? M.leafDark : M.leaf);
      leaf.position.set(x + (i - 1) * 0.08 * s, 0.55 * s + i * 0.28 * s, z + (i % 2) * 0.06);
      add(leaf);
    }
  };
  plant(-6.5, 4.4, 1.3);
  plant(-2.3, 4.5, 1.0);
  plant(6.4, -1.2, 1.2);

  /* kitchen + dining (east) ------------------------------------------------- */
  box(2.6, 0.9, 1.0, M.cabinet, 4.2, 0.45, 0.9);             // island
  box(2.8, 0.06, 1.16, M.counter, 4.2, 0.93, 0.9);
  for (let i = 0; i < 3; i++) {                               // stools
    const sx = 3.4 + i * 0.8;
    const seat = new Mesh(new CylinderGeometry(0.19, 0.19, 0.06, 16), M.wood);
    seat.position.set(sx, 0.68, 1.75);
    add(seat);
    box(0.04, 0.66, 0.04, M.metal, sx, 0.33, 1.75);
  }
  box(0.62, 0.9, 3.6, M.cabinet, 6.58, 0.45, 1.1);            // run along the east wall, under the window
  box(0.66, 0.05, 3.6, M.counter, 6.56, 0.92, 1.1);
  box(0.8, 2.2, 0.75, M.metal, 6.48, 1.1, -1.25);             // fridge
  box(3.3, 0.9, 0.62, M.cabinet, 4.25, 0.45, -1.36);          // back run
  box(3.3, 0.05, 0.66, M.counter, 4.25, 0.92, -1.36);
  box(3.3, 0.75, 0.36, M.cabinet, 4.25, 2.2, -1.5);           // uppers on the back wall
  // pendants over the island
  for (let i = 0; i < 3; i++) {
    const px = 3.45 + i * 0.75;
    box(0.01, 0.9, 0.01, M.metal, px, H - 0.45, 0.9);
    const shade = new Mesh(new ConeGeometry(0.17, 0.24, 20, 1, true), M.brass);
    shade.position.set(px, H - 0.98, 0.9);
    add(shade);
    const bulb = new Mesh(new SphereGeometry(0.06, 12, 8), M.warm);
    bulb.position.set(px, H - 1.08, 0.9);
    add(bulb);
  }
  point(0xffcf8a, 7, 4.2, H - 1.2, 0.9, 0, true);
  // dining table by the front windows
  box(2.2, 0.06, 1.0, M.wood, 4.4, 0.76, 3.6);
  for (const lx of [-0.95, 0.95]) for (const lz of [-0.38, 0.38]) box(0.06, 0.73, 0.06, M.darkwood, 4.4 + lx, 0.37, 3.6 + lz);
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    const cx = 3.7 + i * 0.7;
    const cz = 3.6 + side * 0.72;
    box(0.42, 0.05, 0.42, M.darkwood, cx, 0.46, cz);
    box(0.42, 0.45, 0.04, M.darkwood, cx, 0.7, cz + side * 0.2);
  }
  const chandelier = new Mesh(new TorusGeometry(0.42, 0.03, 8, 40), M.brass);
  chandelier.rotation.x = Math.PI / 2;
  chandelier.position.set(4.4, 2.15, 3.6);
  add(chandelier);
  box(0.01, 0.84, 0.01, M.metal, 4.4, 2.58, 3.6);
  const glowRing = new Mesh(new TorusGeometry(0.42, 0.012, 6, 40), M.warm);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.set(4.4, 2.12, 3.6);
  add(glowRing);
  point(0xffd59a, 4, 4.4, 1.9, 3.6, 0, false);
  // recessed ceiling lights
  for (const [x, z] of [[-4.5, 3.6], [-4.5, 0.5], [0, 3.9], [0, 1.2], [0, -3.2], [4.5, -0.4], [-3.6, -3.4], [3.6, -3.4]]) {
    const can = new Mesh(new CircleGeometry(0.09, 16), M.warm);
    can.rotation.x = Math.PI / 2;
    can.position.set(x, H - 0.02, z);
    add(can);
  }
  point(0xfff0d8, 5, 0, H - 0.4, 0.8, 0, true);
  point(0xfff0d8, 4, 0, H - 0.4, -3.2, 0, false);
  // back hall: bench along the left wall, a dark panel on the right
  box(0.42, 0.42, 1.6, M.wood, -2.15, 0.21, -3.9);
  box(0.04, 0.62, 0.9, M.tv, 2.42, 1.6, -3.9);

  /* back yard: patio, pool, string lights, loungers -------------------------- */
  flat(12, 4.2, M.stone, 0, -7.1, 0.0);
  plan.rects.push({ x: -6, z: -9.2, w: 12, d: 4.2, kind: 'patio' });
  // pool
  const poolX = 3.2, poolZ0 = -10.2, poolZ1 = -15.6;
  const pd = poolZ0 - poolZ1;
  box(2 * poolX + 1.2, 0.08, 0.6, M.coping, 0, 0.0, poolZ0 + 0.3);
  box(2 * poolX + 1.2, 0.08, 0.6, M.coping, 0, 0.0, poolZ1 - 0.3);
  box(0.6, 0.08, pd + 1.2, M.coping, -poolX - 0.3, 0.0, (poolZ0 + poolZ1) / 2);
  box(0.6, 0.08, pd + 1.2, M.coping, poolX + 0.3, 0.0, (poolZ0 + poolZ1) / 2);
  box(2 * poolX, 1.4, 0.05, M.poolWall, 0, -0.72, poolZ0);
  box(2 * poolX, 1.4, 0.05, M.poolWall, 0, -0.72, poolZ1);
  box(0.05, 1.4, pd, M.poolWall, -poolX, -0.72, (poolZ0 + poolZ1) / 2);
  box(0.05, 1.4, pd, M.poolWall, poolX, -0.72, (poolZ0 + poolZ1) / 2);
  box(2 * poolX, 0.05, pd, M.poolWall, 0, -1.4, (poolZ0 + poolZ1) / 2);
  const water = new Mesh(new PlaneGeometry(2 * poolX, pd, 1, 1), new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec3 vWorld;
      void main(){
        vec2 p = vWorld.xz * 1.6;
        float c = sin(p.x * 1.7 + uTime * 1.1) * sin(p.y * 1.3 - uTime * 0.9) + sin((p.x + p.y) * 2.3 + uTime * 1.6) * 0.5;
        c = pow(abs(c) * 0.55, 2.0);
        vec3 deep = vec3(0.01, 0.14, 0.22), lit = vec3(0.10, 0.55, 0.70);
        vec3 col = mix(deep, lit, 0.3 + c * 0.75);
        float edge = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        gl_FragColor = vec4(col * (0.75 + 0.25 * edge), 1.0);
      }`,
    toneMapped: true,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.14, (poolZ0 + poolZ1) / 2);
  add(water);
  animated.push((t) => { water.material.uniforms.uTime.value = t; });
  plan.rects.push({ x: -poolX, z: poolZ1, w: 2 * poolX, d: pd, kind: 'pool' });
  point(0x4fd8ff, 9, 0, -0.5, (poolZ0 + poolZ1) / 2, 0, true);
  // loungers
  for (const sx of [-5.0, -4.0]) {
    const g = new Group();
    const b1 = new Mesh(new BoxGeometry(0.7, 0.12, 1.6), M.cushion); b1.position.set(0, 0.32, 0.2); g.add(b1);
    const b2 = new Mesh(new BoxGeometry(0.7, 0.12, 0.7), M.cushion); b2.position.set(0, 0.5, -0.75); b2.rotation.x = -0.6; g.add(b2);
    const b3 = new Mesh(new BoxGeometry(0.74, 0.26, 2.1), M.darkwood); b3.position.set(0, 0.13, -0.05); g.add(b3);
    g.position.set(sx, 0, -12.6);
    add(g);
  }
  // string lights from the eave to two posts
  const posts = [[-6.2, -9.4], [6.2, -9.4]];
  for (const [x, z] of posts) box(0.12, 3.0, 0.12, M.darkwood, x, 1.5, z);
  const bulbs = [];
  const strand = (a, b, sag, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new Vector3().lerpVectors(a, b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      pts.push(p);
      if (i > 0 && i < n) bulbs.push(p.clone().add(new Vector3(0, -0.06, 0)));
    }
    const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.006, 4), M.metal);
    add(tube);
  };
  strand(new Vector3(-6.2, 2.95, -9.4), new Vector3(-2.5, 3.0, -5.25), 0.35, 12);
  strand(new Vector3(6.2, 2.95, -9.4), new Vector3(2.5, 3.0, -5.25), 0.35, 12);
  strand(new Vector3(-6.2, 2.95, -9.4), new Vector3(6.2, 2.95, -9.4), 0.55, 26);
  {
    const geo = new SphereGeometry(0.045, 8, 6);
    for (const p of bulbs) { const m = new Mesh(geo, M.warm); m.position.copy(p); add(m); }
  }
  point(0xffc98a, 5, 0, 2.4, -8.2, 0, false);

  /* trees, hedges, fence ---------------------------------------------------- */
  const tree = (x, z, s = 1, kind = 0) => {
    const trunk = new Mesh(new CylinderGeometry(0.12 * s, 0.18 * s, 2.2 * s, 8), M.bark);
    trunk.position.set(x, 1.1 * s, z);
    add(trunk);
    if (kind === 0) {
      for (let i = 0; i < 3; i++) {
        const blob = new Mesh(new IcosahedronGeometry((1.3 - i * 0.25) * s, 1), i === 1 ? M.leafDark : M.leaf);
        blob.position.set(x + (i - 1) * 0.35 * s, (2.5 + i * 0.75) * s, z + ((i % 2) - 0.5) * 0.4 * s);
        add(blob);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const cone = new Mesh(new ConeGeometry((1.4 - i * 0.35) * s, 1.8 * s, 9), i % 2 ? M.leafDark : M.leaf);
        cone.position.set(x, (2.0 + i * 1.0) * s, z);
        add(cone);
      }
    }
    plan.circles.push({ x, z, r: 1.2 * s });
  };
  tree(-9, 9.5, 1.25, 0); tree(7.6, 12.4, 1.0, 1); tree(-12, 3, 1.4, 1); tree(13, -4, 1.3, 0);
  tree(-11, -11, 1.5, 0); tree(10.5, -16, 1.2, 1); tree(-8, -19, 1.1, 1); tree(4, -21, 1.3, 0); tree(15, 8, 1.2, 1); tree(-15, 12, 1.1, 0);
  const hedge = (x, z, w, d) => box(w, 0.9, d, M.leafDark, x, 0.45, z);
  hedge(0, -23, 32, 0.8); hedge(-16, -9, 0.8, 28); hedge(16, -9, 0.8, 28);
  hedge(-4.2, 5.7, 4.4, 0.6); hedge(4.2, 5.7, 4.4, 0.6);
  plan.rects.push({ x: -16, z: -23, w: 32, d: 0.8, kind: 'hedge' });

  return {
    group,
    walls,
    plan,
    tick(t, low) {
      for (const f of animated) f(t);
      for (const l of lights) {
        if (!l.flicker) continue;
        l.light.intensity = l.base * (1 + l.flicker * (0.35 * Math.sin(t * 9.1) + 0.2 * Math.sin(t * 15.7 + 1.3)));
      }
    },
  };
}

/* ---------- the planned route --------------------------------------------- */
// Each stop: camera position, where it looks, and the caption it belongs to.
export const ROUTE = [
  { p: [0, 1.9, 21], look: [0, 1.7, 5], wp: 0, speed: 2.5 },
  { p: [0, 1.6, 12], look: [0, 1.5, 4], speed: 1.6 },
  { p: [0, 1.5, 6.4], look: [0, 1.45, 2], wp: 1, speed: 0.8 },
  { p: [0.1, 1.5, 3.0], look: [-3.2, 1.35, 2.4], speed: 0.8 },
  { p: [-2.4, 1.45, 2.35], look: [-6.9, 1.4, 2.4], wp: 2, speed: 0.6 },
  { p: [-1.0, 1.55, 0.7], look: [3, 1.3, 1.1], speed: 0.8 },
  { p: [1.7, 1.5, 0.35], look: [5, 1.05, 1.0], wp: 3, speed: 0.6 },
  { p: [0.4, 1.5, -1.9], look: [0, 1.4, -6], speed: 0.8 },
  { p: [0, 1.45, -4.6], look: [0, 1.25, -9], wp: 4, speed: 0.7 },
  { p: [0, 2.3, -7.9], look: [0, 0.7, -18], wp: 5, speed: 1.5 },
  { p: [0, 2.8, -13.2], look: [0, 0.3, -17], speed: 2.0 },
  { p: [4.5, 7.5, -20], look: [0, 1, -6], speed: 2.5 },
  { p: [-9, 13, -22.5], look: [0, 0.5, -3.5], wp: 6, speed: 3.0 },
];
