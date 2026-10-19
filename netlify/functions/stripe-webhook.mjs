// ============================================================
//  DRAGON FARM — STRIPE PAYMENTS
//
//  Stripe calls this when someone pays through an invoice's payment link.
//  The payment is recorded on the lead's activity; the pages then mark
//  the deposit (or balance) as received.
//
//  Environment variable: STRIPE_WEBHOOK_SECRET (whsec_...). In Stripe, send
//  the events checkout.session.completed and
//  checkout.session.async_payment_succeeded to this function's URL.
// ============================================================

import { verifyStripe } from '../lib/mail.mjs';
import { clean, json, pushCapped, recordActivity } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, {});
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) return json(400, {});
  let event;
  try { event = JSON.parse(raw); } catch { return json(400, {}); }

  const session = event.data?.object || {};
  // Bank payments finish later and arrive as async_payment_succeeded.
  const paid = (event.type === 'checkout.session.completed' && session.payment_status === 'paid')
    || event.type === 'checkout.session.async_payment_succeeded';
  const leadId = clean(session.metadata?.leadId, 100);
  if (!paid || !leadId) return json(200, { ignored: true });

  const payment = {
    at: new Date().toISOString(),
    amount: (Number(session.amount_total) || 0) / 100,
    kind: clean(session.metadata?.kind, 20) || 'other',
    invoice: clean(session.metadata?.invoice, 40),
    id: clean(session.id, 100)
  };
  await recordActivity(leadId, a => (a.payments || []).some(p => p.id === payment.id)
    ? a
    : { ...a, payments: pushCapped(a.payments, payment) });
  return json(200, { recorded: true });
};
