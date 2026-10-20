// ============================================================
//  DRAGON FARM CRM — SHOW CALENDAR
//
//  A venue lead with an event date is on the calendar:
//    status "booked"          → confirmed show
//    any other open status    → hold (date pencilled in, not confirmed)
//    status "passed"          → left off
//
//  A lead for "Both" artists (or an act no longer on the roster) counts
//  as the roster's act that night. A confirmed show plus anything else
//  on the same night for the same act is a double booking; two holds on one night are competing holds.
// ============================================================

(function () {
  const ARTISTS = ['Timothy Chance and Rasta Country'];
  const SHORT = { 'Timothy Chance and Rasta Country': 'TCRC' };
  const MAX_CHIPS = 3;
  const AGENDA_DAYS = 90;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parse(date) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function longDate(date) {
    return parse(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function artistsOf(lead) {
    return lead.artist === 'Both' || !ARTISTS.includes(lead.artist) ? ARTISTS : [lead.artist];
  }
  function isShow(lead) { return !!lead.eventDate && lead.status !== 'passed'; }
  function isConfirmed(lead) { return lead.status === 'booked'; }
  function overlaps(a, b) { return artistsOf(a).some(x => artistsOf(b).includes(x)); }

  // Other shows/holds that tie up the same act on the same night.
  function clashes(leads, lead) {
    if (!isShow(lead)) return [];
    return leads.filter(o => o.id !== lead.id && isShow(o) && o.eventDate === lead.eventDate && overlaps(o, lead));
  }

  // 'double' when a confirmed show is involved, 'holds' for competing holds.
  function clashKind(leads, lead) {
    const others = clashes(leads, lead);
    if (!others.length) return '';
    return isConfirmed(lead) || others.some(isConfirmed) ? 'double' : 'holds';
  }

  function clashWarning(leads, lead) {
    const others = clashes(leads, lead);
    if (!others.length) return '';
    const list = others.map(o => `• ${o.name} (${isConfirmed(o) ? 'confirmed' : 'hold'}, ${artistsOf(o).map(a => SHORT[a]).join(' + ')})`).join('\n');
    return `Heads up: ${longDate(lead.eventDate)} is already taken for this act:\n${list}\n\nSave anyway?`;
  }

  function visible(leads, artist) {
    return leads.filter(l => isShow(l) && (artist === 'all' || artistsOf(l).includes(artist)));
  }

  function chip(leads, l, open) {
    const kind = clashKind(leads, l);
    const cls = isConfirmed(l) ? 'cal-chip-booked' : 'cal-chip-hold';
    return `<div class="cal-chip ${cls}${kind === 'double' ? ' cal-chip-clash' : ''}" onclick="event.stopPropagation();${open}('${l.id}')" title="${esc(l.name)} · ${isConfirmed(l) ? 'Confirmed' : 'Hold'}">${kind ? '⚠ ' : ''}${esc(l.name)}</div>`;
  }

  function entryRow(leads, l, open) {
    const kind = clashKind(leads, l);
    return `<div class="cal-entry" onclick="${open}('${l.id}')">
      <span class="cal-dot ${isConfirmed(l) ? 'cal-dot-booked' : 'cal-dot-hold'}"></span>
      <div class="cal-entry-main">
        <div class="cal-entry-name">${esc(l.name)} <span class="cal-entry-tag">${isConfirmed(l) ? 'Confirmed' : 'Hold'}</span></div>
        <div class="cal-entry-sub">${esc(artistsOf(l).map(a => SHORT[a]).join(' + '))}${l.city ? ' · ' + esc(l.city) : ''}</div>
        ${kind === 'double' ? '<div class="cal-warn">⚠ Double-booked: this act has another show or hold that night</div>'
          : kind === 'holds' ? '<div class="cal-warn cal-warn-soft">Competing holds that night: confirm one, release the other</div>' : ''}
      </div>
    </div>`;
  }

  // state: { month: Date (any day in the month), artist: 'all' | name, selected: 'YYYY-MM-DD' | '' }
  // handlers: { open: fn name(id), add: fn name(date), select: fn name(date) }
  function render(els, leads, state, handlers) {
    const shows = visible(leads, state.artist);
    const byDate = {};
    shows.forEach(l => { (byDate[l.eventDate] = byDate[l.eventDate] || []).push(l); });
    Object.values(byDate).forEach(list => list.sort((a, b) => isConfirmed(b) - isConfirmed(a)));

    const first = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    els.title.textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const today = iso(new Date());
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    let html = '<div class="cal-head">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div>${d}</div>`).join('') + '</div><div class="cal-body">';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (i === 35 && d.getMonth() !== first.getMonth()) break;
      const key = iso(d);
      const list = byDate[key] || [];
      const clash = list.some(l => clashKind(leads, l) === 'double');
      const cls = ['cal-day',
        d.getMonth() !== first.getMonth() ? 'cal-out' : '',
        key === today ? 'cal-today' : '',
        key === state.selected ? 'cal-selected' : '',
        clash ? 'cal-day-clash' : ''].filter(Boolean).join(' ');
      html += `<div class="${cls}" onclick="${handlers.select}('${key}')">
        <div class="cal-num">${d.getDate()}</div>
        <div class="cal-chips">${list.slice(0, MAX_CHIPS).map(l => chip(leads, l, handlers.open)).join('')}${list.length > MAX_CHIPS ? `<div class="cal-more">+${list.length - MAX_CHIPS} more</div>` : ''}</div>
        <div class="cal-dots">${list.map(l => `<span class="cal-dot ${isConfirmed(l) ? 'cal-dot-booked' : 'cal-dot-hold'}"></span>`).join('')}</div>
      </div>`;
    }
    els.grid.innerHTML = html + '</div>';

    if (state.selected) {
      const list = byDate[state.selected] || [];
      els.day.innerHTML = `<div class="cal-section-title">${longDate(state.selected)}</div>
        <div class="cal-box">${list.length ? list.map(l => entryRow(leads, l, handlers.open)).join('') : '<div class="cal-empty">Nothing on this date.</div>'}
        <div class="cal-add"><button class="btn btn-ghost" onclick="${handlers.add}('${state.selected}')">+ Add a hold on this date</button></div></div>`;
    } else {
      els.day.innerHTML = '';
    }

    const end = new Date();
    end.setDate(end.getDate() + AGENDA_DAYS);
    const upcoming = shows.filter(l => l.eventDate >= today && l.eventDate <= iso(end)).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    let agenda = `<div class="cal-section-title">Coming up <span>next ${AGENDA_DAYS} days</span></div><div class="cal-box">`;
    if (!upcoming.length) {
      agenda += '<div class="cal-empty">No holds or shows in the next 90 days. Add an event date to a lead to put it on the calendar.</div>';
    } else {
      let last = '';
      upcoming.forEach(l => {
        if (l.eventDate !== last) { agenda += `<div class="cal-agenda-date">${longDate(l.eventDate)}</div>`; last = l.eventDate; }
        agenda += entryRow(leads, l, handlers.open);
      });
    }
    const undated = leads.filter(l => isConfirmed(l) && !l.eventDate && (state.artist === 'all' || artistsOf(l).includes(state.artist)));
    if (undated.length) {
      agenda += `<div class="cal-agenda-date">Booked, no date yet</div>` + undated.map(l => `<div class="cal-entry" onclick="${handlers.open}('${l.id}')">
        <span class="cal-dot cal-dot-booked"></span><div class="cal-entry-main"><div class="cal-entry-name">${esc(l.name)}</div>
        <div class="cal-entry-sub">Add the event date so it shows on the calendar</div></div></div>`).join('');
    }
    els.agenda.innerHTML = agenda + '</div>';
  }

  const style = document.createElement('style');
  style.textContent = `
    .cal-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
    .cal-toolbar h2{margin:0}
    .cal-nav{display:flex;gap:6px}
    .cal-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:0.75rem}
    .cal-filter{background:transparent;border:1px solid var(--border2,rgba(255,255,255,0.14));color:var(--gray-light,#c9c2ae);border-radius:999px;padding:5px 12px;font-size:0.78rem;cursor:pointer}
    .cal-filter.on{background:rgba(42,180,100,0.15);border-color:var(--green,#2ab464);color:var(--cream,#e8dfc8)}
    .cal-legend{display:flex;gap:1rem;flex-wrap:wrap;font-size:0.75rem;color:var(--gray,#9aa39c);margin-bottom:0.75rem}
    .cal-legend span{display:inline-flex;align-items:center;gap:5px}
    .cal-head,.cal-body{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
    .cal-head div{font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray,#9aa39c);padding:0 6px 6px}
    .cal-body{border-top:1px solid var(--border,rgba(255,255,255,0.08));border-left:1px solid var(--border,rgba(255,255,255,0.08))}
    .cal-day{min-height:92px;padding:5px;border-right:1px solid var(--border,rgba(255,255,255,0.08));border-bottom:1px solid var(--border,rgba(255,255,255,0.08));cursor:pointer;background:var(--card,#131c1e);min-width:0}
    .cal-day:hover{background:var(--card2,#18231f)}
    .cal-out{opacity:0.45}
    .cal-num{font-size:0.75rem;color:var(--gray-light,#c9c2ae);margin-bottom:3px}
    .cal-today .cal-num{display:inline-block;background:var(--green,#2ab464);color:#06110b;border-radius:999px;padding:0 6px;font-weight:600}
    .cal-selected{outline:2px solid var(--gold,#c8922a);outline-offset:-2px}
    .cal-day-clash{box-shadow:inset 0 0 0 2px rgba(224,82,82,0.6)}
    .cal-chip{font-size:0.68rem;line-height:1.3;padding:2px 5px;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cal-chip-booked{background:rgba(42,180,100,0.22);color:#7be3a6;border:1px solid rgba(42,180,100,0.45)}
    .cal-chip-hold{background:rgba(200,146,42,0.14);color:#f0c060;border:1px dashed rgba(200,146,42,0.5)}
    .cal-chip-clash{border-color:rgba(224,82,82,0.8);color:#ff8a80}
    .cal-more{font-size:0.66rem;color:var(--gray,#9aa39c)}
    .cal-dots{display:none;gap:3px;flex-wrap:wrap}
    .cal-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .cal-dot-booked{background:#36d678}
    .cal-dot-hold{background:transparent;border:2px solid #f0c060;width:8px;height:8px;box-sizing:border-box}
    .cal-section-title{font-size:0.95rem;color:var(--cream,#e8dfc8);margin:1.5rem 0 0.6rem;font-weight:500}
    .cal-section-title span{font-size:0.75rem;color:var(--gray,#9aa39c);font-weight:400;margin-left:6px}
    .cal-box{background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);overflow:hidden}
    .cal-agenda-date{font-size:0.7rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray,#9aa39c);padding:0.6rem 1rem 0.2rem}
    .cal-entry{display:flex;gap:0.7rem;align-items:flex-start;padding:0.6rem 1rem;border-bottom:1px solid var(--border,rgba(255,255,255,0.08));cursor:pointer}
    .cal-entry:last-child{border-bottom:none}
    .cal-entry .cal-dot{margin-top:5px}
    .cal-entry-main{min-width:0}
    .cal-entry-name{font-size:0.88rem;color:var(--cream,#e8dfc8);font-weight:500}
    .cal-entry-tag{font-size:0.65rem;color:var(--gray,#9aa39c);font-weight:400;margin-left:4px}
    .cal-entry-sub{font-size:0.75rem;color:var(--gray,#9aa39c);margin-top:1px}
    .cal-warn{font-size:0.74rem;color:#ff8a80;margin-top:3px}
    .cal-warn-soft{color:#f0c060}
    .cal-empty{padding:0.9rem 1rem;font-size:0.85rem;color:var(--gray,#9aa39c)}
    .cal-add{padding:0.6rem 1rem;border-top:1px solid var(--border,rgba(255,255,255,0.08))}
    @media (max-width:768px){
      .cal-day{min-height:52px;padding:4px}
      .cal-chips{display:none}
      .cal-dots{display:flex}
      .cal-head div{padding:0 2px 4px;text-align:center}
    }`;
  document.head.appendChild(style);

  window.DFCalendar = { artistsOf, clashes, clashKind, clashWarning, render };
})();
