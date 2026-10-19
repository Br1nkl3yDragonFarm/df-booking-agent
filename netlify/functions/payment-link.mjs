// ============================================================
//  DRAGON FARM — STRIPE PAYMENT LINK FOR AN INVOICE
//
//  Makes a one-time Stripe payment link for a deposit or balance, so a
//  venue can pay by card from the invoice. The lead's id rides along in
//  the link's metadata; stripe-webhook.mjs uses it to mark the lead paid.
//
//  Environment variable: STRIPE_SECRET_KEY (a restricted key with write
//  access to Products, Prices and Payment Links is enough).
// ============================================================

import { passcodeMatches } from '../lib/passcode.mjs';
import { clean, json, pushCapped, recordActivity } from '../lib/store.mjs';

const KINDS = ['deposit', 'balance', 'other'];
const MAX_DOLLARS = 100000;

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  if (req.method !== 'POST') return json(405, {});
  if (!process.env.STRIPE_SECRET_KEY) return json(503, { error: 'Card payments are not set up yet (STRIPE_SECRET_KEY is missing in Netlify).' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const leadId = clean(body.leadId, 100);
  const kind = KINDS.includes(body.kind) ? body.kind : 'other';
  const amount = Math.round(Number(body.amount) * 100);
  const description = clean(body.description, 200) || 'Dragon Farm Records performance';
  const invoice = clean(body.invoice, 40);
  if (!leadId) return json(400, { error: 'Missing lead' });
  if (!Number.isFinite(amount) || amount < 100 || amount > MAX_DOLLARS * 100) return json(400, { error: 'Enter an amount between $1 and $100,000.' });

  let link;
  try {
    const price = await stripe('prices', {
      currency: 'usd',
      unit_amount: String(amount),
      'product_data[name]': description
    });
    link = await stripe('payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      // Copied onto the checkout session, where the webhook reads it.
      'metadata[leadId]': leadId,
      'metadata[kind]': kind,
      'metadata[invoice]': invoice,
      // One payment per link, so an invoice can't be paid twice.
      'restrictions[completed_sessions][limit]': '1',
      'after_completion[type]': 'hosted_confirmation',
      'after_completion[hosted_confirmation][custom_message]': 'Thank you! Dragon Farm Records has your payment.'
    });
  } catch (err) {
    return json(502, { error: err.message });
  }

  const entry = { at: new Date().toISOString(), id: link.id, url: link.url, amount: amount / 100, kind, invoice };
  await recordActivity(leadId, a => ({ ...a, links: pushCapped(a.links, entry) }));
  return json(200, { link: entry });
};
