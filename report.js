// ============================================================
//  DRAGON FARM CRM — WHAT'S WORKING
//
//  Turns the pipelines (booking, sync, brand deals) and their activity (emails sent, replies, press
//  kit opens) into answers: which kinds of leads and which towns turn into
//  shows or placements, what they pay on average, and which pitches get
//  replies. Uses only what's recorded; nothing is estimated.
//
//    pitched  status past "new", a logged touch, or an email sent
//    replied  a reply caught, or a status that means they answered
//    won      booked (venue), licensed (sync) or signed (brand)
//    pay      venue: what we were paid once settled, else what the deal
//             says; sync: the fee when it's a dollar amount; brand: the
//             first dollar amount in the offer
//
//  Usage: DFReport.build(venueLeads, syncLeads, DFOut.activity, brandLeads, fans) -> report
//         DFReport.html(report) -> markup
// ============================================================

(function () {
  const ANSWERED = { venue: ['interested', 'booked'], sync: ['reviewing', 'licensed'], brand: ['talking', 'signed'] };
  const WON = { venue: 'booked', sync: 'licensed', brand: 'signed' };
  const MIN_FOR_ADVICE = 3; // pitched leads a group needs before we call it a pattern
  const FANS_FOR_ADVICE = 25; // fans in a town worth bringing up when asking for more money

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const num = v => Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0;
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';

  // "nashville, tn " and "Nashville, TN" are one town.
  function town(city) {
    const c = String(city || '').trim().replace(/\s+/g, ' ');
    if (!c) return 'No town set';
    return c.split(', ').map((part, i) => i > 0 && part.length === 2 ? part.toUpperCase()
      : part.replace(/\b\w/g, ch => ch.toUpperCase())).join(', ');
  }

  function origin(l) {
    if (l.inquiry) return 'Came to us (website form)';
    if (l.auto) return 'Weekly automatic search';
    if (/^https?:\/\//.test(l.source || '')) return 'Found with the finder';
    return 'Added by hand';
  }

  function pay(l, list) {
    if (list === 'sync') return num(l.fee) || null;
    if (list === 'brand') { const m = String(l.offer || '').match(/\$\s?([\d,]+(?:\.\d+)?)/); return m ? num(m[1]) : null; }
    if (l.settled && num(l.paid)) return num(l.paid);
    return window.DFShow ? DFShow.expected(l) : (num(l.guarantee) || null);
  }

  function facts(l, list, activityOf) {
    const a = activityOf(l) || {};
    const sent = (a.sent || []).slice().sort((x, y) => x.at.localeCompare(y.at));
    const replies = (a.replies || []).slice().sort((x, y) => x.at.localeCompare(y.at));
    const won = l.status === WON[list];
    return {
      lead: l, list, sent, replies, opened: !!(a.views && a.views.count), won,
      pitched: l.status !== 'new' || num(l.touches) > 0 || sent.length > 0,
      replied: replies.length > 0 || ANSWERED[list].includes(l.status),
      pay: won ? pay(l, list) : null
    };
  }

  function group(rows, keyOf) {
    const groups = new Map();
    rows.forEach(r => {
      const key = keyOf(r.lead);
      const g = groups.get(key) || { key, leads: 0, pitched: 0, replied: 0, won: 0, paid: [] };
      g.leads++;
      if (r.pitched) g.pitched++;
      if (r.replied) g.replied++;
      if (r.won) g.won++;
      if (r.pay) g.paid.push(r.pay);
      groups.set(key, g);
    });
    return [...groups.values()].map(g => ({
      ...g,
      avgPay: g.paid.length ? g.paid.reduce((s, v) => s + v, 0) / g.paid.length : null
    })).sort((a, b) => b.won - a.won || b.pitched - a.pitched || b.leads - a.leads || a.key.localeCompare(b.key));
  }

  // Which email in the sequence got the answer, and the subject that did it.
  function pitches(rows) {
    const after = { 1: 0, 2: 0, 3: 0 };
    let emailed = 0, noReply = 0;
    const winners = [];
    const kit = { opened: 0, openedReplied: 0, notOpened: 0, notOpenedReplied: 0 };
    rows.forEach(r => {
      if (!r.sent.length) return;
      emailed++;
      const reply = r.replies.find(x => x.at > r.sent[0].at);
      if (r.opened) { kit.opened++; if (reply) kit.openedReplied++; }
      else { kit.notOpened++; if (reply) kit.notOpenedReplied++; }
      if (!reply) { noReply++; return; }
      const before = r.sent.filter(s => s.at < reply.at);
      after[Math.min(before.length, 3)]++;
      const last = before[before.length - 1];
      winners.push({ name: r.lead.name, list: r.list, subject: last.subject || '', number: before.length, at: reply.at });
    });
    winners.sort((a, b) => b.at.localeCompare(a.at));
    return { emailed, noReply, after, winners, kit };
  }

  // Plain-English pointers, only from groups with enough pitches behind them.
  function advice(r) {
    const tips = [];
    const solid = rows => rows.filter(g => g.pitched >= MIN_FOR_ADVICE && g.key !== 'No town set');
    const best = (rows, by) => solid(rows).filter(g => by(g) > 0).sort((a, b) => by(b) - by(a))[0];
    const winRate = g => g.won / g.pitched;
    const t = best(r.venue.byType, winRate);
    if (t) tips.push(`<b>${esc(t.key)}</b> leads book best: ${t.won} of ${t.pitched} pitched (${pct(t.won, t.pitched)}).`);
    const c = best(r.venue.byTown, winRate);
    if (c) tips.push(`<b>${esc(c.key)}</b> is your best town: ${c.won} of ${c.pitched} pitched booked.`);
    const p = solid(r.venue.byType).filter(g => g.avgPay).sort((a, b) => b.avgPay - a.avgPay)[0];
    if (p && p.paid.length >= 2) tips.push(`<b>${esc(p.key)}</b> pays the most on average: ${money(p.avgPay)} a show.`);
    const dead = solid(r.venue.byType).filter(g => g.pitched >= 5 && !g.replied);
    dead.forEach(g => tips.push(`<b>${esc(g.key)}</b>: ${g.pitched} pitched and no replies yet. Try a different angle or spend that time elsewhere.`));
    const { after, emailed, noReply } = r.pitches;
    const later = after[2] + after[3];
    if (emailed >= 5 && later > 0) tips.push(`${later} of your replies came after a follow-up, not the first email. Keep sending follow-ups.`);
    if (emailed >= 5 && noReply / emailed > 0.8) tips.push(`${noReply} of ${emailed} emailed leads haven’t replied. Check that you’re reaching the actual talent buyer, not a general inbox.`);
    const crowd = (r.fans || []).filter(f => f.fans >= FANS_FOR_ADVICE && f.key !== 'No town set')[0];
    if (crowd) tips.push(`<b>${esc(crowd.key)}</b>: ${crowd.fans} fans on your list. Use that number when you ask for a bigger guarantee there.`);
    const s = best(r.sync.byCategory, winRate);
    if (s) tips.push(`In sync, <b>${esc(s.key)}</b> pitches land best: ${s.won} of ${s.pitched} licensed.`);
    return tips;
  }

  // Fans on the list per town, beside the shows booked there and what they paid.
  function fanTowns(fans, venueRows) {
    const counts = new Map();
    (fans || []).forEach(f => { const t = town(f.city); counts.set(t, (counts.get(t) || 0) + 1); });
    return [...counts.entries()].map(([key, count]) => {
      const shows = venueRows.filter(r => r.won && town(r.lead.city) === key);
      const paid = shows.map(r => r.pay).filter(Boolean);
      return { key, fans: count, shows: shows.length, avgPay: paid.length ? paid.reduce((s, v) => s + v, 0) / paid.length : null };
    }).sort((a, b) => b.fans - a.fans || a.key.localeCompare(b.key));
  }

  function build(venueLeads, syncLeads, activityOf, brandLeads, fans) {
    const v = (venueLeads || []).map(l => facts(l, 'venue', activityOf));
    const s = (syncLeads || []).map(l => facts(l, 'sync', activityOf));
    const b = (brandLeads || []).map(l => facts(l, 'brand', activityOf));
    const report = {
      venue: {
        rows: v,
        byType: group(v, l => l.type || 'Other'),
        byTown: group(v, l => town(l.city)),
        byOrigin: group(v, origin)
      },
      sync: {
        rows: s,
        byCategory: group(s, l => l.category || 'Other'),
        byOrigin: group(s, origin)
      },
      brand: { rows: b, byCategory: group(b, l => l.category || 'Other') },
      pitches: pitches([...v, ...s, ...b]),
      fans: fanTowns(fans, v)
    };
    report.advice = advice(report);
    report.trends = trends([...v, ...s, ...b], v);
    return report;
  }

  // ---- markup ----
  function table(title, keyLabel, rows, wonLabel, payLabel) {
    if (!rows.length) return '';
    return `<section class="rp-block"><h2>${esc(title)}</h2><div class="rp-scroll"><table class="rp-table">
      <thead><tr><th>${esc(keyLabel)}</th><th>Leads</th><th>Pitched</th><th>Replied</th><th>${esc(wonLabel)}</th><th>Win rate</th><th>${esc(payLabel)}</th></tr></thead>
      <tbody>${rows.map(g => `<tr><td>${esc(g.key)}</td><td>${g.leads}</td><td>${g.pitched}</td><td>${g.replied} <small>${pct(g.replied, g.pitched)}</small></td><td><b>${g.won}</b></td><td>${pct(g.won, g.pitched)}</td><td>${g.avgPay ? money(g.avgPay) : '—'}</td></tr>`).join('')}</tbody>
    </table></div></section>`;
  }

  function pitchHtml(p) {
    if (!p.emailed) return `<section class="rp-block"><h2>Which pitches get replies</h2><p class="rp-empty">No emails sent from the tool yet. Once pitches go out with “Review and send”, this shows which email in the sequence gets answered and which subject lines work.</p></section>`;
    const replied = p.emailed - p.noReply;
    return `<section class="rp-block"><h2>Which pitches get replies</h2>
      <div class="rp-stats">
        <div><b>${p.emailed}</b><span>leads emailed</span></div>
        <div><b>${replied}</b><span>replied (${pct(replied, p.emailed)})</span></div>
        <div><b>${p.after[1]}</b><span>answered the 1st email</span></div>
        <div><b>${p.after[2]}</b><span>answered the 2nd</span></div>
        <div><b>${p.after[3]}</b><span>answered the 3rd or later</span></div>
      </div>
      ${p.kit.opened ? `<p class="rp-note">Leads who opened the press kit replied ${pct(p.kit.openedReplied, p.kit.opened)} of the time (${p.kit.openedReplied} of ${p.kit.opened}); the rest ${pct(p.kit.notOpenedReplied, p.kit.notOpened)}.</p>` : ''}
      ${p.winners.length ? `<h3>Emails that got an answer</h3><ul class="rp-list">${p.winners.slice(0, 12).map(w =>
        `<li><span>“${esc(w.subject || '(no subject)')}”</span><small>${esc(w.name)} · ${{ venue: 'booking', sync: 'sync', brand: 'brand' }[w.list]} · email #${w.number}</small></li>`).join('')}</ul>` : ''}
    </section>`;
  }

  // ---- trends over time (drawn with Chart.js, vendor/chart.js) ----
  const WEEKS = 12, MONTHS_BACK = 5, MONTHS_AHEAD = 6;
  const pad = n => String(n).padStart(2, '0');
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function monday(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

  // Emails sent and replies per week (last 12 weeks, Monday to Sunday), and
  // show money per month: paid once settled, otherwise what the deal says.
  function trends(rows, venueRows) {
    const start = monday(new Date()); start.setDate(start.getDate() - 7 * (WEEKS - 1));
    const weeks = Array.from({ length: WEEKS }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + 7 * i); return { start: isoDay(d), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sent: 0, replies: 0 }; });
    const weekOf = iso => { if (!iso) return null; const k = isoDay(monday(new Date(iso))); return weeks.find(w => w.start === k) || null; };
    rows.forEach(r => {
      r.sent.forEach(s => { const w = weekOf(s.at); if (w) w.sent++; });
      r.replies.forEach(x => { const w = weekOf(x.at); if (w) w.replies++; });
    });
    const now = new Date();
    const months = Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK + i, 1);
      return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), paid: 0, booked: 0, shows: 0 };
    });
    venueRows.forEach(r => {
      const l = r.lead;
      if (l.status !== 'booked' || !l.eventDate) return;
      const m = months.find(x => x.key === l.eventDate.slice(0, 7));
      if (!m) return;
      m.shows++;
      if (l.settled && num(l.paid)) m.paid += num(l.paid);
      else m.booked += pay(l, 'venue') || 0;
    });
    return { weeks, months, hasEmail: weeks.some(w => w.sent || w.replies), hasShows: months.some(m => m.shows) };
  }

  // The two chart sections; charts(r, el) draws them once the markup is in the page.
  function trendsHtml(t) {
    const numbers = (head, rows) => `<details class="rp-numbers"><summary>Show the numbers</summary><div class="rp-scroll"><table class="rp-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    return (t.hasEmail ? `<section class="rp-block"><h2>Emails sent and replies, by week</h2><div class="rp-chart"><canvas id="rp-chart-email" role="img" aria-label="Line chart of emails sent and replies per week for the last 12 weeks"></canvas></div>${numbers(['Week of', 'Emails sent', 'Replies'], t.weeks.map(w => [w.label, w.sent, w.replies]))}</section>` : '')
      + (t.hasShows ? `<section class="rp-block"><h2>Show money by month</h2><p class="rp-note" style="margin:0 0 0.5rem">Paid is what settled shows actually paid; booked is what the deals say for shows not settled yet.</p><div class="rp-chart"><canvas id="rp-chart-money" role="img" aria-label="Stacked bar chart of show money per month, paid and booked"></canvas></div>${numbers(['Month', 'Shows', 'Paid', 'Booked'], t.months.map(m => [m.label, m.shows, money(m.paid), money(m.booked)]))}</section>` : '');
  }

  // Dark-surface steps of the reference categorical palette (validated against #131c1e).
  const SERIES = ['#3987e5', '#d95926'];
  const INK = { text: '#c9c2ae', muted: '#9aa39c', grid: 'rgba(255,255,255,0.07)', surface: '#131c1e' };
  let drawn = [];
  function charts(r, root) {
    drawn.forEach(c => c.destroy()); drawn = [];
    if (!window.Chart) return;
    const base = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'start', labels: { color: INK.text, boxWidth: 12, boxHeight: 12, usePointStyle: true } },
        tooltip: { backgroundColor: '#0e1517', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, titleColor: '#e8dfc8', bodyColor: INK.text, padding: 10 } },
      scales: { x: { grid: { display: false }, ticks: { color: INK.muted }, border: { color: INK.grid } },
        y: { beginAtZero: true, grid: { color: INK.grid }, border: { display: false }, ticks: { color: INK.muted, precision: 0 } } }
    };
    const email = root.querySelector('#rp-chart-email');
    if (email) drawn.push(new Chart(email, { type: 'line', data: { labels: r.trends.weeks.map(w => w.label), datasets: [
      { label: 'Emails sent', data: r.trends.weeks.map(w => w.sent), borderColor: SERIES[0], backgroundColor: SERIES[0], borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: INK.surface, pointBorderWidth: 2, tension: 0 },
      { label: 'Replies', data: r.trends.weeks.map(w => w.replies), borderColor: SERIES[1], backgroundColor: SERIES[1], borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: INK.surface, pointBorderWidth: 2, pointStyle: 'rectRot', tension: 0 }
    ] }, options: base }));
    const cash = root.querySelector('#rp-chart-money');
    if (cash) drawn.push(new Chart(cash, { type: 'bar', data: { labels: r.trends.months.map(m => m.label), datasets: [
      { label: 'Paid', data: r.trends.months.map(m => m.paid), backgroundColor: SERIES[0], borderColor: INK.surface, borderWidth: { top: 2 }, borderRadius: 0, maxBarThickness: 32, stack: 'm' },
      { label: 'Booked', data: r.trends.months.map(m => m.booked), backgroundColor: SERIES[1], borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 32, stack: 'm' }
    ] }, options: { ...base,
      plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}`, footer: items => { const m = r.trends.months[items[0].dataIndex]; return `${m.shows} show${m.shows === 1 ? '' : 's'}`; } } } },
      scales: { x: { ...base.scales.x, stacked: true }, y: { ...base.scales.y, stacked: true, ticks: { color: INK.muted, callback: v => money(v) } } } } }));
  }

  function html(r) {
    const pitched = [...r.venue.rows, ...r.sync.rows, ...r.brand.rows].filter(x => x.pitched).length;
    const early = pitched < 10
      ? `<p class="rp-note">Early days: ${pitched} lead${pitched === 1 ? '' : 's'} pitched so far. The patterns get more reliable with every pitch you log.</p>` : '';
    return `${early}
      <section class="rp-block rp-advice"><h2>Where the money is</h2>${r.advice.length
        ? `<ul>${r.advice.map(t => `<li>${t}</li>`).join('')}</ul>`
        : `<p class="rp-empty">Not enough results yet to call a pattern. Each kind of lead or town needs at least ${MIN_FOR_ADVICE} pitches before it shows up here.</p>`}</section>
      ${trendsHtml(r.trends)}
      ${table('Booking: by kind of lead', 'Kind', r.venue.byType, 'Booked', 'Avg pay')}
      ${table('Booking: by town', 'Town', r.venue.byTown, 'Booked', 'Avg pay')}
      ${table('Booking: where the lead came from', 'Source', r.venue.byOrigin, 'Booked', 'Avg pay')}
      ${pitchHtml(r.pitches)}
      ${table('Sync: by kind of placement', 'Kind', r.sync.byCategory, 'Licensed', 'Avg fee')}
      ${table('Sync: where the lead came from', 'Source', r.sync.byOrigin, 'Licensed', 'Avg fee')}
      ${table('Brand deals: by kind of brand', 'Kind', r.brand.byCategory, 'Signed', 'Avg fee')}
      ${r.fans.length ? `<section class="rp-block"><h2>Fans by town</h2><div class="rp-scroll"><table class="rp-table">
        <thead><tr><th>Town</th><th>Fans on the list</th><th>Shows booked there</th><th>Avg pay there</th></tr></thead>
        <tbody>${r.fans.map(f => `<tr><td>${esc(f.key)}</td><td><b>${f.fans}</b></td><td>${f.shows}</td><td>${f.avgPay ? money(f.avgPay) : '—'}</td></tr>`).join('')}</tbody>
      </table></div></section>` : ''}`;
  }

  window.DFReport = { build, html, charts, town };
})();
