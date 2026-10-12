// Small helpers shared by the 3D scenes.

export function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// Rough device class. "high" gets bloom and denser particles; everything else stays lean.
export function qualityTier() {
  // ?quality=max forces full quality and turns off automatic downgrading (handy for demos)
  if (new URLSearchParams(location.search).get('quality') === 'max') return 'max';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  if (coarse || small || cores <= 4 || memory <= 4) return 'low';
  return 'high';
}

// Frame-rate independent smoothing toward a target.
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Runs `frame(dt, now)` only while `isActive()` is true; call `wake()` to restart.
export function loop(frame, isActive) {
  let raf = 0;
  let last = 0;
  const tick = (now) => {
    raf = 0;
    if (!isActive()) { last = 0; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    frame(dt, now / 1000);
    raf = requestAnimationFrame(tick);
  };
  return { wake() { if (!raf) raf = requestAnimationFrame(tick); } };
}

// Watches visibility of an element and of the tab.
export function visibility(el, onChange, rootMargin = '0px') {
  let inView = false;
  const emit = () => onChange(inView && document.visibilityState === 'visible');
  const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; emit(); }, { rootMargin });
  io.observe(el);
  document.addEventListener('visibilitychange', emit);
  return () => { io.disconnect(); document.removeEventListener('visibilitychange', emit); };
}
