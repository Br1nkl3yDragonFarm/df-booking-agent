// Entry point for the 3D scenes. Each scene mounts on a [data-scene] element.
// Without WebGL 2 the page keeps its static fallbacks.
import { hasWebGL2 } from './util.js';
import { createHero } from './hero.js';
import { createFlythrough } from './flythrough.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const gl = hasWebGL2();
document.documentElement.classList.toggle('no-webgl', !gl);

for (const el of document.querySelectorAll('[data-scene="hero"]')) {
  if (gl) createHero(el, { reduce }).catch((err) => console.warn('Hero scene unavailable:', err));
}
for (const el of document.querySelectorAll('[data-scene="flythrough"]')) {
  createFlythrough(el, { reduce, gl }).catch((err) => console.warn('Fly-through unavailable:', err));
}
