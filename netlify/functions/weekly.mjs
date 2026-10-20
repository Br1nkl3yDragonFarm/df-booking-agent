// ============================================================
//  DRAGON FARM — WEEKLY SEARCHES (settings)
//
//  GET                          passcode: saved searches, the last run, and
//                               where the Monday digest goes
//  POST {action:'add', query, label}   save a finder search to run every Monday
//  POST {action:'remove', id}
//  POST {action:'run'}          run the saved searches and the digest now
//  POST {action:'digest'}       send just the digest now (to try it out)
// ============================================================

import { buildDigest, digestTo, sendDigest } from '../lib/digest.mjs';
import { readQuery } from '../lib/finder.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { activityStore, clean, json, labelToday, readList, updateJSON } from '../lib/store.mjs';
import { MAX_WEEKLY, weeklyStore } from '../lib/weekly.mjs';

const setup = () => ({ email: !!process.env.RESEND_API_KEY, to: digestTo().join(', '), discord: !!process.env.DISCORD_WEBHOOK_URL });
const sameQuery = (a, b) => ['mode', 'location', 'artist', 'similar', 'count'].every(k => String(a[k]) === String(b[k]))
  && [...a.categories].sort().join() === [...b.categories].sort().join();

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  const store = weeklyStore();
  if (req.method === 'GET') {
    const [searches, lastRun] = await Promise.all([store.get('searches', { type: 'json' }), store.get('lastRun', { type: 'json' })]);
    return json(200, { searches: searches || [], lastRun: lastRun || null, setup: setup() });
  }
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }

  if (body.action === 'add') {
    // Specific dates don't make sense week after week.
    const { q, problem } = readQuery({ ...(body.query || {}), dates: '' });
    if (problem) return json(400, { error: problem });
    let error = '';
    const searches = await updateJSON(store, 'searches', saved => {
      const list = saved || [];
      if (list.some(s => sameQuery(s, q))) { error = 'That search already runs every Monday.'; return undefined; }
      if (list.length >= MAX_WEEKLY) { error = `You can keep up to ${MAX_WEEKLY} weekly searches. Remove one first.`; return undefined; }
      return [...list, { id: crypto.randomUUID(), label: clean(body.label, 140) || q.location || 'Weekly search', ...q, createdAt: new Date().toISOString() }];
    });
    return error ? json(409, { error, searches }) : json(200, { searches });
  }
  if (body.action === 'remove') {
    const id = clean(body.id, 64);
    const searches = await updateJSON(store, 'searches', saved => (saved || []).filter(s => s.id !== id));
    return json(200, { searches });
  }
  if (body.action === 'run') {
    const res = await fetch(new URL('/.netlify/functions/weekly-background', req.url), {
      method: 'POST', headers: { 'x-df-passcode': process.env.DF_CRM_PASSCODE, 'Content-Type': 'application/json' }, body: '{}'
    }).catch(() => null);
    return res && (res.ok || res.status === 202) ? json(202, { started: true }) : json(502, { error: 'Couldn’t start the weekly run. Try again in a minute.' });
  }
  if (body.action === 'digest') {
    const s = setup();
    if (!s.email && !s.discord) return json(503, { error: 'Set up Resend (RESEND_API_KEY) or a Discord webhook (DISCORD_WEBHOOK_URL) in Netlify first.' });
    const [venue, sync, brand, activity] = await Promise.all([readList('venue'), readList('sync'), readList('brand'), activityStore().get('leads', { type: 'json' })]);
    const digest = buildDigest({ venue, sync, brand, activity: activity || {}, today: labelToday(), siteUrl: process.env.URL || new URL(req.url).origin });
    return json(200, { sent: await sendDigest(digest), digest });
  }
  return json(400, { error: 'Unknown action' });
};
