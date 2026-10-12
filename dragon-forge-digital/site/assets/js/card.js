// Exhibit 01 — a digital business card with a real, scannable QR code.
// The QR code holds a vCard, so a phone camera offers to save the contact.
// Nothing typed here leaves the browser.
import qrcode from './vendor/qrcode.js';

const DEFAULTS = {
  name: 'Dragon Forge Digital',
  business: 'Western Kentucky',
  role: 'Websites · Booking · Drone video',
  phone: '',
  email: '',
  web: 'dragon-forge-digital.netlify.app',
};

const vEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

function vCard(d, isDefault) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (isDefault) {
    lines.push('N:;;;;', `FN:${vEscape(d.name)}`, `ORG:${vEscape(d.name)}`, 'X-ABShowAs:COMPANY', `NOTE:${vEscape(d.role)}`);
  } else {
    const parts = d.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    lines.push(`N:${vEscape(last)};${vEscape(parts.join(' '))};;;`, `FN:${vEscape(d.name)}`);
    if (d.business) lines.push(`ORG:${vEscape(d.business)}`);
    if (d.role) lines.push(`TITLE:${vEscape(d.role)}`);
  }
  if (d.phone) lines.push(`TEL;TYPE=CELL:${vEscape(d.phone)}`);
  if (d.email) lines.push(`EMAIL;TYPE=INTERNET:${vEscape(d.email)}`);
  if (d.web) lines.push(`URL:${vEscape(/^https?:\/\//i.test(d.web) ? d.web : `https://${d.web}`)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function drawQR(canvas, text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = canvas.width;
  const cell = Math.floor(size / (count + quiet * 2));
  const offset = Math.floor((size - cell * count) / 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0b0907';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
    }
  }
}

export function init(stage, { reduceMotion }) {
  const card = stage.querySelector('.bcard');
  const editor = stage.querySelector('[data-card-editor]');
  const canvas = stage.querySelector('.bcard__qr');
  if (!card || !editor || !canvas) return;
  const outs = Object.fromEntries([...card.querySelectorAll('[data-out]')].map((el) => [el.dataset.out, el]));
  const ins = [...editor.querySelectorAll('[data-in]')];

  const read = () => {
    const raw = Object.fromEntries(ins.map((el) => [el.dataset.in, el.value.trim()]));
    const isDefault = !raw.name && !raw.business && !raw.role && !raw.phone && !raw.email && !raw.web;
    if (isDefault) return { data: { ...DEFAULTS }, isDefault };
    return {
      isDefault,
      data: {
        name: raw.name || raw.business || 'Your name',
        business: raw.business,
        role: raw.role,
        phone: raw.phone,
        email: raw.email,
        web: raw.web,
      },
    };
  };

  let qrTimer = 0;
  const render = () => {
    const { data, isDefault } = read();
    outs.name.textContent = data.name;
    outs.business.textContent = isDefault ? DEFAULTS.business : (data.business || '');
    outs.role.textContent = data.role || '';
    for (const key of ['phone', 'email', 'web']) {
      outs[key].textContent = data[key] || '';
      outs[key].hidden = !data[key];
    }
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => drawQR(canvas, vCard(data, isDefault)), 120);
  };
  editor.addEventListener('input', render);
  editor.addEventListener('submit', (e) => e.preventDefault());
  editor.addEventListener('change', (e) => {
    if (e.target.name === 'finish') card.dataset.finish = e.target.value;
  });
  render();
  drawQR(canvas, vCard(DEFAULTS, true));

  /* turning the card over: button, click, or drag */
  let flip = 0;
  const setFlip = (deg) => { flip = deg; card.style.setProperty('--flip', `${deg}deg`); };
  const turn = () => setFlip(Math.round(flip / 180) * 180 + 180);
  stage.querySelector('[data-card-flip]')?.addEventListener('click', turn);

  let drag = null;
  card.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, start: flip, moved: false, id: e.pointerId };
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) { drag.moved = true; card.classList.add('is-dragging'); }
      if (drag.moved) setFlip(drag.start + dx * 0.6);
      return;
    }
    if (e.pointerType !== 'mouse' || reduceMotion.matches) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--ry', `${(px * 16).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-py * 12).toFixed(2)}deg`);
    card.style.setProperty('--sx', `${(50 + px * 90).toFixed(1)}%`);
  });
  const endDrag = (e) => {
    if (!drag) return;
    card.classList.remove('is-dragging');
    if (drag.moved) setFlip(Math.round(flip / 180) * 180);
    else if (e.type === 'pointerup') turn();
    drag = null;
  };
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
  card.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  });

  /* a slow idle sway so the card reads as an object, not a picture */
  if (!reduceMotion.matches) {
    let visible = false;
    let t0 = performance.now();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { t0 = performance.now(); requestAnimationFrame(sway); } }).observe(card);
    const sway = (now) => {
      if (!visible) return;
      if (!drag && !card.matches(':hover')) {
        const t = (now - t0) / 1000;
        card.style.setProperty('--ry', `${(Math.sin(t * 0.7) * 9).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(Math.sin(t * 0.5 + 1) * 4).toFixed(2)}deg`);
        card.style.setProperty('--sx', `${(50 + Math.sin(t * 0.7) * 40).toFixed(1)}%`);
      }
      requestAnimationFrame(sway);
    };
  }

  /* the contact file */
  stage.querySelector('[data-card-vcf]')?.addEventListener('click', () => {
    const { data, isDefault } = read();
    const blob = new Blob([vCard(data, isDefault)], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(data.name || 'contact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'contact'}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}
