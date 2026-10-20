// ============================================================
//  DRAGON FARM CRM — SYNC KIT
//
//  What the sync page needs to price, license and send a placement:
//    · Quote: a starting fee range for each kind of placement, from the
//      label's sync playbook (micro-sync ~$500, podcast theme ~$2,000,
//      streaming-series scene ~$5,000, network TV $15,000+, national ads
//      far more), adjusted for how the song is used, term, territory and
//      exclusivity. Saved on the lead as lead.quote, with lead.fee.
//    · One-stop license: a printable sync + master use license filled in
//      from the lead and the quote. A template to discuss; have a music
//      attorney look it over before the first one goes out.
//    · Versions: links to the full mix, clean, instrumental, edits and
//      stems, plus metadata, kept on the server (catalog.mjs) so any
//      device can attach them to a pitch.
//    · Pitch log: every sync email sent, which song and versions went to
//      whom, and whether they answered.
//
//  Needs outreach.js (DFOut) for the modal, sending and activity.
// ============================================================

(function () {
  const CATALOG = '/.netlify/functions/catalog';
  const LABEL = { name: 'Dragon Farm Records', place: 'Nashville, TN', email: 'booking@dragonfarm.net' };

  const TRACKS = [
    { title: 'Mr. Iron Man (Live)', artist: 'Timothy Chance and Rasta Country', isrc: 'QM6N22632890', upc: '820200992949', genre: 'Country reggae' }
  ];

  const VERSIONS = [
    ['main', 'Full mix'], ['clean', 'Clean (no explicit lyrics)'], ['instrumental', 'Instrumental'],
    ['edit60', '60-second edit'], ['edit30', '30-second edit'], ['stems', 'Stems']
  ];
  const META = [['bpm', 'BPM'], ['key', 'Key'], ['mood', 'Mood tags'], ['writers', 'Writers (and splits)'], ['publisher', 'Publisher'], ['pro', 'PRO']];

  // All-in one-stop fee (master + sync), non-exclusive, background use, 1 year, US.
  const USES = [
    ['micro', 'Social, YouTube or small online use', 250, 1000],
    ['podcast', 'Podcast theme or recurring series use', 1500, 3000],
    ['indie', 'Indie or festival film', 500, 2500],
    ['doc', 'Documentary', 1000, 5000],
    ['streaming', 'Streaming series scene', 3000, 7500],
    ['network', 'Network TV scene', 10000, 25000],
    ['game', 'Video game', 2000, 10000],
    ['trailer', 'Trailer or promo', 5000, 25000],
    ['adlocal', 'Regional or online ad campaign', 5000, 20000],
    ['adnational', 'National TV ad', 25000, 100000]
  ];
  const BY_CATEGORY = {
    'Film': 'indie', 'TV Series': 'network', 'Streaming Show': 'streaming', 'Video Game': 'game', 'Advertisement': 'adlocal',
    'Brand Campaign': 'adlocal', 'Documentary': 'doc', 'Trailer': 'trailer', 'Creator / Podcast': 'micro', 'YouTube / Digital': 'micro'
  };
  const USAGE = [['background', 'Background (under dialogue)', 1], ['featured', 'Featured (song is the focus)', 1.5], ['theme', 'Theme, opening or closing', 2]];
  const TERMS = [['1 year', '1 year', 1], ['3 years', '3 years', 1.25], ['in perpetuity', 'In perpetuity', 1.5]];
  const TERRITORIES = [['the United States', 'United States', 1], ['the world', 'Worldwide', 1.25]];
  const EXCLUSIVITY = [['non-exclusive', 'Non-exclusive (we can license it to others)', 1], ['exclusive', 'Exclusive (only they can use it)', 2]];

  let catalog = { tracks: {} };
  let loaded = null;

  // ---- helpers ----
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const pick = (list, key) => list.find(x => x[0] === key) || list[0];
  const opts = (list, sel) => list.map(([k, label]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const roundTo = (n, step) => Math.round(n / step) * step;
  const trackOf = lead => TRACKS.find(t => (lead?.track || '').includes(t.title)) || TRACKS[0];
  const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  async function call(init) {
    const go = () => fetch(CATALOG, { ...(init || {}), headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode() } });
    let res = await go();
    if (res.status === 401 && DFStore.askPasscode()) res = await go();
    return res;
  }

  function load() {
    if (!loaded) loaded = call().then(r => r.ok ? r.json() : null).then(d => { if (d?.catalog) catalog = d.catalog; return catalog; }).catch(() => catalog);
    return loaded;
  }
  const info = title => catalog.tracks?.[title] || { links: {} };

  // ---- quote ----
  function quote(q) {
    const use = pick(USES, q.use);
    const factor = pick(USAGE, q.usage)[2] * pick(TERMS, q.term)[2] * pick(TERRITORIES, q.territory)[2] * pick(EXCLUSIVITY, q.exclusivity)[2];
    const step = use[3] * factor >= 20000 ? 1000 : 250;
    const low = roundTo(use[2] * factor, step), high = roundTo(use[3] * factor, step);
    return { low, high };
  }

  function quoteFor(lead) {
    return { use: BY_CATEGORY[lead.category] || 'indie', usage: 'background', term: '1 year', territory: 'the United States', exclusivity: 'non-exclusive', fee: '', ...(lead.quote || {}) };
  }

  function quoteText(lead, q) {
    const t = trackOf(lead);
    return `Hi ${(lead.contact || '').split(/[\s(]/)[0] || 'there'},\n\nHere's our quote for "${t.title}" by ${t.artist}${lead.project ? ` in ${lead.project}` : ''}:\n\n` +
      `Use: ${pick(USES, q.use)[1]}, ${pick(USAGE, q.usage)[1].toLowerCase()}\nTerm: ${pick(TERMS, q.term)[1]}\nTerritory: ${pick(TERRITORIES, q.territory)[1]}\n${pick(EXCLUSIVITY, q.exclusivity)[1].split(' (')[0]}\n` +
      `Fee: ${money(q.fee)}, all-in for master and sync (one-stop: we clear both sides in one license)\n\n` +
      `Clean and instrumental versions are available. Happy to send the license as soon as this works for you.\n\n${LABEL.name}\n${LABEL.email}`;
  }

  // onSave(updatedLead) stores the quote on the lead.
  function openQuote(lead, onSave) {
    let q = quoteFor(lead);
    const box = DFOut.show(`
      <div class="dfo-head"><h3>Quote · ${esc(lead.name)}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <label class="dfo-field"><span>Kind of placement</span><select data-k="use">${opts(USES, q.use)}</select></label>
        <div class="dfo-row">
          <label class="dfo-field"><span>How it's used</span><select data-k="usage">${opts(USAGE, q.usage)}</select></label>
          <label class="dfo-field"><span>Term</span><select data-k="term">${opts(TERMS, q.term)}</select></label>
        </div>
        <div class="dfo-row">
          <label class="dfo-field"><span>Territory</span><select data-k="territory">${opts(TERRITORIES, q.territory)}</select></label>
          <label class="dfo-field"><span>Exclusivity</span><select data-k="exclusivity">${opts(EXCLUSIVITY, q.exclusivity)}</select></label>
        </div>
        <div class="dsk-range" data-k="range"></div>
        <label class="dfo-field"><span>Fee to quote ($)</span><input type="number" min="0" step="50" inputmode="decimal" data-k="fee" /></label>
        <div class="dfo-note">Ranges are starting points from the label's sync playbook for an all-in, one-stop fee (master and sync together), usually split 50/50 between the master and publishing sides. Ask their budget first; it's often higher. Prefer non-exclusive unless the check is serious.</div>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions">
        <button class="btn btn-gold" data-a="save">Save on lead</button>
        <button class="btn btn-ghost" data-a="email">✉ Email the quote</button>
        <button class="btn btn-ghost" data-a="license">📄 License</button>
      </div>`);
    const $ = k => box.querySelector(`[data-k="${k}"]`);
    const status = (msg, kind) => { $('status').className = 'dfo-status' + (kind ? ' dfo-' + kind : ''); $('status').textContent = msg; };
    const read = () => ({ use: $('use').value, usage: $('usage').value, term: $('term').value, territory: $('territory').value, exclusivity: $('exclusivity').value, fee: Number($('fee').value) || 0 });
    let touched = !!q.fee;
    function update() {
      const cur = read(), r = quote(cur);
      if (!touched) $('fee').value = r.high;
      const fee = Number($('fee').value) || 0;
      $('range').innerHTML = `Starting range <b>${money(r.low)} – ${money(r.high)}</b>${fee ? ` · at ${money(fee)}: ${money(fee / 2)} master + ${money(fee / 2)} publishing` : ''}`;
    }
    $('fee').value = q.fee || '';
    ['use', 'usage', 'term', 'territory', 'exclusivity'].forEach(k => $(k).addEventListener('change', update));
    $('fee').addEventListener('input', () => { touched = true; update(); });
    update();
    const save = () => {
      q = read();
      if (!q.fee) { status('Enter the fee to quote.', 'err'); return null; }
      const saved = { ...lead, quote: { ...q, at: new Date().toISOString() }, fee: `${money(q.fee)} (quoted)` };
      onSave && onSave(saved);
      return saved;
    };
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);
    box.querySelector('[data-a="save"]').addEventListener('click', () => { if (save()) status('Saved on the lead ✓', 'ok'); });
    box.querySelector('[data-a="email"]').addEventListener('click', () => {
      const saved = save();
      if (saved) DFOut.send({ subject: `Quote: "${trackOf(saved).title}"${saved.project ? ` for ${saved.project}` : ''}`, body: quoteText(saved, saved.quote), kind: 'other', lead: saved });
    });
    box.querySelector('[data-a="license"]').addEventListener('click', async () => {
      const saved = save();
      if (saved) openLicense(saved);
    });
  }

  // ---- one-stop license ----
  function licenseHtml(lead, q, own) {
    const t = trackOf(lead), meta = info(t.title);
    const blank = '<span class="blank"></span>';
    const v = s => s ? esc(s) : blank;
    const rows = [
      ['Licensor', `${LABEL.name}, ${LABEL.place} (${LABEL.email})`],
      ['Licensee', [lead.name, lead.contact].filter(Boolean).join(', ')],
      ['Composition and master', `"${t.title}" performed by ${t.artist}. ISRC ${t.isrc}, UPC ${t.upc}`],
      ['Writers / publisher / PRO', [meta.writers, meta.publisher, meta.pro].filter(Boolean).join(' · ')],
      ['Production', [lead.project, lead.category].filter(Boolean).join(', ')],
      ['Use', `${pick(USES, q.use)[1]}; ${pick(USAGE, q.usage)[1].toLowerCase()}`],
      ['Timing', ''],
      ['Term', pick(TERMS, q.term)[1]],
      ['Territory', pick(TERRITORIES, q.territory)[1]],
      ['Exclusivity', pick(EXCLUSIVITY, q.exclusivity)[1].split(' (')[0]],
      ['Fee', q.fee ? `${money(q.fee)} all-in (${money(q.fee / 2)} master use, ${money(q.fee / 2)} synchronization)` : '']
    ];
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>One-stop license · ${esc(t.title)} · ${esc(lead.name)}</title>
<style>body{font:14px/1.55 Georgia,serif;color:#1d2321;margin:0;padding:32px}main{max-width:720px;margin:0 auto}h1{font-size:20px;letter-spacing:.04em;margin:0 0 4px}.muted{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:7px 8px;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{width:34%;color:#555}
ol{padding-left:20px}li{margin:6px 0}.blank{display:inline-block;min-width:220px;border-bottom:1px solid #999;height:1em}.sig{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:36px}.sig div{border-top:1px solid #333;padding-top:6px;font-size:12px}
.draft{background:#fff7e0;border:1px solid #e5c56a;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;margin-bottom:18px}.btn{display:inline-block;margin-top:24px;padding:10px 18px;background:#1d2321;color:#fff;border:0;border-radius:6px;font-size:14px;cursor:pointer}@media print{.btn,.draft{display:none}body{padding:0}}</style></head>
<body><main>
<div class="draft">Template for discussion. Have a music attorney review it before the first one goes out. This note doesn't print.</div>
<h1>SYNCHRONIZATION AND MASTER USE LICENSE (ONE-STOP)</h1><div class="muted">Dated ${esc(today())}</div>
<table>${rows.map(([k, val]) => `<tr><td>${esc(k)}</td><td>${v(val)}</td></tr>`).join('')}</table>
<ol>
<li><b>Grant.</b> Licensor grants Licensee the ${esc(pick(EXCLUSIVITY, q.exclusivity)[0])} right to synchronize the composition and the master recording above in timed relation with the Production, for the Use, Term and Territory above, and to exhibit and distribute the Production with the music in it. No other use (including soundtrack albums, advertising for other products, or changing the lyrics) is granted without a new written license.</li>
<li><b>Rights.</b> ${own
      ? `Licensor represents that it controls 100% of the master recording and 100% of the composition and can grant both rights in this one license.`
      : `Licensor represents that it controls ${blank}% of the master recording and ${blank}% of the composition. Licensee must clear any remaining share with its other owner(s).`}</li>
<li><b>Fee.</b> Licensee pays the Fee within 30 days of signing and before the first public exhibition. The license takes effect on payment.</li>
<li><b>Performance royalties.</b> Licensee will file a cue sheet with the performing rights organizations listing the composition, writers and publisher. Public performance royalties are not part of the Fee and remain with the writers and publisher.</li>
<li><b>Credit.</b> Where credits appear: "${esc(t.title)}" performed by ${esc(t.artist)}, courtesy of ${esc(LABEL.name)}.</li>
<li><b>Edits.</b> Licensee may edit the music for timing only; no remixing or changes to its character without Licensor's written approval.</li>
</ol>
<div class="sig"><div>${esc(LABEL.name)} (Licensor)<br><br>Name, title, date</div><div>${esc(lead.name || 'Licensee')}<br><br>Name, title, date</div></div>
<button class="btn" onclick="print()">Print or save as PDF</button>
</main></body></html>`;
  }

  // The license as plain text, for signing online.
  function licenseText(lead, q, own) {
    const doc = new DOMParser().parseFromString(licenseHtml(lead, q, own), 'text/html');
    const rows = [...doc.querySelectorAll('table tr')].map(tr => `${tr.cells[0].textContent}: ${tr.cells[1].textContent.trim() || '______________'}`);
    const terms = [...doc.querySelectorAll('ol li')].map((li, i) => `${i + 1}. ${li.textContent.replace(/\s+/g, ' ').trim()}`);
    return [...rows, '', ...terms].join('\n');
  }

  async function openLicense(lead) {
    await load();
    const q = { ...quoteFor(lead) };
    const box = DFOut.show(`
      <div class="dfo-head"><h3>One-stop license · ${esc(lead.name)}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body">
        <p class="dfo-muted">Fills in a sync + master use license from this lead${lead.quote ? ' and its quote' : ''}. Blanks are left for anything not on file.</p>
        <label class="dfo-check"><input type="checkbox" data-k="own" /> We control 100% of both the master and the publishing for this song (only tick this if it's true: every writer, co-writer and sample cleared)</label>
        <div class="dfo-status" data-k="status"></div>
      </div>
      <div class="dfo-actions"><button class="btn btn-gold" data-a="print">🖨 Open the license</button>${window.DFSign ? '<button class="btn btn-ghost" data-a="sign">✍ Send for signature</button>' : ''}</div>`);
    box.querySelector('[data-a="close"]').addEventListener('click', DFOut.close);
    box.querySelector('[data-a="sign"]')?.addEventListener('click', () => {
      const own = box.querySelector('[data-k="own"]').checked;
      DFSign.open({ lead, list: 'sync', title: `One-stop license: "${trackOf(lead).title}" for ${lead.project || lead.name}`, text: licenseText(lead, q, own), onChange: openLicense.onChange });
    });
    box.querySelector('[data-a="print"]').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) { box.querySelector('[data-k="status"]').textContent = 'Your browser blocked the window. Allow pop-ups for this site.'; return; }
      w.document.write(licenseHtml(lead, q, box.querySelector('[data-k="own"]').checked));
      w.document.close();
    });
  }

  // ---- versions ----
  function renderVersions(el) {
    load().then(() => {
      el.innerHTML = TRACKS.map(t => {
        const m = info(t.title), links = m.links || {};
        const missing = ['clean', 'instrumental'].filter(k => !links[k]);
        return `<div class="dsk-track" data-track="${esc(t.title)}">
          <div class="dsk-title">${esc(t.title)} <small>${esc(t.artist)} · ISRC ${esc(t.isrc)} · UPC ${esc(t.upc)}</small></div>
          ${missing.length ? `<div class="dsk-warn">⚠ No ${missing.join(' or ')} version on file. Supervisors often need them; without them you lose placements.</div>` : ''}
          <div class="dsk-grid">${VERSIONS.map(([k, label]) => `<label class="dsk-f"><span>${esc(label)}</span><input type="url" data-v="${k}" value="${esc(links[k] || '')}" placeholder="https:// (Dropbox, Drive, DISCO…)" /></label>`).join('')}
          ${META.map(([k, label]) => `<label class="dsk-f"><span>${esc(label)}</span><input type="text" data-m="${k}" value="${esc(m[k] || '')}" /></label>`).join('')}</div>
        </div>`;
      }).join('') + `<div class="dsk-actions"><button class="btn btn-gold" data-a="save-versions">Save versions</button><span class="dsk-status" data-k="vstatus"></span></div>`;
      el.querySelector('[data-a="save-versions"]').addEventListener('click', async () => {
        const st = el.querySelector('[data-k="vstatus"]');
        const tracks = {};
        el.querySelectorAll('.dsk-track').forEach(box => {
          const links = {}, meta = {};
          box.querySelectorAll('[data-v]').forEach(i => { if (i.value.trim()) links[i.dataset.v] = i.value.trim(); });
          box.querySelectorAll('[data-m]').forEach(i => { if (i.value.trim()) meta[i.dataset.m] = i.value.trim(); });
          tracks[box.dataset.track] = { ...meta, links };
        });
        const bad = Object.values(tracks).some(t => Object.values(t.links).some(u => !/^https:\/\//i.test(u)));
        if (bad) { st.textContent = 'Links must start with https://'; st.className = 'dsk-status dsk-err'; return; }
        st.textContent = 'Saving…'; st.className = 'dsk-status';
        let res;
        try { res = await call({ method: 'POST', body: JSON.stringify({ tracks }) }); } catch { res = null; }
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res || !res.ok) { st.textContent = data.error || 'Couldn’t save. Try again.'; st.className = 'dsk-status dsk-err'; return; }
        catalog = data.catalog;
        renderVersions(el);
      });
    });
  }

  // Checkboxes for DFOut.send: one per version on file for the lead's track.
  function extrasFor(lead) {
    const t = trackOf(lead), links = info(t.title).links || {};
    return VERSIONS.filter(([k]) => links[k]).map(([k, label]) => ({
      key: k, label: `Include the ${label.toLowerCase()} link`, text: `${label}: ${links[k]}`, checked: k === 'clean' || k === 'instrumental'
    }));
  }

  // ---- pitch log ----
  function pitchLog(leads) {
    const rows = [];
    leads.forEach(l => {
      const a = DFOut.activity(l);
      (a.sent || []).forEach(s => {
        const reply = (a.replies || []).find(r => r.at > s.at);
        rows.push({ l, s, reply });
      });
    });
    rows.sort((x, y) => y.s.at.localeCompare(x.s.at));
    if (!rows.length) return '<div class="empty-state"><p>No sync emails sent from the tool yet. Every pitch sent with “Review and send” shows up here with the song and versions that went out.</p></div>';
    const STATUS = { new: 'New', pitched: 'Pitched', reviewing: 'Reviewing', followup: 'Follow up', licensed: 'Licensed', passed: 'Passed' };
    return `<div class="table-wrap"><table class="dsk-log"><thead><tr><th>Sent</th><th>To</th><th>Project</th><th>Song</th><th>Versions</th><th>Answer</th><th>Status</th></tr></thead><tbody>${rows.map(({ l, s, reply }) => `
      <tr onclick="editLead('${esc(l.id)}')">
        <td>${esc(new Date(s.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</td>
        <td><b>${esc(l.name)}</b>${l.contact ? `<br><small>${esc(l.contact)}</small>` : ''}<br><small>${esc(s.subject || '')}</small></td>
        <td>${esc(l.project || l.category || '')}</td>
        <td>${esc(s.track || trackOf(l).title)}</td>
        <td>${esc((s.versions || []).map(k => (pick(VERSIONS, k)[1] || k)).join(', ') || '—')}</td>
        <td>${reply ? `💬 ${esc(new Date(reply.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : '—'}</td>
        <td>${esc(STATUS[l.status] || l.status || '')}${l.fee ? `<br><small>${esc(l.fee)}</small>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  const style = document.createElement('style');
  style.textContent = `
    .dsk-range{background:rgba(200,146,42,0.1);border:1px solid rgba(200,146,42,0.35);border-radius:8px;padding:0.6rem 0.8rem;font-size:0.88rem;margin:0.4rem 0 0.6rem}
    .dsk-range b{color:#f0c060;font-weight:600}
    .dsk-track{margin-bottom:1rem}
    .dsk-title{font-weight:600;margin-bottom:0.4rem}
    .dsk-title small{font-weight:400;color:var(--bone-dim,#9aa39c);display:block;font-size:0.78rem}
    .dsk-warn{font-size:0.82rem;color:#f0c060;margin:0 0 0.6rem}
    .dsk-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem 0.8rem}
    .dsk-f{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:0.78rem;color:var(--bone-dim,#9aa39c)}
    .dsk-f input{width:100%;min-width:0}
    .dsk-actions{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap}
    .dsk-status{font-size:0.82rem;color:var(--bone-dim,#9aa39c)}
    .dsk-err{color:#ff8a80}
    .dsk-log{width:100%;border-collapse:collapse;font-size:0.86rem}
    .dsk-log th{text-align:left;font-weight:500;font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--bone-dim,#9aa39c);padding:0.5rem;border-bottom:1px solid var(--scale,rgba(255,255,255,0.14))}
    .dsk-log td{padding:0.55rem 0.5rem;border-bottom:1px solid var(--scale,rgba(255,255,255,0.08));vertical-align:top;cursor:pointer}
    .dsk-log small{color:var(--bone-dim,#9aa39c)}
    @media (max-width:768px){.dsk-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  window.DFSyncKit = { TRACKS, VERSIONS, USES, quote, openQuote, openLicense, licenseHtml, renderVersions, extrasFor, pitchLog, load };
})();
