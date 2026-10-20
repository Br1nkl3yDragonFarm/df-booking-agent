// ============================================================
//  DRAGON FARM — EVENTS FOR AUTOMATIONS (n8n)
//
//  When something happens that's worth acting on outside the tool, the
//  functions POST a small JSON event to an n8n webhook, where workflows
//  post to social media, Discord, a sheet, a text message and so on.
//
//    { "type": "show.booked", "at": "...", "site": "https://…", "data": { … } }
//
//  Types: show.booked, sync.licensed, brand.signed, reply.received,
//  payment.received, agreement.signed, inquiry.received, fan.signed_up,
//  digest.sent, social.drafts, test.
//
//  Environment variables:
//    N8N_WEBHOOK_URL     the n8n Webhook node's production URL; unset = off
//    N8N_WEBHOOK_SECRET  optional; signs each event as X-DF-Signature:
//                        sha256=<hex HMAC of the raw body>
//
//  Sending never fails the thing that caused it: errors are swallowed and
//  each send gives up after a few seconds.
// ============================================================

import { createHmac } from 'node:crypto';

export const EVENT_TYPES = ['show.booked', 'sync.licensed', 'brand.signed', 'reply.received', 'payment.received', 'agreement.signed', 'inquiry.received', 'fan.signed_up', 'digest.sent', 'social.drafts', 'test'];
const TIMEOUT_MS = 4000;

export const automationsOn = () => /^https:\/\//.test(process.env.N8N_WEBHOOK_URL || '');

export function signature(body) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  return secret ? 'sha256=' + createHmac('sha256', secret).update(body).digest('hex') : '';
}

// Returns { ok, status } (or { ok: false, error }); never throws.
export async function emit(type, data, site = process.env.URL || '') {
  if (!automationsOn()) return { ok: false, error: 'off' };
  const body = JSON.stringify({ type, at: new Date().toISOString(), site, data });
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'DragonFarm-Booking/1' };
  const sig = signature(body);
  if (sig) headers['X-DF-Signature'] = sig;
  try {
    const res = await fetch(process.env.N8N_WEBHOOK_URL, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'timed out' : 'unreachable' };
  }
}

// The parts of a lead that are useful outside the tool (no internal notes).
export function leadSummary(l) {
  const pick = ['id', 'name', 'city', 'address', 'artist', 'type', 'category', 'project', 'eventDate', 'loadIn', 'setTime', 'setLength',
    'contactName', 'contact', 'contactEmail', 'email', 'contactPhone', 'phone', 'website', 'dealType', 'guarantee', 'doorPct', 'deposit', 'fee', 'offer', 'status'];
  return Object.fromEntries(pick.filter(k => l[k] !== undefined && l[k] !== '').map(k => [k, l[k]]));
}
