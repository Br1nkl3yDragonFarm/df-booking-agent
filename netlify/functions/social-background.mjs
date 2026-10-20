// ============================================================
//  DRAGON FARM — SOCIAL POST DRAFTS (background job)
//
//  POST {id}   passcode: draft the posts for booked show `id` (lib/social.mjs)
//              and save them. Started by "Write posts" on the booking page,
//              and by crm.mjs when a show is first booked. Netlify answers
//              202 at once; the page reads the result from social.mjs.
//  When the drafts are ready an automations event (social.drafts) goes to
//  n8n so they can reach a phone or Discord.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { emit } from '../lib/events.mjs';
import { isPublic, publicShow } from '../lib/listing.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { socialStore, writePosts } from '../lib/social.mjs';
import { findLeadById } from '../lib/store.mjs';

export const config = { background: true };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ID = /^[\w.:-]{1,100}$/;

export default async (req) => {
  // Background functions retry on a thrown error, which would bill the drafts
  // again, so every failure is recorded instead of thrown.
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, {});
  let body;
  try { body = await req.json(); } catch { return json(400, {}); }
  const id = String(body.id || '');
  if (!ID.test(id)) return json(400, {});
  const store = socialStore();
  const fail = message => store.setJSON(id, { status: 'error', message, at: new Date().toISOString() }).then(() => json(200, {}));

  const found = await findLeadById(id);
  if (!found || found.list !== 'venue') return fail('That show isn’t in the booking pipeline.');
  const lead = found.lead;
  if (lead.type === 'Private Event') return fail('Private events aren’t announced publicly.');
  if (!isPublic(lead)) return fail('Mark the show Booked with a date (and not kept off the Shows page) first.');
  if (!process.env.ANTHROPIC_API_KEY) return fail('ANTHROPIC_API_KEY is not set in Netlify.');

  const site = process.env.URL || new URL(req.url).origin;
  const show = publicShow(lead);
  await store.setJSON(id, { status: 'running', startedAt: new Date().toISOString(), show });
  try {
    const { posts, hashtags } = await writePosts(show, site);
    const saved = { status: 'done', posts, hashtags, show, at: new Date().toISOString(), posted: {} };
    await store.setJSON(id, saved);
    await emit('social.drafts', { show, posts, hashtags, link: `${site}/dashboard.html#posts=${encodeURIComponent(id)}` }, site);
  } catch (err) {
    const message = err instanceof Anthropic.RateLimitError ? 'The writing assistant is busy. Try again in a minute.'
      : err instanceof Anthropic.APIError ? `The writing assistant returned an error (${err.status}).`
      : String(err.message || 'Something went wrong writing the posts.');
    await store.setJSON(id, { status: 'error', message, show, at: new Date().toISOString() });
  }
  return json(200, {});
};
