// Email and payment webhook helpers shared by the functions.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const fromAddress = () => process.env.DF_FROM_EMAIL || 'Dragon Farm Booking <booking@dragonfarm.net>';
export const replyTo = () => process.env.DF_REPLY_TO || 'booking@dragonfarm.net';

// Send one plain-text email through Resend from the label's address.
// Returns { ok: true, id } or { ok: false, error } with a message for people.
export async function sendMail({ to, subject, text, bcc, idempotencyKey }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'Sending is not set up yet (RESEND_API_KEY is missing in Netlify).' };
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let res, data;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({ from: fromAddress(), to: [to], ...(bcc ? { bcc: [bcc] } : {}), reply_to: replyTo(), subject, text })
    });
    data = await res.json().catch(() => ({}));
  } catch {
    return { ok: false, error: 'Couldn’t reach the email service. Try again in a minute.' };
  }
  if (!res.ok) return { ok: false, error: `The email service said: ${data.message || res.status}` };
  return { ok: true, id: String(data.id || '') };
}

// "Jane Doe <Jane@Venue.com>" -> "jane@venue.com"
export function bareAddress(s) {
  const m = String(s || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(s || '')).trim().toLowerCase();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const FIVE_MINUTES = 300;
const fresh = ts => Number.isFinite(Number(ts)) && Math.abs(Date.now() / 1000 - Number(ts)) <= FIVE_MINUTES;

// Resend signs webhooks the Svix way: base64 HMAC-SHA256 of "id.timestamp.body"
// with the base64 secret after "whsec_", sent as "v1,<sig>" (space-separated).
export function verifyResend(raw, headers, secret) {
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sig = headers.get('svix-signature');
  if (!secret || !id || !ts || !sig || !fresh(ts)) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return sig.split(' ').some(part => {
    const [version, value] = part.split(',');
    return version === 'v1' && safeEqual(value, expected);
  });
}

// Stripe-Signature: "t=<timestamp>,v1=<hex HMAC-SHA256 of 't.body'>", keyed with the whole secret.
export function verifyStripe(raw, header, secret) {
  if (!secret || !header) return false;
  const parts = header.split(',').map(p => p.split('='));
  const ts = parts.find(([k]) => k === 't')?.[1];
  if (!fresh(ts)) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return parts.some(([k, v]) => k === 'v1' && safeEqual(v, expected));
}
