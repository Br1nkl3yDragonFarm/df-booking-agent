// ============================================================
//  DRAGON FARM CRM — REAL DISTANCES
//
//  Straight-line miles between towns, from US city coordinates
//  (vendor/us-cities.json, US-Cities-Database, MIT) and geolib
//  (vendor/geolib.js, MIT). Driving is usually 15–30% farther than the
//  straight line, so the labels say "about".
//
//  Used for: how far a lead is from the nearest upcoming booked show,
//  sorting "Fill nearby dates" results by distance, and the drive between
//  back-to-back booked shows.
//
//  Usage: DFDist.load().then(...); DFDist.miles('Nashville, TN', 'Memphis, TN') -> 196
// ============================================================

(function () {
  const DATA = 'vendor/us-cities.json';
  const METERS_PER_MILE = 1609.344;
  const NEAR_MILES = 300;      // a lead this close to a booked show gets a 📍 badge
  const FAR_MILES = 250;       // finder results farther than this from the show get a warning
  const LONG_DRIVE = 400;      // miles between back-to-back shows worth flagging

  let index = null;            // state code -> lowercase city -> [lat, lon]
  let byName = null;           // lowercase city -> [[state, coords], ...]
  let codes = null;            // lowercase state name -> code
  let loading = null;

  const clean = s => String(s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
    .replace(/^st /, 'saint ').replace(/^ft /, 'fort ').replace(/^mt /, 'mount ');

  function load() {
    if (!loading) {
      loading = fetch(DATA).then(r => r.json()).then(d => {
        index = {}; byName = {}; codes = {};
        for (const [code, name] of Object.entries(d._states)) codes[name.toLowerCase()] = code;
        for (const [st, cities] of Object.entries(d.cities)) {
          index[st] = {};
          for (const [city, ll] of Object.entries(cities)) {
            const k = clean(city);
            index[st][k] = ll;
            (byName[k] = byName[k] || []).push([st, ll]);
          }
        }
        return true;
      }).catch(() => { loading = null; return false; });
    }
    return loading;
  }
  const ready = () => !!index;

  // "Nashville, TN", "Nashville, Tennessee", "Nashville TN 37203", "St. Louis, MO, USA" -> [lat, lon] or null.
  function coords(place) {
    if (!index || !place) return null;
    const parts = String(place).split(',').map(s => s.trim()).filter(Boolean);
    let city = parts[0] || '', state = '';
    for (const p of parts.slice(1)) {
      const w = p.replace(/\d{5}(-\d{4})?/, '').trim();
      if (/^[A-Za-z]{2}$/.test(w) && index[w.toUpperCase()]) { state = w.toUpperCase(); break; }
      if (codes[w.toLowerCase()]) { state = codes[w.toLowerCase()]; break; }
    }
    if (!state) {
      const m = city.match(/^(.*?)\s+([A-Za-z]{2})(?:\s+\d{5})?$/);
      if (m && index[m[2].toUpperCase()]) { city = m[1]; state = m[2].toUpperCase(); }
    }
    const k = clean(city);
    if (state) return index[state][k] || null;
    const all = byName[k] || [];
    return all.length === 1 ? all[0][1] : null;   // without a state, only a name that's unique
  }

  function milesBetween(a, b) {
    if (!a || !b) return null;
    return Math.round(geolib.getDistance({ latitude: a[0], longitude: a[1] }, { latitude: b[0], longitude: b[1] }) / METERS_PER_MILE);
  }
  const miles = (a, b) => milesBetween(coords(a), coords(b));

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shortDate = date => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // The closest upcoming booked show to this lead: { show, miles } or null.
  function nearestShow(lead, leads) {
    const here = coords(lead.city);
    if (!here) return null;
    const t = today();
    let best = null;
    for (const s of leads) {
      if (s.id === lead.id || s.status !== 'booked' || !s.eventDate || s.eventDate < t) continue;
      const m = milesBetween(here, coords(s.city));
      if (m != null && (!best || m < best.miles)) best = { show: s, miles: m };
    }
    return best;
  }

  // 📍 badge for a lead that isn't booked yet: near enough to route around a show.
  function badge(lead, leads) {
    if (!index || lead.status === 'booked' || lead.status === 'passed') return '';
    const n = nearestShow(lead, leads);
    if (!n || n.miles > NEAR_MILES) return '';
    return `<span class="dfd-badge" title="Straight-line distance; driving is usually a bit farther">📍 ~${n.miles} mi from ${esc(n.show.name)} (${shortDate(n.show.eventDate)})</span>`;
  }

  // Line for a finder result, measured from the show the search is filling around.
  function fromLine(place, near) {
    if (!index || !near) return '';
    const m = miles(place, near.city);
    if (m == null) return '';
    return m > FAR_MILES
      ? `<div class="dfd-far">⚠ ~${m} mi from ${esc(near.label || near.city)}: probably too far for the same run</div>`
      : `<div class="dfd-near">📍 ~${m} mi from ${esc(near.label || near.city)}</div>`;
  }

  // Drive from each upcoming booked show to the next one: [{ from, to, miles, days, long }].
  function legs(leads) {
    const t = today();
    const shows = leads.filter(l => l.status === 'booked' && l.eventDate && l.eventDate >= t).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const out = [];
    for (let i = 1; i < shows.length; i++) {
      const m = miles(shows[i - 1].city, shows[i].city);
      if (m == null) continue;
      const days = Math.round((new Date(shows[i].eventDate) - new Date(shows[i - 1].eventDate)) / 86400000);
      out.push({ from: shows[i - 1], to: shows[i], miles: m, days, long: days <= 1 && m > LONG_DRIVE });
    }
    return out;
  }

  const style = document.createElement('style');
  style.textContent = `
    .dfd-badge{display:inline-block;font-size:0.68rem;line-height:1.4;padding:1px 7px;border-radius:999px;white-space:nowrap;color:#9ec9ff;border:1px solid rgba(74,158,255,0.35);margin-top:3px}
    .dfd-near{font-size:0.8rem;color:#9ec9ff;margin-top:4px}
    .dfd-far{font-size:0.8rem;color:#f0c060;margin-top:4px}
    .dfd-leg{font-size:0.82rem;color:var(--bone-dim,#9aa39c);padding:0.35rem 0 0.35rem 1.2rem}
    .dfd-leg-long{color:#f0c060}`;
  document.head.appendChild(style);

  window.DFDist = { load, ready, coords, miles, nearestShow, badge, fromLine, legs, FAR_MILES };
})();
