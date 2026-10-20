// ============================================================
//  DRAGON FARM CRM — IMPORT LEADS FROM A SPREADSHEET
//
//  Pick a CSV (export one from Excel, Google Sheets, Numbers or another
//  CRM), check how its columns match the lead's fields, and add the rows
//  as new leads. Rows already in the pipeline (same name, email or
//  website) are skipped. Parsing is Papa Parse (vendor/papaparse.js).
//
//  Usage: DFImport.open({ list: 'venue' | 'sync' | 'brand', existing: leads, onImport(newLeads) })
//  Needs outreach.js (DFOut) for the modal.
// ============================================================

(function () {
  const MAX_ROWS = 2000;
  const SHARED_HOSTS = ['facebook.com', 'instagram.com', 'linktr.ee', 'eventbrite.com', 'bandsintown.com', 'linkedin.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'google.com', 'sites.google.com'];

  // [field, label, header names it matches]
  const FIELDS = {
    venue: [
      ['name', 'Venue / place', ['venue', 'venue name', 'name', 'company', 'organization', 'business', 'place']],
      ['city', 'City', ['city', 'town', 'location', 'city, state', 'market']],
      ['state', 'State', ['state', 'st', 'province', 'region']],
      ['type', 'Kind', ['type', 'venue type', 'category', 'kind']],
      ['contactName', 'Contact', ['contact', 'contact name', 'booker', 'talent buyer', 'buyer', 'promoter', 'person', 'first name', 'full name']],
      ['contactEmail', 'Email', ['email', 'e-mail', 'email address', 'contact email', 'booking email']],
      ['contactPhone', 'Phone', ['phone', 'phone number', 'tel', 'telephone', 'mobile', 'cell']],
      ['website', 'Website', ['website', 'url', 'site', 'web', 'link']],
      ['notes', 'Notes', ['notes', 'note', 'comments', 'description', 'details']]
    ],
    sync: [
      ['name', 'Company / supervisor', ['company', 'name', 'supervisor', 'organization', 'studio', 'agency', 'library']],
      ['contact', 'Contact', ['contact', 'contact name', 'music supervisor', 'person', 'full name']],
      ['email', 'Email', ['email', 'e-mail', 'email address']],
      ['project', 'Project', ['project', 'projects', 'show', 'film', 'credits', 'title']],
      ['category', 'Kind', ['category', 'type', 'kind', 'media']],
      ['website', 'Website', ['website', 'url', 'site', 'link']],
      ['notes', 'Notes', ['notes', 'note', 'comments', 'description']]
    ],
    brand: [
      ['name', 'Brand', ['brand', 'company', 'name', 'business', 'organization', 'sponsor']],
      ['category', 'Kind', ['category', 'type', 'kind', 'industry']],
      ['city', 'Where', ['city', 'location', 'town', 'region', 'state']],
      ['contact', 'Contact', ['contact', 'contact name', 'marketing', 'person', 'full name']],
      ['email', 'Email', ['email', 'e-mail', 'email address']],
      ['phone', 'Phone', ['phone', 'phone number', 'tel', 'mobile']],
      ['website', 'Website', ['website', 'url', 'site', 'link']],
      ['notes', 'Notes', ['notes', 'note', 'comments', 'description']]
    ]
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const norm = s => String(s || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nameKey = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  function host(url) {
    if (!url) return '';
    try { const h = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); return SHARED_HOSTS.includes(h) ? '' : h; } catch { return ''; }
  }
  const emailOf = l => String(l.contactEmail || l.email || '').toLowerCase();

  // Best column for each field: an exact header name first, then one that contains it.
  function guess(fields, headers) {
    const used = new Set();
    const map = {};
    for (const pass of ['exact', 'contains']) {
      for (const [key, , names] of fields) {
        if (map[key]) continue;
        const h = headers.find(h => !used.has(h) && names.some(n => pass === 'exact' ? norm(h) === norm(n) : norm(h).includes(norm(n))));
        if (h) { map[key] = h; used.add(h); }
      }
    }
    return map;
  }

  function toLeads(rows, list, map, dueToday) {
    const today = window.DFFollow ? DFFollow.today() : new Date().toISOString().slice(0, 10);
    const stamp = Date.now().toString(36);
    return rows.map((row, i) => {
      const get = k => map[k] ? String(row[map[k]] ?? '').trim().slice(0, k === 'notes' ? 2000 : 300) : '';
      const lead = { id: `imp-${stamp}-${i}`, dateAdded: new Date().toISOString(), status: 'new', imported: true };
      for (const [key] of FIELDS[list]) if (key !== 'state' && get(key)) lead[key] = get(key);
      if (list === 'venue' && get('state') && !/,\s*\w/.test(lead.city || '')) lead.city = [lead.city, get('state')].filter(Boolean).join(', ');
      if (lead.website && !/^https?:\/\//i.test(lead.website)) lead.website = 'https://' + lead.website;
      if (list === 'venue') lead.artist = 'Timothy Chance and Rasta Country';
      if (list === 'sync') lead.track = 'Mr. Iron Man (Live)';
      if (dueToday) lead.followUp = today;
      return lead;
    }).filter(l => l.name);
  }

  // Split into new leads and ones already in the pipeline (or repeated in the file).
  function dedupe(leads, existing) {
    const names = new Set(existing.map(l => nameKey(l.name)).filter(Boolean));
    const emails = new Set(existing.map(emailOf).filter(Boolean));
    const hosts = new Set(existing.map(l => host(l.website)).filter(Boolean));
    const fresh = [], dupes = [];
    for (const l of leads) {
      const n = nameKey(l.name), e = emailOf(l), h = host(l.website);
      if ((n && names.has(n)) || (e && emails.has(e)) || (h && hosts.has(h))) { dupes.push(l); continue; }
      fresh.push(l);
      if (n) names.add(n); if (e) emails.add(e); if (h) hosts.add(h);
    }
    return { fresh, dupes };
  }

  function open(opts) {
    const fields = FIELDS[opts.list];
    const box = DFOut.show(`
      <div class="dfo-head"><h3>Import from a spreadsheet</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <p class="dfo-muted">Save your list as a CSV file (in Excel, Google Sheets or Numbers: File → Download / Export → CSV), then pick it here. The first row should be the column names.</p>
        <label class="dfo-field"><span>CSV file</span><input type="file" accept=".csv,text/csv,.txt" data-k="file" /></label>
        <div data-k="step2"></div>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions"><button class="btn btn-gold" data-a="go" disabled>Import</button></div>`);
    const $ = k => box.querySelector(`[data-k="${k}"]`);
    const status = (m, k) => { $('status').className = 'dfo-status' + (k ? ' dfo-' + k : ''); $('status').textContent = m; };
    const go = box.querySelector('[data-a="go"]');
    let rows = [], headers = [];
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);

    function current() {
      const map = {};
      box.querySelectorAll('[data-map]').forEach(s => { if (s.value) map[s.dataset.map] = s.value; });
      return dedupe(toLeads(rows, opts.list, map, $('due')?.checked), opts.existing || []);
    }
    function summary() {
      const { fresh, dupes } = current();
      $('summary').innerHTML = `<b>${fresh.length}</b> new lead${fresh.length === 1 ? '' : 's'} to add${dupes.length ? `, ${dupes.length} already in the pipeline (skipped)` : ''}${rows.length >= MAX_ROWS ? ` · only the first ${MAX_ROWS} rows are read` : ''}.`;
      $('preview').innerHTML = fresh.slice(0, 3).map(l => `<li>${esc([l.name, l.city, l.contactName || l.contact, l.contactEmail || l.email].filter(Boolean).join(' · '))}</li>`).join('');
      go.disabled = !fresh.length;
      go.textContent = fresh.length ? `Import ${fresh.length}` : 'Import';
    }

    $('file').addEventListener('change', () => {
      const file = $('file').files[0];
      if (!file) return;
      status('Reading…');
      Papa.parse(file, {
        header: true, skipEmptyLines: 'greedy', preview: MAX_ROWS,
        complete(result) {
          headers = (result.meta.fields || []).filter(Boolean);
          rows = result.data;
          if (!headers.length || !rows.length) return status('That file has no rows. Check that the first row is the column names.', 'err');
          status('');
          const map = guess(fields, headers);
          $('step2').innerHTML = `
            <p class="dfo-muted">Check which column goes into each field. Leave a field on “—” to skip it.</p>
            <div class="dfi-map">${fields.map(([key, label]) => `<label class="dfo-field"><span>${esc(label)}</span><select data-map="${key}"><option value="">—</option>${headers.map(h => `<option${map[key] === h ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>
            <label class="dfo-check"><input type="checkbox" data-k="due" /> Make them due today for a first pitch (leave off for a big list, so Follow-ups due doesn't flood)</label>
            <p class="dfi-summary" data-k="summary"></p>
            <ul class="dfi-preview" data-k="preview"></ul>`;
          box.querySelectorAll('[data-map], [data-k="due"]').forEach(el => el.addEventListener('change', summary));
          if (!map.name) status(`Pick which column has the ${fields[0][1].toLowerCase()} name.`, 'err');
          summary();
        },
        error() { status('That file couldn’t be read. Save it as CSV and try again.', 'err'); }
      });
    });

    go.addEventListener('click', () => {
      const { fresh, dupes } = current();
      if (!fresh.length) return;
      opts.onImport(fresh);
      DFOut.close();
      opts.onDone && opts.onDone(`Imported ${fresh.length} lead${fresh.length === 1 ? '' : 's'}${dupes.length ? `; skipped ${dupes.length} already in the pipeline` : ''}`);
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .dfi-map{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 0.75rem}
    .dfi-summary{margin:0.75rem 0 0.25rem;font-size:0.88rem}
    .dfi-preview{margin:0;padding-left:1.1rem;font-size:0.8rem;color:var(--gray,#9aa39c)}
    @media (max-width:600px){.dfi-map{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  window.DFImport = { open, guess, toLeads, dedupe, FIELDS };
})();
