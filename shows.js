// ============================================================
//  DRAGON FARM — PUBLIC SHOWS (shows.html and the home page's "Next up")
//
//  Reads the public show list (netlify/functions/shows.mjs) and draws it:
//  date, venue, times, tickets, add-to-calendar and directions, plus
//  schema.org MusicEvent data so Google can list the shows in search.
//
//  DFShows.load()                         → { upcoming, recent }
//  DFShows.listHtml(shows) / recentHtml / stripHtml(shows, max)
//  DFShows.jsonLd(shows, site)            → schema.org objects
// ============================================================

(function () {
  const API = '/.netlify/functions/shows';
  const SHOW_HOURS = 2;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const day = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = (iso, opts) => day(iso).toLocaleDateString('en-US', opts);
  function time12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function soon(iso) {
    const n = Math.round((day(iso) - day(todayIso())) / 86400000);
    return n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : '';
  }
  const place = s => [s.address || s.venue, s.address ? '' : s.city].filter(Boolean).join(', ');
  const title = s => `${s.artist} at ${s.venue}`;

  // Start and end as calendar stamps; local "floating" time, so 9 PM means 9 PM where the show is.
  function stamps(s) {
    const d = s.date.replace(/-/g, '');
    if (!s.time) {
      const next = day(s.date); next.setDate(next.getDate() + 1);
      return { allDay: true, start: d, end: `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}` };
    }
    const [h, m] = s.time.split(':').map(Number);
    const end = new Date(day(s.date).getTime() + ((h + SHOW_HOURS) * 60 + m) * 60000);
    const p = n => String(n).padStart(2, '0');
    return { start: `${d}T${p(h)}${p(m)}00`, end: `${end.getFullYear()}${p(end.getMonth() + 1)}${p(end.getDate())}T${p(end.getHours())}${p(end.getMinutes())}00` };
  }
  function details(s) {
    return [s.doors && `Doors ${time12(s.doors)}`, s.time && `Show ${time12(s.time)}`, s.ages, s.price, s.tickets && `Tickets: ${s.tickets}`].filter(Boolean).join(' · ');
  }
  function googleLink(s) {
    const t = stamps(s);
    const q = new URLSearchParams({ action: 'TEMPLATE', text: title(s), dates: `${t.start}/${t.end}`, location: [s.venue, s.address || s.city].filter(Boolean).join(', '), details: details(s) });
    return 'https://calendar.google.com/calendar/render?' + q;
  }
  function ics(s) {
    const t = stamps(s);
    const icsText = v => String(v).replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dragon Farm Records//Shows//EN', 'BEGIN:VEVENT',
      `UID:${s.date}-${s.venue.replace(/[^a-z0-9]/gi, '').toLowerCase()}@dragonfarm.net`, `DTSTAMP:${now}`,
      t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART:${t.start}`, t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND:${t.end}`,
      `SUMMARY:${icsText(title(s))}`, `LOCATION:${icsText([s.venue, s.address || s.city].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${icsText(details(s))}`, s.tickets ? `URL:${s.tickets}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n') + '\r\n';
  }
  const maps = s => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([s.venue, s.address || s.city].filter(Boolean).join(', '));

  function card(s, i) {
    const when = soon(s.date);
    const free = /^free\b/i.test(s.price || '');
    const facts = [s.doors && `Doors ${time12(s.doors)}`, s.time && `Show ${time12(s.time)}`, s.ages, !free && s.price].filter(Boolean);
    return `<li class="gig">
      <p class="gig-date" aria-hidden="true"><span>${esc(fmt(s.date, { weekday: 'short' }))}</span><b>${esc(fmt(s.date, { day: 'numeric' }))}</b><span>${esc(fmt(s.date, { month: 'short' }))}</span></p>
      <div class="gig-body">
        ${when ? `<p class="gig-soon">${when}</p>` : ''}
        <h3 class="gig-venue">${esc(s.venue)}</h3>
        <p class="gig-where"><span class="sr-only">${esc(fmt(s.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}, </span>${esc(s.city || '')}${s.address ? ` <span class="gig-address">${esc(s.address)}</span>` : ''}</p>
        ${facts.length ? `<p class="gig-facts">${facts.map(esc).join(', ')}</p>` : ''}
        <div class="gig-actions">
          ${s.tickets ? `<a class="btn btn-flame" href="${esc(s.tickets)}" target="_blank" rel="noopener">Tickets<span class="sr-only"> for ${esc(s.venue)}</span></a>` : `<span class="gig-door">${free ? 'Free show' : 'Tickets at the door'}</span>`}
          <details class="gig-cal">
            <summary class="btn-text">Add to calendar</summary>
            <div class="gig-cal-menu"><a href="${esc(googleLink(s))}" target="_blank" rel="noopener">Google Calendar</a><a href="#" data-ics="${i}">Apple / Outlook (.ics)</a></div>
          </details>
          <a class="btn-text" href="${esc(maps(s))}" target="_blank" rel="noopener">Directions</a>
        </div>
      </div>
    </li>`;
  }
  const listHtml = shows => `<ol class="gigs">${shows.map(card).join('')}</ol>`;
  const recentHtml = shows => `<ul class="played">${shows.map(s => `<li><span>${esc(fmt(s.date, { month: 'short', day: 'numeric', year: 'numeric' }))}</span> ${esc(s.venue)}${s.city ? `, ${esc(s.city)}` : ''}</li>`).join('')}</ul>`;
  const stripHtml = (shows, max) => `<ul class="next-list">${shows.slice(0, max).map(s => `<li><b>${esc(fmt(s.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</b> <span>${esc(s.venue)}${s.city ? `, ${esc(s.city)}` : ''}</span>${s.tickets ? ` <a href="${esc(s.tickets)}" target="_blank" rel="noopener">Tickets</a>` : ''}</li>`).join('')}</ul>`;

  // schema.org MusicEvent for each upcoming show (https://developers.google.com/search/docs/appearance/structured-data/event)
  function jsonLd(shows, site) {
    return shows.map(s => {
      const price = (String(s.price || '').match(/\$?\s*(\d+(?:\.\d{2})?)/) || [])[1];
      return {
        '@context': 'https://schema.org', '@type': 'MusicEvent',
        name: title(s),
        startDate: s.time ? `${s.date}T${s.time}` : s.date,
        ...(s.doors ? { doorTime: `${s.date}T${s.doors}` } : {}),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'MusicVenue', name: s.venue, address: s.address || s.city || s.venue },
        performer: { '@type': 'MusicGroup', name: s.artist },
        organizer: { '@type': 'Organization', name: 'Dragon Farm Records', url: site },
        image: [site + '/logo-badge.webp'],
        description: `${s.artist}, country reggae from Nashville, live at ${s.venue}${s.city ? ' in ' + s.city : ''}.`,
        ...(s.tickets || /^free\b/i.test(s.price || '') ? { offers: {
          '@type': 'Offer', url: s.tickets || site + '/shows.html', availability: 'https://schema.org/InStock',
          price: /^free\b/i.test(s.price || '') ? 0 : price ? Number(price) : undefined, priceCurrency: 'USD'
        } } : {})
      };
    });
  }

  async function load() {
    const res = await fetch(API);
    if (!res.ok) throw new Error('shows ' + res.status);
    return res.json();
  }

  // .ics downloads for the buttons a list rendered.
  function wireIcs(root, shows) {
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-ics]');
      if (!a) return;
      e.preventDefault();
      const s = shows[Number(a.dataset.ics)];
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([ics(s)], { type: 'text/calendar' }));
      link.download = `${s.date}-${s.venue.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
  }

  window.DFShows = { load, listHtml, recentHtml, stripHtml, jsonLd, ics, googleLink, wireIcs };
})();
