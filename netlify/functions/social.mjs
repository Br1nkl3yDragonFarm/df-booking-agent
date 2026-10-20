// ============================================================
//  DRAGON FARM — SOCIAL POST DRAFTS (read and edit)
//
//  GET  ?id=…                               passcode: the drafts for a show
//  POST {id, posts}                         passcode: save edited drafts
//  POST {id, posted: channel, done: bool}   passcode: mark one as posted
//  Writing (and rewriting) them is social-background.mjs.
// ============================================================

import { passcodeMatches } from '../lib/passcode.mjs';
import { CHANNELS, socialStore } from '../lib/social.mjs';
import { json, updateJSON } from '../lib/store.mjs';

const ID = /^[\w.:-]{1,100}$/;
const MAX = 3000;

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  const store = socialStore();
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!ID.test(id)) return json(400, { error: 'Invalid show' });
    return json(200, (await store.get(id, { type: 'json' })) || { status: 'none' });
  }
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const id = String(body.id || '');
  if (!ID.test(id)) return json(400, { error: 'Invalid show' });
  let missing = false;
  const saved = await updateJSON(store, id, cur => {
    if (!cur || cur.status !== 'done') { missing = true; return undefined; }
    if (body.posts && typeof body.posts === 'object') {
      const posts = { ...cur.posts };
      for (const c of CHANNELS) if (typeof body.posts[c] === 'string') posts[c] = body.posts[c].slice(0, MAX);
      return { ...cur, posts, edited: new Date().toISOString() };
    }
    if (CHANNELS.includes(body.posted)) return { ...cur, posted: { ...cur.posted, [body.posted]: body.done ? new Date().toISOString() : undefined } };
    return undefined;
  });
  if (missing) return json(404, { error: 'No drafts for this show yet' });
  return json(200, saved);
};
