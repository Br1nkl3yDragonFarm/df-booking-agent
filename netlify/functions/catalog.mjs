// ============================================================
//  DRAGON FARM — SYNC CATALOG (versions and metadata)
//
//  GET              passcode: { catalog: { tracks: { [title]: { links, bpm, key, ... } } } }
//  POST {tracks}    passcode: save. Links (full mix, clean, instrumental,
//                   edits, stems) must be https; they go into sync pitches.
// ============================================================

import { getStore } from '@netlify/blobs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { clean, json, updateJSON } from '../lib/store.mjs';

const TRACKS = ['Mr. Iron Man (Live)'];
const VERSIONS = ['main', 'clean', 'instrumental', 'edit60', 'edit30', 'stems'];
const META = { bpm: 20, key: 40, mood: 300, writers: 300, publisher: 200, pro: 60 };
const store = () => getStore({ name: 'df-catalog', consistency: 'strong' });

function cleanTrack(t) {
  const out = { links: {} };
  for (const [k, max] of Object.entries(META)) if (clean(t?.[k], max)) out[k] = clean(t[k], max);
  for (const k of VERSIONS) {
    const url = clean(t?.links?.[k], 500);
    if (/^https:\/\/[^\s"'<>]+$/i.test(url)) out.links[k] = url;
  }
  return out;
}

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  if (req.method === 'GET') return json(200, { catalog: (await store().get('catalog', { type: 'json' })) || { tracks: {} } });
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const catalog = await updateJSON(store(), 'catalog', saved => {
    const tracks = { ...(saved?.tracks || {}) };
    for (const title of TRACKS) if (body.tracks?.[title]) tracks[title] = cleanTrack(body.tracks[title]);
    return { tracks, updatedAt: new Date().toISOString() };
  });
  return json(200, { catalog });
};
