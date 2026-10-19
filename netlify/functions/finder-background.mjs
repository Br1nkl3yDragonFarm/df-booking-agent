// ============================================================
//  DRAGON FARM — FINDER (background job)
//
//  Runs a finder search started from the pages (search code in
//  ../lib/finder.mjs).
//
//  Netlify answers the browser with 202 straight away and this keeps
//  running (up to 15 minutes). The result is written to Blobs under the
//  job id, where finder-status.mjs hands it back.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { MODES, readQuery, runSearch } from '../lib/finder.mjs';

export const config = { background: true };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  // Background functions retry on a thrown error, which would run (and bill) the
  // search again, so every failure is recorded instead of thrown.
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, {});
  let body;
  try { body = await req.json(); } catch { return json(400, {}); }
  const jobId = String(body.jobId || '');
  if (!/^[a-z0-9-]{8,64}$/i.test(jobId)) return json(400, {});

  const { q, problem } = readQuery(body);
  const mode = MODES[q.mode];
  const store = getStore({ name: 'df-finder', consistency: 'strong' });
  if (problem) {
    await store.setJSON(jobId, { status: 'error', message: problem, query: q });
    return json(400, {});
  }

  await store.setJSON(jobId, { status: 'running', startedAt: new Date().toISOString(), query: q });
  try {
    const { results, searches, sources } = await runSearch(q, mode);
    await store.setJSON(jobId, { status: 'done', finishedAt: new Date().toISOString(), query: q, results, searches, sources });
  } catch (err) {
    const message = err instanceof Anthropic.APIError
      ? `The search service returned an error (${err.status}). Try again in a minute.`
      : err.message || 'The search failed.';
    await store.setJSON(jobId, { status: 'error', finishedAt: new Date().toISOString(), query: q, message });
  }
  return json(200, {});
};
