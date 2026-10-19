// ============================================================
//  DRAGON FARM CRM — FAN LIST
//
//  Fans sign up at shows by scanning a QR code at the merch table, which
//  opens fans.html for that show and town. The list is private (behind
//  the passcode, netlify/functions/fans.mjs). Counts by town are the
//  honest proof of draw that gets bigger guarantees.
//
//  Needs vendor/qrcode.js for the QR code and outreach.js (DFOut) for
//  the modal.
// ============================================================

(function () {
  const API = '/.netlify/functions/fans';
  let fans = [];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function call(init) {
    const go = () => fetch(API, { ...(init || {}), headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode() } });
    let res = await go();
    if (res.status === 401 && DFStore.askPasscode()) res = await go();
    return res;
  }

  async function load() {
    try {
      const res = await call();
      if (res.ok) fans = (await res.json()).fans || [];
    } catch {}
    return fans;
  }

  async function remove(email) {
    const res = await call({ method: 'POST', body: JSON.stringify({ remove: email }) });
    if (res.ok) fans = (await res.json()).fans || [];
    return res.ok;
  }

  // "nashville, tn" and "Nashville, TN" are one town (same rule as report.js).
  function townOf(city) {
    const c = String(city || '').trim().replace(/\s+/g, ' ');
    if (!c) return 'No town set';
    return c.split(', ').map((part, i) => i > 0 && part.length === 2 ? part.toUpperCase()
      : part.replace(/\b\w/g, ch => ch.toUpperCase())).join(', ');
  }

  function byTown(list) {
    const counts = new Map();
    (list || fans).forEach(f => { const t = townOf(f.city); counts.set(t, (counts.get(t) || 0) + 1); });
    return [...counts.entries()].map(([town, count]) => ({ town, count })).sort((a, b) => b.count - a.count || a.town.localeCompare(b.town));
  }

  // One line for the press kit's draw, e.g. "Email list: 240 fans (Nashville, TN 120, Memphis, TN 40)".
  function drawLine(list) {
    const l = list || fans;
    if (!l.length) return '';
    const top = byTown(l).filter(t => t.town !== 'No town set').slice(0, 4).map(t => `${t.town} ${t.count}`);
    return `Email list: ${l.length} fan${l.length === 1 ? '' : 's'}${top.length ? ` (${top.join(', ')})` : ''}`;
  }

  function signupUrl(show, city) {
    const p = new URLSearchParams();
    if (show) p.set('show', show);
    if (city) p.set('city', city);
    const q = p.toString();
    return `${location.origin}/fans.html${q ? '?' + q : ''}`;
  }

  function qrSvg(url, cell = 6) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  }

  function signHtml(url, show) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Join the list${show ? ' · ' + esc(show) : ''}</title>
<style>body{margin:0;font-family:Georgia,serif;color:#111;text-align:center}main{max-width:640px;margin:0 auto;padding:48px 24px}h1{font-size:56px;margin:0 0 8px;letter-spacing:.02em}
p{font-size:22px;margin:6px 0}.qr{width:380px;max-width:80vw;margin:28px auto}.qr svg{width:100%;height:auto}.small{font-size:15px;color:#555;word-break:break-all}
.btn{margin-top:24px;padding:10px 18px;background:#1d2321;color:#fff;border:0;border-radius:6px;font-size:14px;cursor:pointer}@media print{.btn{display:none}}</style></head>
<body><main><h1>JOIN THE LIST</h1><p>Timothy Chance &amp; Rasta Country</p><p>Scan to hear first when we play near you</p>
<div class="qr">${qrSvg(url, 10)}</div>${show ? `<p>${esc(show)}</p>` : ''}<p class="small">${esc(url)}</p>
<button class="btn" onclick="print()">Print</button></main></body></html>`;
  }

  // A modal with the QR code for one show, a printable sign and the link.
  function openQr(show, city) {
    const url = signupUrl(show, city);
    const box = DFOut.show(`
      <div class="dfo-head"><h3>Fan sign-up QR</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <p class="dfo-muted">Put this at the merch table${show ? ` for <b>${esc(show)}</b>` : ''}. Fans scan it, add their email and town, and land on your private fan list.</p>
        <div class="dff-qr">${qrSvg(url)}</div>
        <p class="dff-url">${esc(url)}</p>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions">
        <button class="btn btn-gold" data-a="print">🖨 Print a sign</button>
        <button class="btn btn-ghost" data-a="copy">📋 Copy link</button>
      </div>`);
    const status = (m, k) => { const s = box.querySelector('[data-k="status"]'); s.className = 'dfo-status' + (k ? ' dfo-' + k : ''); s.textContent = m; };
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);
    box.querySelector('[data-a="copy"]').addEventListener('click', () => navigator.clipboard.writeText(url).then(() => status('Copied ✓', 'ok')).catch(() => status('Copy failed. Select the link and copy it.', 'err')));
    box.querySelector('[data-a="print"]').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) return status('Your browser blocked the window. Allow pop-ups for this site.', 'err');
      w.document.write(signHtml(url, show));
      w.document.close();
    });
  }

  // For a booked show lead: "Exit/In, Nashville, TN · Sat, Oct 31".
  function showLabel(l) {
    const date = l.eventDate ? (() => { const [y, m, d] = l.eventDate.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); })() : '';
    return [[l.name, l.city].filter(Boolean).join(', '), date].filter(Boolean).join(' · ');
  }
  const openForShow = l => openQr(showLabel(l), l.city || '');

  const style = document.createElement('style');
  style.textContent = `
    .dff-qr{background:#fff;border-radius:8px;padding:12px;width:240px;max-width:100%;margin:0.5rem auto}
    .dff-qr svg{display:block;width:100%;height:auto}
    .dff-url{font-size:0.75rem;color:var(--gray,#9aa39c);word-break:break-all;text-align:center;margin:0.25rem 0 0}`;
  document.head.appendChild(style);

  window.DFFans = { load, remove, all: () => fans, byTown, drawLine, signupUrl, openQr, openForShow, showLabel };
})();
