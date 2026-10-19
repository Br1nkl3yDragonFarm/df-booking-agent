// ============================================================
//  DRAGON FARM — SEND EMAIL
//
//  Sends a pitch, follow-up, invoice or reminder from the label's own
//  address through Resend, and logs it on the lead's activity.
//
//  Environment variables:
//    RESEND_API_KEY   required; the domain must be verified in Resend
//    DF_FROM_EMAIL    default "Dragon Farm Booking <booking@dragonfarm.net>"
//    DF_REPLY_TO      default booking@dragonfarm.net; replies go here and a
//                     copy of every email sent is BCC'd here too
// ============================================================

import { fromAddress, replyTo } from '../lib/mail.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { clean, json, pushCapped, recordActivity } from '../lib/store.mjs';

const KINDS = ['pitch', 'followup', 'invoice', 'reminder', 'other'];
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  if (req.method !== 'POST') return json(405, {});
  const key = process.env.RESEND_API_KEY;
  if (!key) return json(503, { error: 'Sending is not set up yet (RESEND_API_KEY is missing in Netlify).' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const to = clean(body.to, 200);
  const subject = clean(body.subject, 200);
  const text = String(body.text || '').slice(0, 20000);
  const kind = KINDS.includes(body.kind) ? body.kind : 'other';
  const leadId = clean(body.leadId, 100);
  if (!EMAIL.test(to)) return json(400, { error: 'That email address doesn’t look right.' });
  if (!subject || !text.trim()) return json(400, { error: 'Add a subject and a message.' });

  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  // The page sends a fresh id per message, so a retried request isn't sent twice.
  if (/^[\w-]{8,64}$/.test(body.sendId || '')) headers['Idempotency-Key'] = body.sendId;
  let res, data;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({ from: fromAddress(), to: [to], bcc: [replyTo()], reply_to: replyTo(), subject, text })
    });
    data = await res.json().catch(() => ({}));
  } catch {
    return json(502, { error: 'Couldn’t reach the email service. Try again in a minute.' });
  }
  if (!res.ok) return json(502, { error: `The email service said: ${data.message || res.status}` });

  const sent = { at: new Date().toISOString(), to, subject, kind, id: clean(data.id, 100) };
  if (leadId) await recordActivity(leadId, a => ({ ...a, sent: pushCapped(a.sent, sent) }));
  return json(200, { sent });
};
