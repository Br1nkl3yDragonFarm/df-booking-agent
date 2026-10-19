// ============================================================
//  DRAGON FARM CRM — WHAT'S WORKING
//
//  Turns the two pipelines and their activity (emails sent, replies, press
//  kit opens) into answers: which kinds of leads and which towns turn into
//  shows or placements, what they pay on average, and which pitches get
//  replies. Uses only what's recorded; nothing is estimated.
//
//    pitched  status past "new", a logged touch, or an email sent
//    replied  a reply caught, or a status that means they answered
//    won      booked (venue) or licensed (sync)
//    pay      venue: what we were paid once settled, else what the deal
//             says; sync: the fee when it's a dollar amount
//
//  Usage: DFReport.build(venueLeads, syncLeads, DFOut.activity) -> report
//         DFReport.html(report) -> markup
// ============================================================

(function () {
  const ANSWERED = { venue: ['interested', 'booked'], sync: ['reviewing', 'licensed'] };
  const WON = { venue: 'booked', sync: 'licensed' };
  const MIN_FOR_ADVICE = 3; // pitched leads a group needs before we call it a pattern

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
    const s = best(r.sync.byCategory, winRate);
    if (s) tips.push(`In sync, <b>${esc(s.key)}</b> pitches land best: ${s.won} of ${s.pitched} licensed.`);
    return tips;
  }

  function build(venueLeads, syncLeads, activityOf) {
    const v = (venueLeads || []).map(l => facts(l, 'venue', activityOf));
    const s = (syncLeads || []).map(l => facts(l, 'sync', activityOf));
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
      pitches: pitches([...v, ...s])
    };
    report.advice = advice(report);
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
        `<li><span>“${esc(w.subject || '(no subject)')}”</span><small>${esc(w.name)} · ${w.list === 'sync' ? 'sync' : 'booking'} · email #${w.number}</small></li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function html(r) {
    const vPitched = r.venue.rows.filter(x => x.pitched).length;
    const sPitched = r.sync.rows.filter(x => x.pitched).length;
    const early = vPitched + sPitched < 10
      ? `<p class="rp-note">Early days: ${vPitched + sPitched} lead${vPitched + sPitched === 1 ? '' : 's'} pitched so far. The patterns get more reliable with every pitch you log.</p>` : '';
    return `${early}
      <section class="rp-block rp-advice"><h2>Where the money is</h2>${r.advice.length
        ? `<ul>${r.advice.map(t => `<li>${t}</li>`).join('')}</ul>`
        : `<p class="rp-empty">Not enough results yet to call a pattern. Each kind of lead or town needs at least ${MIN_FOR_ADVICE} pitches before it shows up here.</p>`}</section>
      ${table('Booking: by kind of lead', 'Kind', r.venue.byType, 'Booked', 'Avg pay')}
      ${table('Booking: by town', 'Town', r.venue.byTown, 'Booked', 'Avg pay')}
      ${table('Booking: where the lead came from', 'Source', r.venue.byOrigin, 'Booked', 'Avg pay')}
      ${pitchHtml(r.pitches)}
      ${table('Sync: by kind of placement', 'Kind', r.sync.byCategory, 'Licensed', 'Avg fee')}
      ${table('Sync: where the lead came from', 'Source', r.sync.byOrigin, 'Licensed', 'Avg fee')}`;
  }

  window.DFReport = { build, html, town };
})();
