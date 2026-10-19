// ============================================================
//  DRAGON FARM CRM — FIND BOOKERS / FIND SYNC CONTACTS
//
//  Searches the live web for people who book bands (mode "booking") or
//  license music (mode "sync"). The search runs on the server
//  (netlify/functions/finder-background.mjs) and usually takes a minute
//  or more, so the page starts the job and checks back until it's done.
//  Each finder remembers its last search, so you can leave the page and
//  come back to the results. A search can also be saved to run by itself
//  every Monday (netlify/functions/weekly*.mjs); new places it finds land
//  in the pipeline and a digest goes out by email or Discord.
//
//  Usage: const finder = DFFinder.mount(element, { mode: 'booking' | 'sync', onAdd(lead) -> true if added })
//         finder.run({ location, artist, dates, categories })  // fill the form and search
// ============================================================

(function () {
  const START = '/.netlify/functions/finder-background';
  const STATUS = '/.netlify/functions/finder-status';
  const WEEKLY = '/.netlify/functions/weekly';
  const POLL_MS = 5000;
  const GIVE_UP_MS = 12 * 60 * 1000;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  function notesFor(r, linkLabel, extra) {
    return [
      r.fit,
      r.project && `Projects: ${r.project}`,
      r.how_to_approach && `How to approach: ${r.how_to_approach}`,
      extra,
      r.booking_url && `${linkLabel}: ${r.booking_url}`,
      r.source_url && `Found on: ${r.source_url}`
    ].filter(Boolean).join('\n');
  }
  const contactOf = r => [r.contact_name, r.contact_role && `(${r.contact_role})`].filter(Boolean).join(' ');

  // Per-mode wording, categories (key, chip label, lead type/category) and lead shape.
  const MODES = {
    booking: {
      storageKey: 'df_finder_last',
      title: 'Find Bookers',
      intro: 'Searches the web live for people and places that book bands. Every result links to the page it was found on. Check contact details there before you send anything.',
      ask: 'Who are you looking for?',
      noun: 'booker',
      categories: [
        ['venues', 'Venues & clubs', 'Bar / Club'],
        ['buyers', 'Talent buyers & promoters', 'Promoter / Talent Buyer'],
        ['agencies', 'Booking agencies', 'Booking Agency'],
        ['festivals', 'Festivals', 'Festival'],
        ['colleges', 'Colleges', 'College'],
        ['breweries', 'Breweries, wineries & restaurants', 'Brewery / Winery'],
        ['private', 'Private & corporate events', 'Private Event'],
        ['community', 'Fairs & city events', 'Fair / City Event'],
        ['similar', 'Who books artists like ours', 'Other']
      ],
      defaults: ['venues', 'buyers', 'festivals'],
      where: { label: 'Where', placeholder: 'Nashville, TN · Southeast · Within 3 hours of Atlanta', required: true },
      forLabel: 'For',
      forOptions: [['Timothy Chance and Rasta Country', 'Timothy Chance & Rasta Country']],
      similar: { label: 'Similar artists (optional)', placeholder: 'e.g. Slightly Stoopid, Zac Brown Band' },
      dates: { label: 'Dates to fill (optional)', placeholder: 'e.g. Thu Oct 23, Sat Oct 25' },
      linkLabel: 'Booking page',
      toLead(r, q, type) {
        return {
          name: r.name,
          city: [r.city, r.state].filter(Boolean).join(', '),
          type,
          artist: q.artist || 'Timothy Chance and Rasta Country',
          contactName: contactOf(r),
          contactEmail: r.email,
          contactPhone: r.phone,
          website: r.website,
          source: r.source_url,
          status: 'new',
          notes: notesFor(r, 'Booking page', q.dates && `Pitched for: ${q.dates}`)
        };
      }
    },
    sync: {
      storageKey: 'df_finder_sync_last',
      title: 'Find Sync Contacts',
      intro: 'Searches the web live for music supervisors and others who license music. Every result links to the page it was found on, and says how they take submissions when the page does. Check before you send anything.',
      ask: 'What kind of sync contacts?',
      noun: 'contact',
      categories: [
        ['supervisors', 'Music supervisors (film & TV)', 'Film'],
        ['trailers', 'Trailer houses', 'Trailer'],
        ['ads', 'Ad agencies & music houses', 'Advertisement'],
        ['games', 'Video game studios', 'Video Game'],
        ['libraries', 'Sync agencies & music libraries', 'Sync Agency / Library'],
        ['briefs', 'Open sync briefs', 'Other'],
        ['creators', 'YouTube, podcasts & docs', 'Creator / Podcast'],
        ['lifestyle', 'Lifestyle & cannabis-friendly brands', 'Brand Campaign']
      ],
      defaults: ['supervisors', 'libraries', 'briefs'],
      where: { label: 'Focus (optional)', placeholder: 'e.g. indie films, Netflix dramas, horror games, outdoor brands', required: false },
      forLabel: 'Track',
      forOptions: [['Mr. Iron Man (Live)', 'Mr. Iron Man (Live)']],
      similar: { label: 'Sounds like (optional)', placeholder: 'e.g. Rebelution, Chronixx, Zac Brown Band' },
      linkLabel: 'Submission page',
      toLead(r, q, category) {
        return {
          name: r.name,
          project: r.project,
          category,
          track: q.artist || 'Mr. Iron Man (Live)',
          contact: contactOf(r),
          email: r.email,
          website: r.website,
          source: r.source_url,
          status: 'new',
          notes: notesFor(r, 'Submission page', [r.company && r.company !== r.name && `Company: ${r.company}`, r.phone && `Phone: ${r.phone}`].filter(Boolean).join('\n'))
        };
      }
    }
  };

  function mount(root, opts) {
    const M = MODES[opts.mode] || MODES.booking;
    const LABEL = Object.fromEntries(M.categories.map(([k, l]) => [k, l]));
    const TYPE = Object.fromEntries(M.categories.map(([k, , t]) => [k, t]));
    let state = { job: null, results: [], query: null, added: {} };
    let timer = null;

    const $ = name => root.querySelector(`[data-f="${name}"]`);
    const remember = () => { try { localStorage.setItem(M.storageKey, JSON.stringify(state)); } catch {} };
    const recall = () => { try { return JSON.parse(localStorage.getItem(M.storageKey) || 'null'); } catch { return null; } };

    async function call(url, init = {}) {
      const go = () => fetch(url, { ...init, headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode(), ...(init.headers || {}) } });
      let res = await go();
      if (res.status === 401 && DFStore.askPasscode()) res = await go();
      return res;
    }

    function render() {
      root.classList.add('fb');
      root.innerHTML = `
        <div class="fb-hdr">
          <h2>${esc(M.title)}</h2>
          <p>${esc(M.intro)}</p>
        </div>
        <div class="fb-box">
          <div class="fb-label">${esc(M.ask)}</div>
          <div class="fb-chips">${M.categories.map(([k, l]) =>
            `<button type="button" class="fb-chip${M.defaults.includes(k) ? ' on' : ''}" data-cat="${k}">${esc(l)}</button>`).join('')}</div>
          <div class="fb-grid">
            <div class="field"><label>${esc(M.where.label)}</label><input type="text" data-f="location" placeholder="${esc(M.where.placeholder)}" /></div>
            <div class="field"><label>${esc(M.forLabel)}</label>
              <select data-f="artist">${M.forOptions.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>${esc(M.similar.label)}</label><input type="text" data-f="similar" placeholder="${esc(M.similar.placeholder)}" /></div>
            ${M.dates ? `<div class="field"><label>${esc(M.dates.label)}</label><input type="text" data-f="dates" placeholder="${esc(M.dates.placeholder)}" /></div>` : ''}
            <div class="field"><label>How many</label>
              <select data-f="count"><option value="10">About 10</option><option value="15">About 15</option><option value="20">About 20</option></select>
            </div>
          </div>
          <div class="fb-actions">
            <button class="btn btn-gold" data-f="go">Search the web</button>
            <span class="fb-hint">Takes 1 to 3 minutes. You can leave this page; results will be here when you come back.</span>
          </div>
        </div>
        <div class="fb-box fb-weekly" data-f="weekly"></div>
        <div data-f="status"></div>
        <div data-f="results"></div>`;
      root.querySelectorAll('.fb-chip').forEach(b => b.addEventListener('click', () => b.classList.toggle('on')));
      $('go').addEventListener('click', start);
      $('location').addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
      loadWeekly();
    }

    // ---- every Monday ----
    let weekly = { searches: [], lastRun: null, setup: {} };
    let weeklyNote = '';

    function formQuery() {
      return { mode: opts.mode || 'booking', categories: [...root.querySelectorAll('.fb-chip.on')].map(b => b.dataset.cat), location: $('location').value.trim(), artist: $('artist').value, similar: $('similar').value.trim(), count: $('count').value };
    }
    const labelFor = q => [q.categories.map(c => LABEL[c] || c).join(', '), q.location].filter(Boolean).join(' · ');

    async function loadWeekly() {
      try {
        const res = await call(WEEKLY);
        if (res.ok) weekly = await res.json();
      } catch {}
      renderWeekly();
    }

    async function weeklyAction(body, done) {
      let res, data = {};
      try { res = await call(WEEKLY, { method: 'POST', body: JSON.stringify(body) }); data = await res.json().catch(() => ({})); }
      catch { weeklyNote = 'Couldn’t reach the server. Try again.'; return renderWeekly(); }
      weeklyNote = res.ok || res.status === 202 ? done(data) : (data.error || `Something went wrong (error ${res.status}).`);
      if (data.searches) weekly.searches = data.searches;
      renderWeekly();
    }

    function saveWeekly() {
      const q = formQuery();
      if (!q.categories.length) { weeklyNote = `Pick at least one kind of ${M.noun} first.`; return renderWeekly(); }
      if (M.where.required && !q.location) { weeklyNote = 'Enter where to look first.'; return renderWeekly(); }
      weeklyAction({ action: 'add', query: q, label: labelFor(q) }, () => 'Saved. It runs every Monday morning.');
    }

    function lastRunLine(run) {
      if (!run) return '';
      if (run.status === 'running') return 'Running now… new leads show up in the pipeline when it finishes.';
      const when = new Date(run.finishedAt || run.startedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const mine = (run.searches || []).filter(s => s.mode === (opts.mode || 'booking'));
      const added = mine.reduce((n, s) => n + (s.added || 0), 0);
      const errors = mine.filter(s => s.error).map(s => `${s.label}: ${s.error}`);
      const where = [run.digest?.email === 'sent' && 'emailed', run.digest?.discord === 'sent' && 'posted to Discord'].filter(Boolean).join(' and ');
      return `Last run ${when}: ${added} new lead${added === 1 ? '' : 's'} here.${where ? ` Digest ${where}.` : ''}${errors.length ? ` Problems: ${errors.join('; ')}` : ''}`;
    }

    function renderWeekly() {
      const el = $('weekly');
      if (!el) return;
      const mine = weekly.searches.filter(s => s.mode === (opts.mode || 'booking'));
      const s = weekly.setup || {};
      const digest = s.email || s.discord
        ? `The Monday digest goes to ${[s.email && esc(s.to), s.discord && 'Discord'].filter(Boolean).join(' and ')}.`
        : 'To get the Monday digest, set up Resend (email) or a Discord webhook. See the README.';
      el.innerHTML = `
        <div class="fb-label">Every Monday</div>
        <p class="fb-hint fb-weekly-intro">Save a search and it runs by itself each Monday morning. Places that aren’t in your pipeline yet are added as new leads due that day. ${digest}</p>
        ${mine.length ? `<ul class="fb-weekly-list">${mine.map(w => `<li><span>${esc(w.label)}</span><button class="fb-x" data-id="${esc(w.id)}" title="Stop running this search" aria-label="Remove ${esc(w.label)}">×</button></li>`).join('')}</ul>` : ''}
        <div class="fb-actions">
          <button class="btn btn-ghost" data-f="weekly-save">⟳ Run this search every Monday</button>
          ${weekly.searches.length ? '<button class="btn btn-ghost" data-f="weekly-run">Run all now</button>' : ''}
          ${s.email || s.discord ? '<button class="btn btn-ghost" data-f="weekly-digest">Send a digest now</button>' : ''}
        </div>
        ${weeklyNote || weekly.lastRun ? `<div class="fb-hint fb-weekly-note">${esc(weeklyNote || lastRunLine(weekly.lastRun))}</div>` : ''}`;
      $('weekly-save').addEventListener('click', saveWeekly);
      el.querySelectorAll('.fb-x').forEach(b => b.addEventListener('click', () => weeklyAction({ action: 'remove', id: b.dataset.id }, () => 'Removed.')));
      if ($('weekly-run')) $('weekly-run').addEventListener('click', () => weeklyAction({ action: 'run' }, () => { setTimeout(loadWeekly, 60000); return 'Started. The searches take a few minutes; new leads appear in the pipeline when they finish.'; }));
      if ($('weekly-digest')) $('weekly-digest').addEventListener('click', () => weeklyAction({ action: 'digest' }, d => {
        const ok = [d.sent?.email === 'sent' && 'emailed', d.sent?.discord === 'sent' && 'posted to Discord'].filter(Boolean);
        const bad = [d.sent?.email, d.sent?.discord].filter(x => x && x !== 'sent' && x !== 'off');
        return ok.length ? `Digest ${ok.join(' and ')}.` + (bad.length ? ` Problem: ${bad.join('; ')}` : '') : `The digest didn’t go out: ${bad.join('; ') || 'nothing is set up'}.`;
      }));
    }

    async function start() {
      const categories = [...root.querySelectorAll('.fb-chip.on')].map(b => b.dataset.cat);
      const location = $('location').value.trim();
      if (!categories.length) return showStatus(`Pick at least one kind of ${M.noun}.`, 'warn');
      if (M.where.required && !location) return showStatus('Enter where to look.', 'warn');
      const query = { mode: opts.mode || 'booking', categories, location, artist: $('artist').value, similar: $('similar').value.trim(), dates: $('dates') ? $('dates').value.trim() : '', count: $('count').value };
      const jobId = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      state = { job: jobId, startedAt: Date.now(), results: [], query, added: {} };
      remember();
      renderResults();
      let res;
      try { res = await call(START, { method: 'POST', body: JSON.stringify({ jobId, ...query }) }); }
      catch { return fail('Could not reach the search service. Check your connection and try again.'); }
      if (res.status === 401) return fail('Enter the Dragon Farm passcode to search.');
      if (!res.ok && res.status !== 202) return fail(`The search couldn't start (error ${res.status}).`);
      poll();
    }

    function fail(message) {
      state.job = null;
      remember();
      showStatus(message, 'err');
      setBusy(false);
    }

    function setBusy(busy) {
      const b = $('go');
      if (b) { b.disabled = busy; b.textContent = busy ? 'Searching…' : 'Search the web'; }
    }

    function showStatus(message, kind) {
      $('status').innerHTML = message ? `<div class="fb-status fb-status-${kind || 'info'}">${message}</div>` : '';
    }

    async function poll() {
      clearTimeout(timer);
      if (!state.job) return;
      setBusy(true);
      const secs = Math.round((Date.now() - state.startedAt) / 1000);
      const what = state.query.categories.map(c => (LABEL[c] || c).toLowerCase()).join(', ');
      showStatus(`<span class="spinner"></span> Searching the web for ${esc(what)}${state.query.location ? ` (${esc(state.query.location)})` : ''}… ${secs}s`, 'info');
      if (Date.now() - state.startedAt > GIVE_UP_MS) return fail('The search is taking too long. Try again with fewer kinds or a narrower focus.');
      let res;
      try { res = await call(`${STATUS}?job=${encodeURIComponent(state.job)}`); }
      catch { timer = setTimeout(poll, POLL_MS); return; }
      if (res.status === 401) return fail('Enter the Dragon Farm passcode to see results.');
      const data = res.ok ? await res.json().catch(() => ({})) : { status: 'pending' };
      if (data.status === 'done') {
        state = { ...state, job: null, results: data.results || [], searches: data.searches };
        remember();
        setBusy(false);
        showStatus('', '');
        renderResults();
      } else if (data.status === 'error') {
        fail(esc(data.message || 'The search failed.'));
      } else {
        timer = setTimeout(poll, POLL_MS);
      }
    }

    function add(i) {
      const r = state.results[i];
      if (!r || state.added[i]) return;
      if (opts.onAdd(M.toLead(r, state.query || {}, TYPE[r.category] || 'Other')) !== false) state.added[i] = true;
      remember();
      renderResults();
    }

    function addAll() {
      state.results.forEach((_, i) => { if (!state.added[i]) add(i); });
    }

    function renderResults() {
      const el = $('results');
      if (!state.results.length) { el.innerHTML = ''; return; }
      const q = state.query || {};
      el.innerHTML = `
        <div class="fb-results-hdr">
          <div><b>${state.results.length} found</b>${q.location ? ` · ${esc(q.location)}` : ''}${q.dates ? ` · for ${esc(q.dates)}` : ''}${state.searches ? ` · ${state.searches} web searches` : ''}</div>
          <button class="btn btn-ghost" data-f="add-all">+ Add all to leads</button>
        </div>
        <div class="fb-list">${state.results.map((r, i) => {
          const links = [
            safeUrl(r.website) && `<a href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>`,
            safeUrl(r.booking_url) && `<a href="${esc(r.booking_url)}" target="_blank" rel="noopener">${M.linkLabel}</a>`,
            safeUrl(r.source_url) && `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">${r.verified ? '✓ Source' : '⚠ Source (check)'}</a>`
          ].filter(Boolean).join(' · ');
          const sub = [r.company && r.company !== r.name && r.company, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
          return `<div class="fb-card">
            <div class="fb-card-top">
              <div>
                <span class="fb-cat">${esc(LABEL[r.category] || r.category)}</span>
                <div class="fb-name">${esc(r.name)}</div>
                ${sub ? `<div class="fb-sub">${esc(sub)}</div>` : ''}
              </div>
              <button class="btn ${state.added[i] ? 'btn-ghost' : 'btn-gold'} fb-add" data-i="${i}" ${state.added[i] ? 'disabled' : ''}>${state.added[i] ? 'Added ✓' : '+ Add to leads'}</button>
            </div>
            ${r.contact_name || r.contact_role ? `<div class="fb-line">👤 ${esc([r.contact_name, r.contact_role].filter(Boolean).join(' · '))}</div>` : ''}
            ${r.email ? `<div class="fb-line">✉️ <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></div>` : ''}
            ${r.phone ? `<div class="fb-line">📞 <a href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a></div>` : ''}
            ${!r.email && !r.phone ? `<div class="fb-line fb-muted">No email or phone listed. ${safeUrl(r.booking_url) ? `Use the ${M.linkLabel.toLowerCase()}.` : 'Check the source page for how to reach them.'}</div>` : ''}
            ${links ? `<div class="fb-line fb-links">${links}</div>` : ''}
            ${r.project ? `<div class="fb-fit"><b>Projects:</b> ${esc(r.project)}</div>` : ''}
            ${r.fit ? `<div class="fb-fit">${esc(r.fit)}</div>` : ''}
            ${r.how_to_approach ? `<div class="fb-fit"><b>How to approach:</b> ${esc(r.how_to_approach)}</div>` : ''}
          </div>`;
        }).join('')}</div>`;
      el.querySelectorAll('.fb-add').forEach(b => b.addEventListener('click', () => add(Number(b.dataset.i))));
      $('add-all').addEventListener('click', addAll);
    }

    function fill(q) {
      $('location').value = q.location || '';
      // A search saved for an act or track no longer offered falls back to the first one.
      $('artist').value = M.forOptions.some(([v]) => v === q.artist) ? q.artist : M.forOptions[0][0];
      $('similar').value = q.similar || '';
      if ($('dates')) $('dates').value = q.dates || '';
      $('count').value = String(q.count || 10);
      if (q.categories) root.querySelectorAll('.fb-chip').forEach(b => b.classList.toggle('on', q.categories.includes(b.dataset.cat)));
    }

    render();
    const last = recall();
    if (last && last.query) {
      state = { added: {}, results: [], ...last };
      fill(last.query);
      renderResults();
      if (state.job) poll();
    }

    return {
      // Fill the form (anything not given is cleared) and start a search.
      run(q) {
        if (state.job) return showStatus('A search is already running. Wait for it to finish first.', 'warn');
        fill({ ...q, categories: q.categories || M.defaults });
        start();
      }
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .fb-hdr h2{margin:0 0 4px}
    .fb-hdr p{margin:0 0 1rem;font-size:0.85rem;color:var(--gray,#9aa39c);max-width:720px}
    .fb-box{background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);padding:1rem 1.1rem;margin-bottom:1rem}
    .fb-label{font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--gray,#9aa39c);margin-bottom:0.5rem}
    .fb-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1rem}
    .fb-chip{background:transparent;border:1px solid var(--border2,rgba(255,255,255,0.14));color:var(--gray-light,#c9c2ae);border-radius:999px;padding:6px 12px;font-size:0.8rem;cursor:pointer}
    .fb-chip.on{background:rgba(42,180,100,0.15);border-color:var(--green,#2ab464);color:var(--cream,#e8dfc8)}
    .fb-grid{display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:0.75rem 1rem}
    .fb-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1rem}
    .fb-hint{font-size:0.76rem;color:var(--gray,#9aa39c)}
    .fb-weekly-intro{margin:0 0 0.5rem;max-width:720px}
    .fb-weekly-list{list-style:none;margin:0;padding:0}
    .fb-weekly-list li{display:flex;justify-content:space-between;align-items:center;gap:0.75rem;padding:0.4rem 0;border-top:1px solid var(--border,rgba(255,255,255,0.08));font-size:0.85rem;color:var(--cream,#e8dfc8)}
    .fb-x{background:none;border:1px solid var(--border2,rgba(255,255,255,0.14));color:var(--gray,#9aa39c);border-radius:999px;width:26px;height:26px;cursor:pointer;flex-shrink:0;font-size:1rem;line-height:1}
    .fb-weekly .fb-actions{margin-top:0.6rem}
    .fb-weekly-note{margin-top:0.6rem}
    .fb-status{padding:0.75rem 1rem;border-radius:var(--r,8px);font-size:0.85rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.6rem}
    .fb-status-info{background:rgba(74,158,255,0.08);color:var(--gray-light,#c9c2ae);border:1px solid rgba(74,158,255,0.2)}
    .fb-status-warn{background:rgba(200,146,42,0.1);color:#f0c060;border:1px solid rgba(200,146,42,0.3)}
    .fb-status-err{background:rgba(224,90,79,0.1);color:#ff8a80;border:1px solid rgba(224,90,79,0.3)}
    .fb-results-hdr{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem;font-size:0.85rem;color:var(--gray-light,#c9c2ae)}
    .fb-results-hdr b{color:var(--cream,#e8dfc8);font-weight:500}
    .fb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem}
    .fb-card{background:var(--card,#131c1e);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r2,10px);padding:0.9rem 1rem;min-width:0}
    .fb-card-top{display:flex;justify-content:space-between;gap:0.75rem;align-items:flex-start;margin-bottom:0.4rem}
    .fb-card-top .btn{flex-shrink:0;padding:5px 10px;font-size:0.78rem}
    .fb-cat{display:inline-block;font-size:0.65rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--gold-light,#f0c060);margin-bottom:2px}
    .fb-name{font-size:0.95rem;color:var(--cream,#e8dfc8);font-weight:500}
    .fb-sub{font-size:0.78rem;color:var(--gray,#9aa39c)}
    .fb-line{font-size:0.8rem;color:var(--gray-light,#c9c2ae);margin-top:4px;overflow-wrap:anywhere}
    .fb-line a{color:var(--blue,#4a9eff);text-decoration:none}
    .fb-muted{color:var(--gray,#9aa39c)}
    .fb-fit{font-size:0.78rem;color:var(--gray,#9aa39c);margin-top:6px;line-height:1.45}
    .fb-fit b{color:var(--gray-light,#c9c2ae);font-weight:500}
    @media (max-width:768px){.fb-grid{grid-template-columns:1fr}.fb-list{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  window.DFFinder = { mount, MODES };
})();
