// What we build — the service plates catch the forge light.
// A glow follows the mouse across each plate and the plate tilts toward it;
// the plates' top edges heat up in turn when the grid scrolls into view.
// Touch screens and reduced motion keep still plates; everything stays readable without this file.

export function init(grid, { reduceMotion }) {
  const plates = [...grid.querySelectorAll('.svc')];
  plates.forEach((plate, i) => plate.style.setProperty('--i', String(i)));

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    grid.classList.add('is-lit');
  } else {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      grid.classList.add('is-lit');
    }, { rootMargin: '0px 0px -12% 0px' }); // by viewport, not by share of the grid: it is very tall on phones
    io.observe(grid);
  }

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  for (const plate of plates) {
    let frame = 0;
    let pointer = null;
    const paint = () => {
      frame = 0;
      if (!pointer) return;
      const r = plate.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (pointer.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (pointer.clientY - r.top) / r.height));
      plate.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      plate.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      if (!reduceMotion.matches) {
        plate.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
        plate.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
      }
    };
    plate.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !finePointer.matches) return;
      pointer = { clientX: e.clientX, clientY: e.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    });
    plate.addEventListener('pointerleave', () => {
      pointer = null;
      plate.style.setProperty('--rx', '0deg');
      plate.style.setProperty('--ry', '0deg');
    });
  }
}
