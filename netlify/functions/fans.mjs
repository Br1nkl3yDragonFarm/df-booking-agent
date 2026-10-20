// ============================================================
//  DRAGON FARM — FAN LIST
//
//  GET                  passcode: every fan who signed up at a show
//                       ({ email, name, city, shows, first, last })
//  POST {remove: email} passcode: take someone off the list (when they ask)
//
//  Sign-ups come in through the fan-signup Netlify form on fans.html and
//  are added by submission-created.mjs.
// ============================================================

import { fansStore } from '../lib/fans.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { clean, json, updateJSON } from '../lib/store.mjs';

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  if (req.method === 'GET') {
    const saved = await fansStore().get('list', { type: 'json' });
    return json(200, { fans: saved?.fans || [] });
  }
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const email = clean(body.remove, 160).toLowerCase();
  if (!email) return json(400, { error: 'Which email?' });
  const saved = await updateJSON(fansStore(), 'list', s => s ? { fans: (s.fans || []).filter(f => f.email !== email) } : undefined);
  return json(200, { fans: saved?.fans || [] });
};
