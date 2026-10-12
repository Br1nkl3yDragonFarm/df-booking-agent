// Entry point for the 3D scenes. Kept tiny: the scene code loads in separate chunks.
// - The fly-through's page layout is set right away (so nothing jumps later);
//   its code loads when the visitor gets near it.
// - The hero starts after the page has loaded and the browser is idle;
//   the static emblem image covers the wait, then cross-fades to live 3D.
// Without WebGL 2 the page keeps its static fallbacks.
import { hasWebGL2, qualityTier } from './util.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const gl = hasWebGL2();
document.documentElement.classList.toggle('no-webgl', !gl);

for (const track of document.querySelectorAll('[data-scene="flythrough"]')) {
  const section = track.closest('.flight') || track;
  if (gl) {
    section.classList.add('is-live');
    section.classList.toggle('is-static', reduce.matches);
    section.style.setProperty('--track-h', qualityTier() === 'low' ? '560vh' : '640vh');
    track.querySelector('[data-flight-controls]')?.removeAttribute('hidden');
    track.querySelector('[data-route] li')?.classList.add('is-active');
  }
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    import('./flythrough.js')
      .then((m) => m.createFlythrough(track, { reduce, gl }))
      .catch((err) => console.warn('Fly-through unavailable:', err));
  }, { rootMargin: '120% 0px' });
  io.observe(track);
}

if (gl) {
  const heroes = document.querySelectorAll('[data-scene="hero"]');
  const start = () => heroes.forEach((el) => import('./hero.js')
    .then((m) => m.createHero(el, { reduce }))
    .catch((err) => console.warn('Hero scene unavailable:', err)));
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 150));
  const go = () => idle(start, { timeout: 1200 });
  if (heroes.length) {
    if (document.readyState === 'complete') go();
    else addEventListener('load', go, { once: true });
  }
}
