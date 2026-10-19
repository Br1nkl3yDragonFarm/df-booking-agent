// ============================================================
//  DRAGON FARM CRM — SHARED LEAD STORE (browser side)
//
//  Each page keeps working from its browser copy of the leads,
//  and this file syncs that copy with the Netlify "crm" function
//  so the pipelines match on every device.
//
//  Usage on a page:
//    DFStore.connect('df_leads', items => { leads = items; render(); });
//    DFStore.save('df_leads', leads);   // after every change
// ============================================================

(function () {
  const ENDPOINT = '/.netlify/functions/crm';
  const LISTS = { df_leads: 'venue', df_sync_leads: 'sync', df_brand_leads: 'brand' };
  const PASS_KEY = 'df_crm_passcode';
  const ASKED_KEY = 'df_crm_passcode_asked';
  const MERGED_PREFIX = 'df_crm_merged_';
  const DIRTY_PREFIX = 'df_crm_dirty_';

  let mode = 'checking'; // 'checking' | 'cloud' | 'local' | 'locked'
  const listeners = {};  // key -> onChange(items)
  const latest = {};     // key -> newest items handed to save()
  const synced = {};     // key -> Map(id -> JSON string) as last seen on the server
  const queue = {};      // key -> promise chain of pushes
  const pending = {};    // key -> a push is queued but not started

  // Older versions of agent.html saved fields under short names (cname,
  // cemail...). Rename them to the names every page now uses.
  const RENAMES = {
    df_leads: { cname: 'contactName', cemail: 'contactEmail', cphone: 'contactPhone', added: 'dateAdded' },
    df_sync_leads: { cname: 'contact', cemail: 'email', cat: 'category', added: 'dateAdded' },
    df_brand_leads: {}
  };
  function normalize(key, items) {
    return items.map(item => {
      let out = item;
      for (const [from, to] of Object.entries(RENAMES[key])) {
        if (!(from in item)) continue;
        if (out === item) out = { ...item };
        if (!out[to]) out[to] = item[from];
        delete out[from];
      }
      return out;
    });
  }

  function readLocal(key) {
    try { return normalize(key, JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return []; }
  }
  function writeLocal(key, items) {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch {}
  }
  function snapshot(items) {
    return new Map(items.map(item => [item.id, JSON.stringify(item)]));
  }
  function passcode() {
    try { return localStorage.getItem(PASS_KEY) || ''; } catch { return ''; }
  }

  async function api(method, params, body) {
    const res = await fetch(ENDPOINT + (params || ''), {
      method,
      headers: { 'Content-Type': 'application/json', 'x-df-passcode': passcode() },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // ---- STATUS PILL ----
  function setMode(next) {
    mode = next;
    let pill = document.getElementById('df-sync-pill');
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'df-sync-pill';
      pill.type = 'button';
      pill.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;border-radius:999px;padding:5px 12px;font:500 12px/1.4 system-ui,sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,0.15);background:#131c1e;color:#e8dfc8;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
      pill.addEventListener('click', onPillClick);
      document.body.appendChild(pill);
    }
    const labels = {
      checking: '⏳ Connecting…',
      cloud: '☁️ Synced across devices',
      local: '💾 This device only',
      locked: '🔒 Enter passcode to sync'
    };
    pill.textContent = labels[mode];
    pill.title = mode === 'cloud'
      ? 'Leads are saved online. Click to sync now.'
      : mode === 'local'
        ? 'Online storage is not reachable, so leads are only saved in this browser. Click to try again.'
        : mode === 'locked' ? 'Click to enter the CRM passcode.' : '';
  }

  function onPillClick() {
    if (mode === 'locked') askPasscode(true);
    else if (mode !== 'checking') refreshAll();
  }

  function askPasscode(force) {
    if (!force) {
      try { if (sessionStorage.getItem(ASKED_KEY)) return false; sessionStorage.setItem(ASKED_KEY, '1'); } catch {}
    }
    const entered = prompt('Enter the Dragon Farm CRM passcode to sync leads across your devices:');
    if (!entered) return false;
    try { localStorage.setItem(PASS_KEY, entered.trim()); } catch {}
    Object.keys(listeners).forEach(start);
    return true;
  }

  // ---- LOAD ----
  async function start(key) {
    const list = LISTS[key];
    setMode('checking');
    let res;
    try { res = await api('GET', '?list=' + list); }
    catch { setMode('local'); return; }

    if (res.status === 401) {
      setMode('locked');
      askPasscode(false);
      return;
    }
    if (res.status !== 200) { setMode('local'); return; }

    const onServer = snapshot(res.data.items || []);
    let items = normalize(key, res.data.items || []);
    synced[key] = onServer;
    setMode('cloud');

    // Re-save online leads whose old field names were just renamed.
    const upserts = new Map();
    items.forEach(item => { if (onServer.get(item.id) !== JSON.stringify(item)) upserts.set(item.id, item); });

    // Upload leads that only this browser has: everything it saved before
    // cloud sync existed, plus anything changed while it was offline.
    let needsUpload = true;
    try { needsUpload = !localStorage.getItem(MERGED_PREFIX + key) || !!localStorage.getItem(DIRTY_PREFIX + key); } catch {}
    if (needsUpload) {
      readLocal(key)
        .map(item => item.id ? item : { ...item, id: Date.now().toString() + Math.random() })
        .filter(item => onServer.get(item.id) !== JSON.stringify(item))
        .forEach(item => upserts.set(item.id, item));
    }
    if (upserts.size) {
      try {
        const up = await api('POST', '', { list, upserts: [...upserts.values()], deletes: [] });
        if (up.status !== 200) { setMode('local'); return; }
        items = up.data.items;
      } catch { setMode('local'); return; }
      synced[key] = snapshot(items);
    }
    if (needsUpload) {
      try {
        localStorage.setItem(MERGED_PREFIX + key, new Date().toISOString());
        localStorage.removeItem(DIRTY_PREFIX + key);
      } catch {}
    }

    latest[key] = items;
    writeLocal(key, items);
    if (listeners[key]) listeners[key](items);
  }

  function refreshAll() {
    Object.keys(listeners).forEach(key => { if (!pending[key]) start(key); });
  }

  // ---- SAVE ----
  async function push(key) {
    const items = latest[key] || [];
    const before = synced[key] || new Map();
    const ids = new Set(items.map(item => item.id));
    const upserts = items.filter(item => before.get(item.id) !== JSON.stringify(item));
    const deletes = [...before.keys()].filter(id => !ids.has(id));
    if (!upserts.length && !deletes.length) return;

    // If the upload fails, flag it so the next successful connect sends it.
    const failed = next => {
      try { localStorage.setItem(DIRTY_PREFIX + key, '1'); } catch {}
      setMode(next);
    };
    let res;
    try { res = await api('POST', '', { list: LISTS[key], upserts, deletes }); }
    catch { failed('local'); return; }
    if (res.status === 401) { failed('locked'); return; }
    if (res.status !== 200) { failed('local'); return; }

    synced[key] = snapshot(res.data.items);
    setMode('cloud');
    // Show leads added on other devices, unless more local edits are waiting to go up.
    if (!pending[key]) {
      latest[key] = res.data.items;
      writeLocal(key, res.data.items);
      if (listeners[key]) listeners[key](res.data.items);
    }
  }

  window.DFStore = {
    load(key) { return readLocal(key); },

    // The AI tools use the same passcode; they send it with passcode() and
    // call askPasscode() when the server turns them away.
    passcode,
    askPasscode() { return askPasscode(true); },

    connect(key, onChange) {
      if (!LISTS[key]) throw new Error('Unknown CRM list: ' + key);
      listeners[key] = onChange;
      start(key);
    },

    save(key, items) {
      latest[key] = items;
      writeLocal(key, items);
      if (mode !== 'cloud' || !synced[key]) {
        // Not connected yet: remember to upload this browser's copy once it is.
        try { localStorage.setItem(DIRTY_PREFIX + key, '1'); } catch {}
        return;
      }
      if (pending[key]) return;
      pending[key] = true;
      queue[key] = (queue[key] || Promise.resolve()).then(() => {
        pending[key] = false;
        return push(key);
      });
    }
  };

  // Pick up changes made on another device when this tab comes back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (mode === 'cloud' || mode === 'local')) refreshAll();
  });
})();
