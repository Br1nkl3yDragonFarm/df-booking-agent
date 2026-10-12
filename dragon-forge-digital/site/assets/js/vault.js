// Exhibit 05 — a typical small-business mess of files and logins, sorted into a vault.
// Chips live in CSS 3D space; sorting moves them into labeled drawers, merges duplicates
// and resolves the "who owns this?" items.

const CATS = ['Brand', 'Accounts', 'Media', 'Documents', 'Backups'];
const ITEMS = [
  { id: 'logo', cat: 0, a: 'logo.ai (from the designer?)', b: 'Logo · every format', problem: true, fix: true },
  { cat: 0, a: 'logo.png', dup: 'logo' },
  { cat: 0, a: 'logo-final.png', dup: 'logo' },
  { cat: 0, a: 'logo-FINAL-v3.png', dup: 'logo' },
  { cat: 0, a: 'Logo (1).jpg', dup: 'logo' },
  { cat: 0, a: 'logo_new_USE_THIS.png', dup: 'logo' },
  { cat: 0, a: 'Brand colors? ask designer', b: 'Brand colors.pdf', problem: true, fix: true },
  { cat: 0, a: 'fonts.zip (license?)', b: 'Fonts · licensed', problem: true, fix: true },
  { cat: 1, a: 'Website login — sticky note', b: 'Website host', problem: true, owner: true },
  { cat: 1, a: 'Domain — renews ???', b: 'Domain', problem: true, owner: true },
  { cat: 1, a: 'Facebook — old manager’s login', b: 'Facebook page', problem: true, owner: true },
  { cat: 1, a: 'Google profile — unclaimed?', b: 'Google Business Profile', problem: true, owner: true },
  { cat: 1, a: 'instagram-pw.txt', b: 'Instagram', problem: true, owner: true },
  { cat: 1, a: 'Email — shared password', b: 'Business email', problem: true, owner: true },
  { cat: 2, a: 'IMG_4021.HEIC', b: 'Photos / Jobs' },
  { cat: 2, a: 'DSC_0193.jpg', b: 'Photos / Team' },
  { cat: 2, a: 'video (1).mov', b: 'Video / Reels' },
  { cat: 2, a: 'Screenshot 2026-03-02.png', b: 'Screenshots / Archive' },
  { cat: 2, a: 'Job photos — on an old phone', b: 'Job photos · backed up', problem: true, fix: true },
  { id: 'price', cat: 3, a: 'Price list FINAL.docx', b: 'Price list · current' },
  { cat: 3, a: 'Price list 2024.docx', dup: 'price' },
  { cat: 3, a: 'Price list (old) copy.docx', dup: 'price' },
  { cat: 3, a: 'contract template.pdf', b: 'Contract template' },
  { cat: 3, a: 'W-9.pdf', b: 'Tax forms' },
  { cat: 4, a: 'Backup: none', b: 'Weekly offsite backup', problem: true, fix: true },
  { cat: 4, a: '', b: 'Handover guide.pdf', added: true, fix: true },
];

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function init(stage, { reduceMotion }) {
  const section = stage.closest('.exhibit');
  const host = stage.querySelector('[data-vault-stage]');
  const button = section.querySelector('[data-vault-sort]');
  const label = button?.querySelector('span');
  const status = section.querySelector('[data-vault-status]');
  if (!host || !button) return;

  const world = document.createElement('div');
  world.className = 'vault__world';
  host.append(world);

  const heads = CATS.map((name) => {
    const h = document.createElement('div');
    h.className = 'vhead';
    h.textContent = name;
    world.append(h);
    return h;
  });

  const chips = ITEMS.map((item) => {
    const c = document.createElement('div');
    c.className = 'vchip';
    if (item.problem) c.classList.add('is-problem');
    const icon = document.createElement('i');
    const text = document.createElement('span');
    text.textContent = item.a || item.b;
    const ok = document.createElement('b');
    ok.className = 'ok';
    ok.textContent = item.owner ? 'yours' : '✓';
    c.append(icon, text, ok);
    if (item.owner || item.fix) c.classList.add('will-resolve');
    world.append(c);
    return { item, el: c, text };
  });
  const byId = Object.fromEntries(chips.filter((c) => c.item.id).map((c) => [c.item.id, c]));

  const counts = {
    loose: ITEMS.filter((i) => !i.added).length,
    logos: ITEMS.filter((i) => i.id === 'logo' || i.dup === 'logo').length,
    prices: ITEMS.filter((i) => i.id === 'price' || i.dup === 'price').length,
    dups: ITEMS.filter((i) => i.dup).length,
    owned: ITEMS.filter((i) => i.owner).length,
  };
  const messy = `${counts.loose} loose files and logins · ${counts.logos} copies of the logo · ${counts.prices} price lists · backups: none`;
  const tidy = `Sorted into ${CATS.length} places · <strong>${counts.dups} duplicates merged</strong> · <strong>${counts.owned} accounts owned by you</strong> · weekly backup on · handover guide written`;
  status.textContent = messy;

  let sorted = false;
  let chaosH = 0;
  let userTouched = false;

  const set = (el, v) => {
    el.style.setProperty('--x', `${v.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${v.y.toFixed(1)}px`);
    el.style.setProperty('--z', `${(v.z || 0).toFixed(1)}px`);
    el.style.setProperty('--rx', `${(v.rx || 0).toFixed(1)}deg`);
    el.style.setProperty('--ry', `${(v.ry || 0).toFixed(1)}deg`);
    el.style.setProperty('--rz', `${(v.rz || 0).toFixed(1)}deg`);
    el.style.setProperty('--sc', String(v.sc ?? 1));
  };

  const layout = () => {
    host.style.height = '';
    chaosH = host.clientHeight;
    const W = host.clientWidth;
    const H = chaosH;
    const rand = rng(7);

    /* chaos */
    const chaos = chips.map(({ el }) => {
      el.style.maxWidth = '';
      const w = Math.min(el.offsetWidth || 160, W * 0.6);
      return {
        x: 10 + rand() * Math.max(10, W - w - 20),
        y: 14 + rand() * (H - 50),
        z: -280 + rand() * 400,
        rx: (rand() - 0.5) * 70,
        ry: (rand() - 0.5) * 80,
        rz: (rand() - 0.5) * 44,
      };
    });

    /* sorted drawers */
    const cols = W >= 860 ? 5 : W >= 520 ? 3 : 2;
    const pad = W < 520 ? 12 : 20;
    const gap = W < 520 ? 10 : 16;
    const blockW = (W - pad * 2 - gap * (cols - 1)) / cols;
    const pitch = 36;
    const headH = 34;
    const kept = CATS.map((_, ci) => chips.filter((c) => c.item.cat === ci && !c.item.dup));
    const rows = Math.ceil(CATS.length / cols);
    const rowH = Array.from({ length: rows }, (_, r) => Math.max(...kept.slice(r * cols, r * cols + cols).map((k) => headH + k.length * pitch)) + 22);
    const rowTop = rowH.map((_, r) => pad + rowH.slice(0, r).reduce((a, b) => a + b, 0));
    const sortedH = Math.max(H, rowTop[rows - 1] + rowH[rows - 1] + pad);
    const orderPos = new Map();
    kept.forEach((list, ci) => {
      const col = ci % cols;
      const row = Math.floor(ci / cols);
      const x = pad + col * (blockW + gap);
      heads[ci].style.setProperty('--x', `${x}px`);
      heads[ci].style.setProperty('--y', `${rowTop[row]}px`);
      heads[ci].style.setProperty('--d', `${0.25 + ci * 0.06}s`);
      heads[ci].style.width = `${blockW}px`;
      list.forEach((c, k) => orderPos.set(c, { x, y: rowTop[row] + headH + k * pitch, z: 0 }));
    });
    const order = chips.map((c) => {
      const target = c.item.dup ? byId[c.item.dup] : c;
      const p = orderPos.get(target);
      return { ...p, z: c.item.dup ? -6 : 0 };
    });

    host._layout = { chaos, order, blockW, sortedH };
    apply(false);
  };

  const apply = (animate) => {
    const L = host._layout;
    if (!L) return;
    host.style.height = sorted ? `${L.sortedH}px` : '';
    stage.classList.toggle('is-sorted', sorted);
    chips.forEach((c, i) => {
      const d = animate ? (sorted ? i * 0.035 : (chips.length - i) * 0.02) : 0;
      c.el.style.setProperty('--d', `${d}s`);
      c.el.style.maxWidth = sorted ? `${L.blockW}px` : '';
      if (c.item.added) {
        set(c.el, { ...L.order[i], sc: sorted ? 1 : 0.6 });
        c.el.style.opacity = sorted ? '1' : '0';
      } else {
        set(c.el, sorted ? L.order[i] : L.chaos[i]);
      }
      c.el.classList.toggle('is-merged', sorted && !!c.item.dup);
      c.el.classList.toggle('is-resolved', sorted && !!(c.item.owner || c.item.fix));
      c.el.classList.toggle('is-problem', !sorted && !!c.item.problem);
      const swap = () => { c.text.textContent = sorted ? (c.item.b || c.item.a) : (c.item.a || c.item.b); };
      if (animate) setTimeout(swap, (d + 0.45) * 1000); else swap();
    });
    button.setAttribute('aria-pressed', String(sorted));
    if (label) label.textContent = sorted ? 'Mess it up again' : 'Sort it';
    status.innerHTML = sorted ? tidy : messy;
  };

  button.addEventListener('click', () => { sorted = !sorted; userTouched = true; apply(!reduceMotion.matches); });

  /* depth: the pile tilts a little with the pointer */
  if (!reduceMotion.matches && matchMedia('(hover: hover)').matches) {
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      world.style.transform = `rotateY(${(px * 8).toFixed(2)}deg) rotateX(${(-py * 6).toFixed(2)}deg)`;
    });
    host.addEventListener('pointerleave', () => { world.style.transform = ''; });
    world.style.transition = 'transform 0.4s ease-out';
  }

  layout();
  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 150); }).observe(stage);

  /* sort itself once, the first time someone stops on it */
  if (!reduceMotion.matches) {
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      if (e.isIntersecting && !userTouched) {
        timer = setTimeout(() => { if (!userTouched && !sorted) { sorted = true; apply(true); io.disconnect(); } }, 2200);
      }
    }, { threshold: 0.6 });
    io.observe(host);
  }
}
