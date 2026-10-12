// Exhibit 02 — this page, taken apart into the layers of a website.
// The speed and contrast figures are measured live on the visitor's device.

function luminance(hex) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function measure(root) {
  const set = (key, text) => {
    root.querySelectorAll(`[data-metric="${key}"]`).forEach((el) => { el.textContent = text; });
    root.querySelectorAll(`[data-metric-text="${key}"]`).forEach((el) => { el.textContent = text; });
  };
  const css = getComputedStyle(document.documentElement);
  const ratio = contrast(css.getPropertyValue('--text').trim(), css.getPropertyValue('--bg').trim());
  set('contrast', `${ratio.toFixed(1)} : 1`);

  const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
  const nav = performance.getEntriesByType('navigation')[0];
  const ms = paint ? paint.startTime : nav ? nav.domContentLoadedEventEnd : 0;
  set('time', ms ? `${(ms / 1000).toFixed(2)} s` : 'n/a');

  const resources = performance.getEntriesByType('resource');
  const bytes = resources.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), nav ? (nav.transferSize || nav.encodedBodySize || 0) : 0);
  const files = resources.length + 1;
  root.querySelectorAll('[data-metric-text="files"]').forEach((el) => {
    el.textContent = `${files} files and ${(bytes / 1024).toFixed(0)} KB so far, including the 3D scenes`;
  });
}

export function init(root, { reduceMotion }) {
  const viewport = root.querySelector('.layers__viewport');
  const stack = root.querySelector('.layers__stack');
  const layers = [...root.querySelectorAll('.layer')];
  const listButtons = [...root.querySelectorAll('[data-layer]')];
  const deviceButtons = [...root.querySelectorAll('[data-device]')].filter((b) => b.tagName === 'BUTTON');
  if (!viewport || !stack) return;

  const select = (i) => {
    root.classList.add('has-active');
    layers.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.i) === i));
    listButtons.forEach((b) => {
      const on = Number(b.dataset.layer) === i;
      b.setAttribute('aria-expanded', String(on));
      const desc = document.getElementById(b.getAttribute('aria-controls'));
      if (desc) desc.hidden = !on;
    });
  };
  listButtons.forEach((b) => b.addEventListener('click', () => select(Number(b.dataset.layer))));
  layers.forEach((el) => el.addEventListener('click', () => { if (!moved) select(Number(el.dataset.i)); }));
  select(0);

  deviceButtons.forEach((b) => b.addEventListener('click', () => {
    root.dataset.device = b.dataset.device;
    deviceButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  /* drag to turn the stack */
  let spin = -36;
  let tilt = 58;
  let drag = null;
  let moved = false;
  const apply = () => {
    stack.style.setProperty('--spin', `${spin.toFixed(2)}deg`);
    stack.style.setProperty('--tilt', `${tilt.toFixed(2)}deg`);
  };
  viewport.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, spin, tilt };
    moved = false;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    viewport.classList.add('is-dragging');
    spin = drag.spin + dx * 0.35;
    tilt = Math.max(18, Math.min(76, drag.tilt - dy * 0.25));
    apply();
  });
  const end = () => { drag = null; viewport.classList.remove('is-dragging'); setTimeout(() => { moved = false; }, 0); };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);

  /* explode the stack as it scrolls into view, and drift slowly while idle */
  const gapFor = (p) => 6 + p * 38;
  if (reduceMotion.matches) {
    stack.style.setProperty('--gap', `${gapFor(1)}px`);
  } else {
    let visible = false;
    const t0 = performance.now();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestAnimationFrame(tick); }, { threshold: 0 }).observe(viewport);
    const tick = (now) => {
      if (!visible) return;
      const r = viewport.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.75)));
      stack.style.setProperty('--gap', `${gapFor(p * p * (3 - 2 * p)).toFixed(1)}px`);
      if (!drag) {
        const sway = Math.sin((now - t0) / 2600) * 7;
        stack.style.setProperty('--spin', `${(spin + sway).toFixed(2)}deg`);
      }
      requestAnimationFrame(tick);
    };
  }
  apply();

  if (document.readyState === 'complete') setTimeout(() => measure(root), 50);
  else addEventListener('load', () => setTimeout(() => measure(root), 50), { once: true });
}
