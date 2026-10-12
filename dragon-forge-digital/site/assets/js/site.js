// Dragon Forge Digital — site-wide behavior.
// Everything here is progressive enhancement: the page works without it.

const root = document.documentElement;
root.classList.add('js');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Year in the footer ---------- */
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

/* ---------- Mobile menu ---------- */
const menuBtn = document.querySelector('.menu-btn');
const nav = document.getElementById('site-nav');
if (menuBtn && nav) {
  const label = menuBtn.querySelector('span');
  const icon = menuBtn.querySelector('use');
  const setOpen = (open, { restoreFocus = true } = {}) => {
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Close' : 'Menu';
    if (icon) icon.setAttribute('href', open ? '#i-close' : '#i-menu');
    if (open) nav.querySelector('a')?.focus();
    else if (restoreFocus && nav.contains(document.activeElement)) menuBtn.focus();
  };
  menuBtn.addEventListener('click', () => setOpen(menuBtn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false, { restoreFocus: false }); });
  document.addEventListener('keydown', (e) => {
    if (menuBtn.getAttribute('aria-expanded') !== 'true') return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key !== 'Tab') return;
    // keep focus inside the open menu: the Close button plus the menu's links
    const stops = [menuBtn, ...nav.querySelectorAll('a')];
    const i = stops.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i === stops.length - 1 ? 0 : i + 1);
    e.preventDefault();
    stops[next].focus();
  });
  matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setOpen(false, { restoreFocus: false }); });
}

/* ---------- Heat bar (scroll progress) ---------- */
const heat = document.querySelector('.heat span');
if (heat) {
  let queued = false;
  const update = () => {
    queued = false;
    const max = Math.max(1, root.scrollHeight - innerHeight);
    heat.style.setProperty('--progress', Math.min(1, scrollY / max).toFixed(4));
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
}

/* ---------- Current section in the nav ---------- */
const navLinks = [...document.querySelectorAll('.nav__list a[href^="#"]')];
if (navLinks.length && 'IntersectionObserver' in window) {
  // Each nav item covers a run of sections.
  const groups = { services: '#services', card: '#card', website: '#card', booking: '#card', vault: '#card', flight: '#flight', 'own-it': '#own-it', rates: '#rates', answers: '#answers' };
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = groups[entry.target.id];
      navLinks.forEach((a) => {
        if (a.getAttribute('href') === target) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  Object.keys(groups).forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  const hero = document.querySelector('.hero');
  if (hero) new IntersectionObserver(([e]) => { if (e.isIntersecting) navLinks.forEach((a) => a.removeAttribute('aria-current')); }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
}

/* ---------- Inquiry form: package preselect + filming details ---------- */
const select = document.getElementById('service-select');
const flightBrief = document.getElementById('flight-form-brief');
const syncFlightBrief = () => {
  if (select && flightBrief) flightBrief.hidden = !/Forge|Flythrough|Spotlight/.test(select.value);
};
const choose = (value) => {
  if (!select || !value) return false;
  const match = [...select.options].find((o) => o.value === value);
  if (!match) return false;
  select.value = value;
  syncFlightBrief();
  return true;
};
if (select) {
  select.addEventListener('change', syncFlightBrief);
  choose(new URLSearchParams(location.search).get('service'));
  syncFlightBrief();
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-package]');
    if (link) choose(link.getAttribute('data-package'));
  });
}
const form = document.getElementById('inquiry-form');
const status = document.getElementById('form-status');
if (form && status && location.protocol === 'file:') {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = 'This form only sends once the site is published on Netlify with form detection turned on. See README.md, step 3.';
    status.classList.add('is-notice');
  });
}

/* ---------- Load each live sample when it comes near the screen ---------- */
const demos = {
  services: () => import('./services.js'),
  card: () => import('./card.js'),
  layers: () => import('./layers.js'),
  booking: () => import('./lab.js'),
  vault: () => import('./vault.js'),
};
const demoEls = [...document.querySelectorAll('[data-demo]')].filter((el) => demos[el.dataset.demo]);
const start = (el) => demos[el.dataset.demo]().then((m) => m.init(el, { reduceMotion })).catch((err) => console.error(err));
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      start(entry.target);
    }
  }, { rootMargin: '600px 0px' });
  demoEls.forEach((el) => io.observe(el));
} else {
  demoEls.forEach(start);
}
