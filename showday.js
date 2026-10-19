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
  const SHORT = { 'Timothy Chance and Rasta Country': 'TCRC' };

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

  // Booked Shows: totals, then Upcoming and Played lists. `open` is the
  // page's global function name that opens a lead for editing; `actions`
  // optionally names the page's functions for { gaps, invoice, remind }.
  function renderShows(els, leads, open, actions) {
    const booked = leads.filter(l => l.status === 'booked')
      .sort((a, b) => (a.eventDate || '9999').localeCompare(b.eventDate || '9999'));
    const upcoming = booked.filter(l => !isPlayed(l));
    const played = booked.filter(isPlayed).reverse();
    const t = DFDeals.totals(leads);
    const settled = played.filter(l => l.settled);
    els.totals.innerHTML = booked.length ? `
      <div class="deal-total"><b>${t.shows}</b><span>upcoming booked shows</span></div>
      <div class="deal-total"><b>${money(t.guaranteed)}</b><span>guaranteed</span></div>
      <div class="deal-total"><b>${money(t.depositsOwed)}</b><span>deposits still owed to us</span></div>
      <div class="deal-total"><b style="color:${t.unsigned ? '#ff8a80' : 'var(--cream)'}">${t.unsigned}</b><span>without a signed contract</span></div>
      <div class="deal-total"><b>${money(settled.reduce((s, l) => s + net(l), 0))}</b><span>net from ${settled.length} settled show${settled.length === 1 ? '' : 's'}</span></div>
      <div class="deal-total"><b style="color:${played.length - settled.length ? '#ff8a80' : 'var(--cream)'}">${played.length - settled.length}</b><span>played, not settled</span></div>` : '';
    if (!booked.length) {
      els.list.innerHTML = '<div class="sd-empty">🎤 No confirmed shows yet. Mark a lead "Booked" to see it here.</div>';
      return;
    }
    const box = list => `<div class="sd-box">${list.map(l => showCard(l, open, actions)).join('')}</div>`;
    els.list.innerHTML =
      '<div class="sd-section-title">Upcoming</div>' +
      (upcoming.length ? box(upcoming) : '<div class="sd-empty">No upcoming shows.</div>') +
      (played.length ? `<div class="sd-section-title">Played</div>${artistTable(leads)}${box(played)}` : '');
  }

  function depositOverdue(l) {
    return !!(num(l.deposit) && !l.depositPaid && l.depositDue && l.depositDue < today());
  }

  function actionButtons(l, actions) {
    if (!actions) return '';
    const btn = (fn, label, title) => fn ? `<button class="btn btn-ghost" title="${title}" onclick="event.stopPropagation();${fn}('${l.id}')">${label}</button>` : '';
    const buttons = [
      !isPlayed(l) && l.eventDate && btn(actions.gaps, '🗺 Fill nearby dates', 'Find shows within a few hours’ drive on the open days around this one'),
      btn(actions.invoice, '🧾 Invoice', 'Make, print or email an invoice'),
      depositOverdue(l) && btn(actions.remind, '⏰ Deposit reminder', 'Email a polite reminder about the overdue deposit')
    ].filter(Boolean);
    return buttons.length ? `<div class="dfo-show-actions">${buttons.join('')}</div>` : '';
  }

  function showCard(l, open, actions) {
    return `
      <div class="sd-card" onclick="${open}('${l.id}')">
        <div class="sd-card-main">
          <div class="sd-card-icon">🎤</div>
          <div style="min-width:0">
            <div class="sd-card-name">${esc(l.name)}</div>
            <div class="sd-card-sub">${esc([l.city, l.type, l.artist].filter(Boolean).join(' · '))}</div>
            ${l.eventDate ? `<div class="sd-card-date">📅 ${l.eventDate}</div>` : '<div class="sd-card-nodate">📅 No show date yet</div>'}
            ${DFDeals.card(l)}
            ${card(l)}
            ${window.DFOut ? DFOut.badges(l) : ''}
            ${actionButtons(l, actions)}
          </div>
        </div>
        <div class="sd-card-contact">
          ${l.contactName ? `<div>${esc(l.contactName)}</div>` : ''}
          ${l.contactEmail ? `<a href="mailto:${esc(l.contactEmail)}" onclick="event.stopPropagation()">${esc(l.contactEmail)}</a>` : ''}
        </div>
      </div>`;
  }

  // ---- form helpers: ids are prefix + '-sd-…' ----

  // The "Show day" and "Settlement" sections of a lead form, for the page to insert.
  function formHtml(p) {
    return `
    <details class="deal-box" id="${p}-showday">
      <summary>Show day</summary>
      <div class="deal-grid">
        <div class="field"><label>Load-in</label><input type="time" id="${p}-sd-loadin" /></div>
        <div class="field"><label>Set Time</label><input type="time" id="${p}-sd-settime" /></div>
        <div class="field"><label>Set Length (minutes)</label><input type="number" min="0" step="5" inputmode="numeric" id="${p}-sd-setlength" placeholder="45" /></div>
        <div class="field"><label>Day-of Contact</label><input type="text" id="${p}-sd-contact" placeholder="Production manager" /></div>
        <div class="field"><label>Their Phone</label><input type="tel" id="${p}-sd-phone" placeholder="(615) 555-0100" /></div>
        <div class="field"><label>Venue Address</label><input type="text" id="${p}-sd-address" placeholder="1234 Main St, Nashville, TN" /></div>
        <div class="field"><label>Sound &amp; Backline</label><input type="text" id="${p}-sd-sound" placeholder="House PA and engineer; we bring amps" /></div>
        <div class="field"><label>Hospitality</label><input type="text" id="${p}-sd-hospitality" placeholder="Green room, 4 drink tickets, meal buyout" /></div>
      </div>
    </details>
    <details class="deal-box" id="${p}-settle">
      <summary>Settlement (after the show)</summary>
      <div class="deal-grid">
        <div class="field"><label>What We Were Paid ($)</label><input type="number" min="0" step="any" inputmode="decimal" id="${p}-st-paid" placeholder="500" /></div>
        <div class="field"><label>Door After Venue Expenses ($)</label><input type="number" min="0" step="any" inputmode="decimal" id="${p}-st-door" placeholder="900" /></div>
        <div class="field"><label>Attendance</label><input type="number" min="0" step="1" inputmode="numeric" id="${p}-st-attendance" placeholder="120" /></div>
        <div class="field"><label>Merch Sales ($)</label><input type="number" min="0" step="any" inputmode="decimal" id="${p}-st-merch" placeholder="300" /></div>
        <div class="field"><label>Our Costs ($)</label><input type="number" min="0" step="any" inputmode="decimal" id="${p}-st-costs" placeholder="Gas, hotel, crew" /></div>
        <div class="field"><label>Settlement Notes</label><input type="text" id="${p}-st-notes" placeholder="Paid cash night of" /></div>
      </div>
      <label class="deal-check" style="margin-top:0.75rem"><input type="checkbox" id="${p}-st-settled" /> Settled: the payout for this show is recorded</label>
      <div class="sd-hint" id="${p}-st-expected"></div>
      <div class="sd-hint" id="${p}-st-net"></div>
    </details>
    <div id="${p}-sd-flags"></div>`;
  }

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
    .sd-box{background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);overflow:hidden}
    .sd-empty{padding:0.9rem 1rem;font-size:0.85rem;color:var(--gray,#9aa39c)}
    .sd-card{padding:1rem 1.25rem;border-bottom:1px solid var(--border,rgba(255,255,255,0.08));display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;cursor:pointer}
    .sd-card:last-child{border-bottom:none}
    .sd-card-main{display:flex;align-items:flex-start;gap:1rem;min-width:0;flex:1 1 260px}
    .sd-card-icon{font-size:2rem}
    .sd-card-name{font-weight:500;color:var(--cream,#e8dfc8);font-size:0.95rem}
    .sd-card-sub{font-size:0.8rem;color:var(--gray,#9aa39c)}
    .sd-card-date{font-family:var(--font-m,monospace);font-size:0.7rem;color:var(--green,#2ab464);margin-top:3px}
    .sd-card-nodate{font-size:0.74rem;color:#f0c060;margin-top:3px}
    .sd-card-contact{text-align:right;font-size:0.82rem;color:var(--gray-light,#c9c2ae)}
    .sd-card-contact a{font-size:0.78rem;color:var(--blue,#4a9eff);text-decoration:none}
    .sd-short{display:none}
    @media (max-width:768px){.sd-long{display:none}.sd-short{display:inline}.sd-table td,.sd-table th{padding:0.5rem}}`;
  document.head.appendChild(style);

  window.DFShow = { isPlayed, expected, net, card, issues, artistTable, renderShows, formHtml, fill, read, sync, wire };
})();
