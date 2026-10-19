// ============================================================
//  DRAGON FARM — LEAD ACTIVITY
//
//  Hands the private pages everything recorded about leads outside the
//  pages themselves (emails sent, replies, press kit views, online
//  payments), plus which of the optional services are set up.
// ============================================================

import { fromAddress } from '../lib/mail.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { activityStore, json } from '../lib/store.mjs';

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, {});
  const leads = await activityStore().get('leads', { type: 'json' });
  return json(200, {
    leads: leads || {},
    setup: {
      email: !!process.env.RESEND_API_KEY,
      from: fromAddress(),
      replies: !!process.env.RESEND_WEBHOOK_SECRET,
      payments: !!process.env.STRIPE_SECRET_KEY
    }
  });
};
