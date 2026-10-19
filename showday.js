// ============================================================
//  DRAGON FARM CRM — SHOW DAY & SETTLEMENT
//
//  Show-day fields on a booked venue lead:
//    loadIn, setTime ('HH:MM'), setLength (minutes),
//    dayContact, dayPhone, address, sound (who provides sound/backline),
//    hospitality
//  Settlement fields, filled in after the show:
//    settled, paid (what we were actually paid), doorNet (door after the
//    venue's expenses, used to check door deals), attendance,
//    merch (merch sales), costs (our travel, gas, crew), settleNotes
//
//  Expected pay comes from the deal (deals.js): a flat guarantee, our
//  share of doorNet, or whichever is more for "guarantee vs. %".
// ============================================================

(function () {
  const SOON_DAYS = 7;
  const SHORT = { 'Timothy Chance and Rasta Country': 'TCRC', 'Poetic Nocturnal Creatures': 'PNC', 'Both artists': 'Both' };

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function daysUntil(date) {
    const [y, m, d] = date.split('-').map(Number);
    const now = new Date();
    return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  }
  function time12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  const num = v => Number(v) || 0;
  const money = n => DFDeals.money(n);

  function isPlayed(l) { return l.status === 'booked' && !!l.eventDate && l.eventDate < today(); }

  // What the deal says we should have been paid, or null if it can't be worked out.
  function expected(l) {
    const g = num(l.guarantee), share = num(l.doorPct) / 100 * num(l.doorNet);
    switch (l.dealType) {
      case 'guarantee': return g || null;
      case 'door': return l.doorNet !== '' && l.doorNet != null && num(l.doorPct) ? share : null;
      case 'vs': return g ? Math.max(g, share) : null;
      default: return g || null;
    }
  }

  function net(l) { return num(l.paid) + num(l.merch) - num(l.costs); }

  function mapLink(l) {
    const q = l.address || [l.name, l.city].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  // [{ level, text }] for the show card.
  function issues(l) {
    const out = [];
    if (l.status !== 'booked' || !l.eventDate) return out;
    const days = daysUntil(l.eventDate);
    if (days >= 0 && days <= SOON_DAYS) {
      const missing = [!l.loadIn && 'load-in time', !l.setTime && 'set time', !l.dayContact && !l.dayPhone && 'day-of contact', !l.address && 'address']
        .filter(Boolean);
      if (missing.length) out.push({ level: 'amber', text: `${days === 0 ? 'Show is today' : `Show in ${days} day${days === 1 ? '' : 's'}`}: still need ${missing.join(', ')}` });
    }
    if (days < 0 && !l.settled) out.push({ level: 'red', text: 'Show played but not settled: record what you were paid' });
    if (l.settled) {
      const exp = expected(l);
      if (exp != null && num(l.paid) < exp) out.push({ level: 'red', text: `Paid ${money(l.paid)}, deal says ${money(exp)}: short ${money(exp - num(l.paid))}` });
    }
    return out;
  }

  function showDayLine(l) {
    const bits = [];
    if (l.loadIn) bits.push(`Load-in ${time12(l.loadIn)}`);
    if (l.setTime) bits.push(`Set ${time12(l.setTime)}${num(l.setLength) ? ` (${num(l.setLength)} min)` : ''}`);
    let html = bits.length ? `<div class="sd-line">🕐 ${esc(bits.join(' · '))}</div>` : '';
    if (l.dayContact || l.dayPhone) {
      html += `<div class="sd-line">👤 ${esc(l.dayContact || 'Day-of contact')}${l.dayPhone ? ` · <a href="tel:${esc(l.dayPhone.replace(/[^\d+]/g, ''))}" onclick="event.stopPropagation()">${esc(l.dayPhone)}</a>` : ''}</div>`;
    }
    html += `<div class="sd-line">📍 <a href="${mapLink(l)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(l.address || 'Find on map')}</a></div>`;
    return html;
  }

  function settlementLine(l) {
    if (!l.settled) return '';
    const parts = [`Paid ${money(l.paid)}`];
    if (num(l.merch)) parts.push(`merch ${money(l.merch)}`);
    if (num(l.costs)) parts.push(`costs ${money(l.costs)}`);
    if (num(l.attendance)) parts.push(`${num(l.attendance)} people`);
    return `<div class="sd-line sd-settled">✅ Settled · ${esc(parts.join(' · '))} · <b>net ${money(net(l))}</b></div>`;
  }

  function issuesHtml(l) {
    return issues(l).map(i => `<div class="deal-flag deal-flag-${i.level}">${i.level === 'red' ? '🚩' : '⚠'} ${esc(i.text)}</div>`).join('');
  }

  function card(l) {
    return (isPlayed(l) ? settlementLine(l) : showDayLine(l)) + issuesHtml(l);
  }

  // Settled shows, grouped by artist as entered on the lead.
  function byArtist(leads) {
    const rows = {};
    leads.filter(l => l.status === 'booked' && l.settled).forEach(l => {
      const r = rows[l.artist || 'Both'] = rows[l.artist || 'Both'] || { shows: 0, paid: 0, merch: 0, costs: 0 };
      r.shows++; r.paid += num(l.paid); r.merch += num(l.merch); r.costs += num(l.costs);
    });
    return Object.entries(rows).map(([artist, r]) => ({ artist: artist === 'Both' ? 'Both artists' : artist, ...r, net: r.paid + r.merch - r.costs }));
  }

  function artistTable(leads) {
    const rows = byArtist(leads);
    if (!rows.length) return '';
    const total = rows.reduce((t, r) => ({ shows: t.shows + r.shows, paid: t.paid + r.paid, merch: t.merch + r.merch, costs: t.costs + r.costs, net: t.net + r.net }), { shows: 0, paid: 0, merch: 0, costs: 0, net: 0 });
    const label = name => SHORT[name] ? `<span class="sd-long">${esc(name)}</span><span class="sd-short">${SHORT[name]}</span>` : esc(name);
    const row = (name, r, cls = '') => `<tr class="${cls}"><td>${label(name)}</td><td>${r.shows}</td><td>${money(r.paid)}</td><td>${money(r.merch)}</td><td>${money(r.costs)}</td><td><b>${money(r.net)}</b></td></tr>`;
    return `<div class="sd-table-wrap"><table class="sd-table">
      <thead><tr><th>Artist</th><th>Shows</th><th>Paid</th><th>Merch</th><th>Costs</th><th>Net</th></tr></thead>
      <tbody>${rows.map(r => row(r.artist, r)).join('')}${rows.length > 1 ? row('Total', total, 'sd-total') : ''}</tbody></table></div>`;
  }

  // ---- form helpers: ids are prefix + '-sd-…' ----
  const FIELDS = {
    loadIn: 'sd-loadin', setTime: 'sd-settime', setLength: 'sd-setlength', dayContact: 'sd-contact', dayPhone: 'sd-phone',
    address: 'sd-address', sound: 'sd-sound', hospitality: 'sd-hospitality',
    paid: 'st-paid', doorNet: 'st-door', attendance: 'st-attendance', merch: 'st-merch', costs: 'st-costs', settleNotes: 'st-notes'
  };
  const NUMBERS = ['setLength', 'paid', 'doorNet', 'attendance', 'merch', 'costs'];

  function fill(prefix, l) {
    Object.entries(FIELDS).forEach(([k, id]) => { document.getElementById(`${prefix}-${id}`).value = l[k] ?? ''; });
    document.getElementById(`${prefix}-st-settled`).checked = !!l.settled;
    const booked = l.status === 'booked';
    const days = l.eventDate ? daysUntil(l.eventDate) : null;
    document.getElementById(`${prefix}-showday`).open = booked && (days == null || days >= 0) && (days == null || days <= 30 || !!l.loadIn);
    document.getElementById(`${prefix}-settle`).open = booked && days != null && days < 0;
    sync(prefix);
  }

  function read(prefix) {
    const out = {};
    Object.entries(FIELDS).forEach(([k, id]) => {
      const v = document.getElementById(`${prefix}-${id}`).value;
      if (NUMBERS.includes(k)) { const n = parseFloat(v); out[k] = Number.isFinite(n) ? n : ''; }
      else out[k] = v.trim();
    });
    out.settled = document.getElementById(`${prefix}-st-settled`).checked;
    return out;
  }

  // Show the expected pay next to "what we were paid", and live warnings.
  function sync(prefix) {
    const status = document.getElementById(`${prefix}-status`);
    const date = document.getElementById(`${prefix}-date`);
    const lead = { ...DFDeals.read(prefix), ...read(prefix), status: status ? status.value : '', eventDate: date ? date.value : '' };
    const exp = expected(lead);
    document.getElementById(`${prefix}-st-expected`).textContent = exp != null
      ? `The deal says ${money(exp)}.` : (lead.dealType === 'door' || lead.dealType === 'vs') ? 'Enter the door after expenses to check the door share.' : '';
    document.getElementById(`${prefix}-st-door`).closest('.field').style.display = (lead.dealType === 'door' || lead.dealType === 'vs') ? '' : 'none';
    document.getElementById(`${prefix}-st-net`).textContent = lead.settled || num(lead.paid) ? `Net for the night: ${money(net(lead))}` : '';
    document.getElementById(`${prefix}-sd-flags`).innerHTML = issuesHtml(lead);
  }

  function wire(prefix) {
    const ids = Object.values(FIELDS).concat('st-settled', 'status', 'date', 'deal-type', 'deal-guarantee', 'deal-door');
    ids.forEach(id => {
      const el = document.getElementById(`${prefix}-${id}`);
      if (el) ['input', 'change'].forEach(ev => el.addEventListener(ev, () => sync(prefix)));
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .sd-line{font-size:0.78rem;color:var(--gray-light,#c9c2ae);margin-top:4px}
    .sd-line a{color:var(--blue,#4a9eff);text-decoration:none}
    .sd-settled b{color:var(--cream,#e8dfc8);font-weight:500}
    .sd-hint{font-size:0.76rem;color:var(--gray,#9aa39c);margin-top:0.6rem}
    .sd-hint:empty{display:none}
    .sd-section-title{font-size:1rem;color:var(--cream,#e8dfc8);margin:1.5rem 0 0.6rem;font-weight:500}
    .sd-table-wrap{overflow-x:auto;background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);margin-bottom:1rem}
    .sd-table{width:100%;border-collapse:collapse;font-size:0.8rem}
    .sd-table th{text-align:left;font-weight:400;font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray,#9aa39c);padding:0.6rem 0.75rem;border-bottom:1px solid var(--border,rgba(255,255,255,0.08))}
    .sd-table td{padding:0.55rem 0.75rem;color:var(--gray-light,#c9c2ae);border-bottom:1px solid var(--border,rgba(255,255,255,0.08));white-space:nowrap}
    .sd-table tr:last-child td{border-bottom:none}
    .sd-table b{color:var(--cream,#e8dfc8);font-weight:500}
    .sd-total td{color:var(--cream,#e8dfc8)}
    .sd-short{display:none}
    @media (max-width:768px){.sd-long{display:none}.sd-short{display:inline}.sd-table td,.sd-table th{padding:0.5rem}}`;
  document.head.appendChild(style);

  window.DFShow = { isPlayed, expected, net, card, issues, artistTable, fill, read, sync, wire };
})();
