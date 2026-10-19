// ============================================================
//  DRAGON FARM — WEEKLY SEARCHES (background run)
//
//  Runs every saved weekly search (started by weekly-run.mjs on Monday
//  mornings, or "Run now" on the finder), adds the places that aren't
//  already in a pipeline as new leads due today, then sends the Monday
//  digest. Each lead it adds is marked auto, so the report can tell how
//  automatic searches do.
// ============================================================

import { buildDigest, sendDigest } from '../lib/digest.mjs';
import { MODES, alreadyListed, readQuery, runSearch, toLead } from '../lib/finder.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { activityStore, crmStore, labelToday, readList, updateJSON } from '../lib/store.mjs';
import { weeklyStore } from '../lib/weekly.mjs';

export const config = { background: true };

const STALE_MS = 20 * 60 * 1000; // a run that started longer ago than this has died

function niceDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function addLeads(list, results, q, today, label) {
  let added = 0;
  await updateJSON(crmStore(), list, saved => {
    const items = saved?.items || [];
    const fresh = [];
    for (const r of results) {
      if (alreadyListed(r, [...items, ...fresh])) continue;
      fresh.push({ ...toLead(r, q, today, `Weekly search (${label}), ${niceDay(today)}`), id: 'wk-' + crypto.randomUUID().slice(0, 13), auto: true });
    }
    added = fresh.length;
    return fresh.length ? { items: [...items, ...fresh], updatedAt: new Date().toISOString() } : undefined;
  });
  return added;
}

export default async (req) => {
  // Background functions retry on a thrown error, so failures are recorded instead.
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return new Response('', { status: 401 });
  const store = weeklyStore();
  const startedAt = new Date().toISOString();
  let running = false;
  await updateJSON(store, 'lastRun', last => {
    if (last?.status === 'running' && Date.now() - Date.parse(last.startedAt) < STALE_MS) { running = true; return undefined; }
    return { ...(last || {}), status: 'running', startedAt };
  });
  if (running) return new Response('Already running');

  const today = labelToday();
  const searches = (await store.get('searches', { type: 'json' })) || [];
  const outcomes = await Promise.all(searches.map(async s => {
    const { q, problem } = readQuery(s);
    if (problem) return { id: s.id, label: s.label, mode: q.mode, found: 0, added: 0, error: problem };
    try {
      const { results } = await runSearch(q, MODES[q.mode]);
      const added = await addLeads(q.mode === 'sync' ? 'sync' : 'venue', results, q, today, s.label);
      return { id: s.id, label: s.label, mode: q.mode, found: results.length, added };
    } catch (err) {
      return { id: s.id, label: s.label, mode: q.mode, found: 0, added: 0, error: String(err.message || 'The search failed').slice(0, 200) };
    }
  }));

  let sent = { email: 'off', discord: 'off' };
  try {
    const [venue, sync, activity] = await Promise.all([readList('venue'), readList('sync'), activityStore().get('leads', { type: 'json' })]);
    const digest = buildDigest({ venue, sync, activity: activity || {}, today, added: outcomes, siteUrl: process.env.URL || new URL(req.url).origin });
    sent = await sendDigest(digest);
  } catch (err) {
    sent = { email: String(err.message || 'failed'), discord: 'off' };
  }
  await store.setJSON('lastRun', {
    status: 'done', startedAt, finishedAt: new Date().toISOString(),
    searches: outcomes, added: outcomes.reduce((n, o) => n + o.added, 0), digest: sent
  });
  return new Response('Done');
};
