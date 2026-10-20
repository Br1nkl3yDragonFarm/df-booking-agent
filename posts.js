// ============================================================
//  DRAGON FARM CRM — SOCIAL POSTS FOR A BOOKED SHOW
//
//  "📣 Posts" on a booked show: the drafts Claude wrote announcing it
//  (netlify/lib/social.mjs), ready to copy, tweak and post: Instagram,
//  Facebook, story text, a short post for X / Threads / TikTok, and a
//  "tonight" post for the day of the show. Edits are saved for the whole
//  team, and each one can be ticked off once it's posted.
//  Nothing is ever posted automatically.
//
//  Usage: DFPosts.open(lead). Needs crm-store.js (passcode) and outreach.js (DFOut).
// ============================================================

(function () {
  const API = '/.netlify/functions/social';
  const START = '/.netlify/functions/social-background';
  const POLL_MS = 3000;
  const POLL_MAX = 60;
  const CHANNELS = [
    ['instagram', 'Instagram post', 'Post it with a photo or flyer. Put the Shows page in your bio so “link in bio” works.', 2200, true],
    ['facebook', 'Facebook post', '', 3000, true],
    ['story', 'Story text', 'Lay it over a photo or video in your story; add a link sticker to the tickets.', 120, false],
    ['short', 'X / Threads / TikTok', '', 280, false],
    ['dayOf', 'Day of the show', 'Post on the day: “Tonight…”', 2200, true]
  ];

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const day = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

  async function call(url, init) {
    const go = () => fetch(url, { ...(init || {}), headers: { 'Content-Type': 'application/json', 'x-df-passcode': DFStore.passcode() } });
    let res = await go();
    if (res.status === 401 && DFStore.askPasscode()) res = await go();
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }

  let current = null; // { lead, box, timer, saveTimer, data }

  function open(lead) {
    stop();
    const box = DFOut.show(`
      <div class="dfo-head"><h3>📣 Posts · ${esc(lead.name)}${lead.eventDate ? ' · ' + esc(day(lead.eventDate)) : ''}</h3><button class="dfo-x" data-a="close" aria-label="Close">×</button></div>
      <div class="dfo-body" data-k="body"><p class="dfo-muted">Loading…</p></div>
      <div class="dfo-actions" data-k="actions"></div>`);
    box.querySelector('[data-a="close"]').addEventListener('click', () => { stop(); DFOut.close(); });
    current = { lead, box };
    load();
  }

  function stop() {
    if (current) { clearTimeout(current.timer); flush(); }
    current = null;
  }

  async function load(polls = 0) {
    const me = current;
    if (!me) return;
    let r;
    try { r = await call(`${API}?id=${encodeURIComponent(me.lead.id)}`); } catch { r = { status: 0, data: {} }; }
    if (current !== me) return;
    if (r.status !== 200) return render({ status: 'error', message: r.status === 401 ? 'Enter the passcode to see the posts.' : 'Couldn’t load the posts. Check the connection.' });
    me.data = r.data;
    render(r.data);
    if (r.data.status === 'running' && polls < POLL_MAX) me.timer = setTimeout(() => load(polls + 1), POLL_MS);
    else if (r.data.status === 'running') render({ status: 'error', message: 'This is taking longer than usual. Close this and look again in a minute.' });
  }

  async function write() {
    const me = current;
    render({ status: 'running' });
    let r;
    try { r = await call(START, { method: 'POST', body: JSON.stringify({ id: me.lead.id }) }); } catch { r = { status: 0 }; }
    if (current !== me) return;
    if (r.status >= 400 || r.status === 0) return render({ status: 'error', message: r.status === 401 ? 'Enter the passcode first.' : 'Couldn’t start writing the posts. Try again.' });
    me.timer = setTimeout(() => load(), 1500);
  }

  function render(d) {
    const body = current.box.querySelector('[data-k="body"]');
    const actions = current.box.querySelector('[data-k="actions"]');
    const lead = current.lead;
    if (d.status === 'none' || !d.status) {
      const ready = lead.status === 'booked' && lead.eventDate && lead.type !== 'Private Event' && !lead.unlisted;
      body.innerHTML = `<p>No posts yet for this show.</p><p class="dfo-muted">${ready
        ? 'Claude drafts an Instagram post, a Facebook post, story text, a short post for X / Threads / TikTok and a day-of post, from the show’s date, venue, times and ticket link. Add the ticket link first (Public Shows page section) so the posts include it.'
        : lead.type === 'Private Event' ? 'Private events aren’t announced publicly.' : 'Mark the show Booked with a date first.'}</p>`;
      actions.innerHTML = ready ? '<button class="btn btn-gold" data-a="write">Write posts</button>' : '';
    } else if (d.status === 'running') {
      body.innerHTML = '<p>✍️ Writing the posts… this takes about half a minute.</p>';
      actions.innerHTML = '';
    } else if (d.status === 'error') {
      body.innerHTML = `<p class="dfp-warn">${esc(d.message || 'Something went wrong.')}</p>`;
      actions.innerHTML = '<button class="btn btn-gold" data-a="write">Try again</button>';
    } else {
      const tags = (d.hashtags || []).join(' ');
      const changed = d.show && (d.show.date !== lead.eventDate || (lead.ticketUrl || '') !== (d.show.tickets || ''));
      body.innerHTML = `
        ${changed ? '<p class="dfp-warn">The show’s date or ticket link changed since these were written. Rewrite them, or fix the text by hand.</p>' : ''}
        ${CHANNELS.map(([k, label, tip, max, withTags]) => `
          <div class="dfp-post${d.posted && d.posted[k] ? ' dfp-done' : ''}" data-ch="${k}">
            <div class="dfp-top"><b>${label}</b><span class="dfp-count" data-count="${k}"></span></div>
            ${tip ? `<p class="dfo-muted">${esc(tip)}</p>` : ''}
            <textarea rows="${k === 'story' || k === 'short' ? 3 : 6}" data-post="${k}" aria-label="${label}">${esc(d.posts[k])}</textarea>
            <div class="dfp-row">
              <button class="btn btn-ghost" data-copy="${k}">Copy${withTags && tags ? ' with hashtags' : ''}</button>
              <label class="dfo-check"><input type="checkbox" data-posted="${k}"${d.posted && d.posted[k] ? ' checked' : ''} /> Posted</label>
            </div>
          </div>`).join('')}
        ${tags ? `<div class="dfp-post"><div class="dfp-top"><b>Hashtags</b></div><p class="dfp-tags">${esc(tags)}</p><div class="dfp-row"><button class="btn btn-ghost" data-copy="hashtags">Copy hashtags</button></div></div>` : ''}
        <p class="dfo-status" data-k="saved"></p>`;
      actions.innerHTML = '<button class="btn btn-ghost" data-a="rewrite">Rewrite all</button>';
      CHANNELS.forEach(([k, , , max]) => count(k, max));
    }
    wire(d);
  }

  function count(k, max) {
    const ta = current.box.querySelector(`[data-post="${k}"]`);
    const el = current.box.querySelector(`[data-count="${k}"]`);
    if (!ta || !el) return;
    el.textContent = `${ta.value.length} / ${max}`;
    el.classList.toggle('dfp-over', ta.value.length > max);
  }

  function flush() {
    if (!current || !current.saveTimer) return;
    clearTimeout(current.saveTimer);
    current.saveTimer = null;
    save();
  }
  async function save() {
    const me = current;
    if (!me || !me.data || me.data.status !== 'done') return;
    const posts = {};
    me.box.querySelectorAll('[data-post]').forEach(t => { posts[t.dataset.post] = t.value; });
    const r = await call(API, { method: 'POST', body: JSON.stringify({ id: me.lead.id, posts }) }).catch(() => ({ status: 0 }));
    const el = me.box.querySelector('[data-k="saved"]');
    if (r.status === 200) { me.data = r.data; if (el) { el.className = 'dfo-status dfo-ok'; el.textContent = 'Edits saved.'; } }
    else if (el) { el.className = 'dfo-status dfo-err'; el.textContent = 'Couldn’t save the edits. Copy them somewhere safe.'; }
  }

  function wire(d) {
    const box = current.box;
    box.querySelectorAll('[data-a="write"]').forEach(b => b.addEventListener('click', write));
    const rewrite = box.querySelector('[data-a="rewrite"]');
    if (rewrite) rewrite.addEventListener('click', () => {
      if (rewrite.dataset.sure) return write();
      rewrite.dataset.sure = '1';
      rewrite.textContent = 'Replace all drafts and edits? Click again';
    });
    box.querySelectorAll('[data-post]').forEach(t => t.addEventListener('input', () => {
      const ch = CHANNELS.find(c => c[0] === t.dataset.post);
      count(ch[0], ch[3]);
      clearTimeout(current.saveTimer);
      current.saveTimer = setTimeout(() => { current.saveTimer = null; save(); }, 1200);
    }));
    box.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const k = b.dataset.copy;
      const tags = (d.hashtags || []).join(' ');
      const ch = CHANNELS.find(c => c[0] === k);
      const text = k === 'hashtags' ? tags : box.querySelector(`[data-post="${k}"]`).value + (ch && ch[4] && tags ? '\n\n' + tags : '');
      const label = b.textContent;
      try { await navigator.clipboard.writeText(text); b.textContent = 'Copied ✓'; } catch { b.textContent = 'Couldn’t copy'; }
      setTimeout(() => { b.textContent = label; }, 1500);
    }));
    box.querySelectorAll('[data-posted]').forEach(c => c.addEventListener('change', async () => {
      flush();
      c.closest('.dfp-post').classList.toggle('dfp-done', c.checked);
      const r = await call(API, { method: 'POST', body: JSON.stringify({ id: current.lead.id, posted: c.dataset.posted, done: c.checked }) }).catch(() => ({ status: 0 }));
      if (r.status === 200) current.data = r.data;
    }));
  }

  const style = document.createElement('style');
  style.textContent = `
    .dfp-post{border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:var(--r,8px);padding:0.75rem;display:flex;flex-direction:column;gap:0.45rem}
    .dfp-post.dfp-done{opacity:0.6}
    .dfp-top{display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem}
    .dfp-top b{font-weight:500}
    .dfp-count{font-size:0.72rem;color:var(--gray,#9aa39c);font-variant-numeric:tabular-nums}
    .dfp-count.dfp-over{color:#ff8a80}
    .dfp-post textarea{background:var(--surface,#0e1517);border:1px solid var(--border2,rgba(255,255,255,0.14));border-radius:var(--r,8px);padding:0.55rem 0.7rem;color:var(--cream,#e8dfc8);font:inherit;font-size:0.88rem;line-height:1.5;width:100%;box-sizing:border-box;resize:vertical}
    .dfp-row{display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap}
    .dfp-warn{margin:0;font-size:0.84rem;line-height:1.45;color:#ff8a80;flex-shrink:0}
    .dfp-post{flex-shrink:0}
    .dfp-tags{margin:0;font-size:0.85rem;color:var(--gray-light,#c9c2ae)}`;
  document.head.appendChild(style);

  window.DFPosts = { open };
})();
