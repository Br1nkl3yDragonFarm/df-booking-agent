// ============================================================
//  DRAGON FARM CRM — SHOWS IN YOUR CALENDAR
//
//  · "📅 Calendar" on a booked show: add it to Google, Outlook or Apple /
//    any calendar (.ics), with load-in, set time, address and contact.
//    Uses datebook (vendor/datebook.js).
//  · "Subscribe": one secret calendar link for everyone's phone that lists
//    every booked show and hold and keeps itself up to date
//    (netlify/functions/calendar-feed.mjs).
//
//  Needs outreach.js (DFOut) for the modal.
// ============================================================

(function () {
  const FEED = '/.netlify/functions/calendar-feed';
  const DEFAULT_SET = 90;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // "9 PM", "9:30pm", "21:00" -> [h, m] (same rule as netlify/lib/showtime.mjs)
  function parseTime(s) {
    const m = String(s || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (m[3]?.startsWith('p') && h < 12) h += 12;
    if (m[3]?.startsWith('a') && h === 12) h = 0;
    return h < 24 && min < 60 ? [h, min] : null;
  }

  function config(l) {
    const [y, mo, d] = l.eventDate.split('-').map(Number);
    const t = parseTime(l.setTime);
    const start = t ? new Date(y, mo - 1, d, t[0], t[1]) : new Date(y, mo - 1, d);
    const end = t ? new Date(start.getTime() + (Number(l.setLength) || DEFAULT_SET) * 60000) : new Date(y, mo - 1, d);
    const artist = l.artist && l.artist !== 'Both' ? l.artist : 'Timothy Chance and Rasta Country';
    return {
      title: `${artist} at ${l.name}`,
      location: l.address || [l.name, l.city].filter(Boolean).join(', '),
      description: [
        l.loadIn && `Load-in: ${l.loadIn}`, l.setTime && `Set: ${l.setTime}${l.setLength ? ` (${l.setLength} min)` : ''}`,
        (l.dayContact || l.dayPhone) && `Day-of contact: ${[l.dayContact, l.dayPhone].filter(Boolean).join(', ')}`,
        l.sound && `Sound: ${l.sound}`, l.hospitality && `Hospitality: ${l.hospitality}`
      ].filter(Boolean).join('\n'),
      start, end, allDay: !t
    };
  }

  function openAdd(l) {
    if (!l.eventDate) return;
    const c = config(l);
    const box = DFOut.show(`
      <div class="dfo-head"><h3>Add to calendar · ${esc(l.name)}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <p class="dfo-muted">${esc(c.title)}, ${esc(c.start.toLocaleString('en-US', c.allDay ? { dateStyle: 'full' } : { dateStyle: 'full', timeStyle: 'short' }))}${c.allDay ? ' (add a set time on the show for a timed event)' : ''}.</p>
        <div class="dfc-buttons">
          <a class="btn btn-ghost" target="_blank" rel="noopener" href="${esc(new datebook.GoogleCalendar(c).render())}">Google Calendar</a>
          <a class="btn btn-ghost" target="_blank" rel="noopener" href="${esc(new datebook.OutlookCalendar(c).render())}">Outlook</a>
          <button class="btn btn-ghost" data-a="ics">Apple / other (.ics)</button>
        </div>
        <p class="dfo-muted">To get every show on your phone automatically, use “Subscribe” on the Calendar page instead.</p>
      </div>`);
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);
    box.querySelector('[data-a="ics"]').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([new datebook.ICalendar(c).render()], { type: 'text/calendar' }));
      a.download = `${l.name.replace(/[^\w -]/g, '').trim() || 'show'} ${l.eventDate}.ics`;
      a.click();
    });
  }

  async function feedLink(action) {
    const go = () => fetch(FEED, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode() }, body: JSON.stringify({ action }) });
    let res = await go();
    if (res.status === 401 && DFStore.askPasscode()) res = await go();
    return res.ok ? res.json() : null;
  }

  async function openSubscribe() {
    const box = DFOut.show(`
      <div class="dfo-head"><h3>Shows on your phone</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body" data-k="body"><p class="dfo-muted">Getting your calendar link…</p></div>`);
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);
    const render = links => {
      const body = box.querySelector('[data-k="body"]');
      if (!links) { body.innerHTML = '<p class="dfo-status dfo-err">Couldn’t get the link. Try again.</p>'; return; }
      body.innerHTML = `
        <p class="dfo-muted">Every booked show (with load-in, set time, address and contact) and every hold, marked HOLD. It updates by itself about once an hour. Share it only with the band and crew: anyone with the link can see the shows.</p>
        <div class="dfc-buttons"><a class="btn btn-gold" href="${esc(links.webcal)}">📲 Subscribe on this phone</a><button class="btn btn-ghost" data-a="copy">📋 Copy link</button></div>
        <p class="dfo-muted"><b>Google Calendar:</b> on a computer, open Other calendars → + → From URL, and paste the link.</p>
        <label class="dfo-field"><span>Calendar link</span><input type="text" readonly data-k="url" value="${esc(links.url)}" /></label>
        <p class="dfo-muted">Shared it with someone who shouldn't have it? <button class="dfo-linkbtn" data-a="reset">Make a new link</button> (the old one stops working).</p>
        <div class="dfo-status" data-k="status"></div>`;
      const status = (m, k) => { const s = body.querySelector('[data-k="status"]'); s.className = 'dfo-status' + (k ? ' dfo-' + k : ''); s.textContent = m; };
      body.querySelector('[data-a="copy"]').addEventListener('click', () => navigator.clipboard.writeText(links.url).then(() => status('Copied ✓', 'ok')).catch(() => status('Copy failed. Select the link and copy it.', 'err')));
      body.querySelector('[data-a="reset"]').addEventListener('click', async () => {
        if (!confirm('Make a new calendar link? Phones subscribed to the old one stop getting updates until they subscribe again.')) return;
        render(await feedLink('reset'));
      });
    };
    render(await feedLink('get'));
  }

  const style = document.createElement('style');
  style.textContent = `
    .dfc-buttons{display:flex;flex-wrap:wrap;gap:8px;margin:0.75rem 0}
    .dfc-buttons a{text-decoration:none}
    .dfo-linkbtn{background:none;border:0;padding:0;color:var(--blue,#4a9eff);cursor:pointer;font:inherit}`;
  document.head.appendChild(style);

  window.DFShowCal = { openAdd, openSubscribe, config, parseTime };
})();
