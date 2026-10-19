// ============================================================
//  DRAGON FARM — PRESS KITS (EPK)
//
//  GET  ?a=tcrc|pnc            public: the artist's press kit as saved
//  GET  ?a=...&r=<lead id>     same, and counts a view for that lead, so
//                              a tracked link in a pitch shows when the
//                              buyer opened it
//  POST {artist, kit}          passcode: save a press kit
// ============================================================

import { getStore } from '@netlify/blobs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { clean, findLeadById, json, recordActivity, updateJSON } from '../lib/store.mjs';

const ARTISTS = ['tcrc', 'pnc'];
const TEXT_FIELDS = { name: 120, genre: 120, tagline: 200, hometown: 120, bio: 4000, photo: 500, draw: 1000, shows: 3000, stage: 2000, contact: 200 };
const LINK_FIELDS = ['videos', 'music', 'socials'];
const MAX_LINKS = 12;
const store = () => getStore({ name: 'df-epk', consistency: 'strong' });

const isHttp = url => /^https:\/\/[^\s"'<>]+$/i.test(url);

function cleanKit(kit) {
  const out = {};
  for (const [key, max] of Object.entries(TEXT_FIELDS)) out[key] = clean(kit?.[key], max);
  if (out.photo && !isHttp(out.photo)) out.photo = '';
  for (const key of LINK_FIELDS) {
    out[key] = (Array.isArray(kit?.[key]) ? kit[key] : [])
      .map(l => ({ label: clean(l?.label, 80), url: clean(l?.url, 500) }))
      .filter(l => isHttp(l.url))
      .slice(0, MAX_LINKS);
  }
  return out;
}

export default async (req) => {
  const url = new URL(req.url);
  const owner = passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE);

  if (req.method === 'POST') {
    if (!owner) return json(401, { error: 'Enter the Dragon Farm passcode' });
    let body;
    try { body = await req.json(); } catch { return json(400, {}); }
    if (!ARTISTS.includes(body.artist)) return json(400, { error: 'Unknown artist' });
    const kit = { ...cleanKit(body.kit), updatedAt: new Date().toISOString() };
    await updateJSON(store(), 'kits', all => ({ ...(all || {}), [body.artist]: kit }));
    return json(200, { kit });
  }
  if (req.method !== 'GET') return json(405, {});

  const artists = String(url.searchParams.get('a') || '').split(',').filter(a => ARTISTS.includes(a));
  if (!artists.length) return json(400, { error: 'Unknown artist' });
  const all = (await store().get('kits', { type: 'json' })) || {};

  // Count the view against the lead the link was made for. Our own previews
  // (sent with the passcode) don't count.
  const ref = clean(url.searchParams.get('r'), 100);
  if (ref && !owner && /^[\w.-]+$/.test(ref) && await findLeadById(ref)) {
    const now = new Date().toISOString();
    await recordActivity(ref, a => ({
      ...a,
      views: { count: (a.views?.count || 0) + 1, first: a.views?.first || now, last: now }
    }));
  }
  return json(200, { kits: Object.fromEntries(artists.map(a => [a, all[a] || null])) });
};
