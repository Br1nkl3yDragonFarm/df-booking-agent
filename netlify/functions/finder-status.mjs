// ============================================================
//  DRAGON FARM — BOOKER FINDER (status)
//  Returns a finder job written by finder-background.mjs:
//  { status: 'running' | 'done' | 'error', results, ... }
// ============================================================

import { getStore } from '@netlify/blobs';
import { passcodeMatches } from '../lib/passcode.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default async (req) => {
  if (!process.env.DF_CRM_PASSCODE) return json(503, { error: 'not_configured' });
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) {
    return json(401, { error: 'wrong_passcode' });
  }
  const job = new URL(req.url).searchParams.get('job') || '';
  if (!/^[a-z0-9-]{8,64}$/i.test(job)) return json(400, { error: 'bad_job' });
  const saved = await getStore({ name: 'df-finder', consistency: 'strong' }).get(job, { type: 'json' });
  return saved ? json(200, saved) : json(404, { status: 'pending' });
};
