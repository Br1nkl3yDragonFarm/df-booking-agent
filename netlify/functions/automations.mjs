// ============================================================
//  DRAGON FARM — AUTOMATIONS STATUS AND TEST EVENTS
//
//  GET                      passcode: whether events go to n8n
//  POST {type}              passcode: send a sample event of that type, so a
//                           workflow can be tried without waiting for a real one
// ============================================================

import { EVENT_TYPES, automationsOn, emit } from '../lib/events.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { json } from '../lib/store.mjs';

const SAMPLE_LEAD = { id: 'sample', name: 'Exit/In', city: 'Nashville, TN', address: '2208 Elliston Pl, Nashville, TN', artist: 'Timothy Chance and Rasta Country', type: 'Bar / Club', eventDate: '2026-11-19', loadIn: '18:00', setTime: '21:00', setLength: 75, contactName: 'Chris Cobb', contactEmail: 'chris@example.com', dealType: 'guarantee', guarantee: 800, status: 'booked' };
const SAMPLES = {
  'show.booked': SAMPLE_LEAD,
  'sync.licensed': { id: 'sample', name: 'Doe Music Group', project: 'River Road', category: 'Streaming Show', contact: 'Jane Doe', fee: '$5,000', status: 'licensed' },
  'brand.signed': { id: 'sample', name: 'Yazoo Brewing', category: 'Beverage', contact: 'Sam Rivers', offer: '$1,500 + product', status: 'signed' },
  'reply.received': { from: 'Chris Cobb <chris@example.com>', subject: 'Re: Country-reggae for your Friday nights', snippet: 'Yes! We have Nov 19 open. What do you need?', list: 'venue', lead: SAMPLE_LEAD },
  'payment.received': { amount: 250, kind: 'deposit', invoice: 'DF-20261119-ABCD', lead: SAMPLE_LEAD },
  'agreement.signed': { title: 'Performance agreement: Timothy Chance and Rasta Country at Exit/In, 2026-11-19', list: 'venue', leadId: 'sample', signedBy: 'Chris Cobb', role: 'Talent Buyer' },
  'inquiry.received': { list: 'venue', lead: { id: 'inq-sample', name: 'The Basement East', city: 'Nashville, TN', contactName: 'Dana Reed', contactEmail: 'dana@example.com', eventDate: '2026-12-05' }, notes: 'Website inquiry (Bar / Club Night). Budget: $500-$1,000.' },
  'fan.signed_up': { email: 'fan@example.com', name: 'Rae', city: 'Nashville, TN', show: 'Exit/In, Nashville, TN · Thu, Nov 19', fans: 42 },
  'digest.sent': { subject: 'Dragon Farm Monday rundown, Mon, Oct 26: 3 due', text: 'Dragon Farm Monday rundown…', counts: { due: 3, added: 2, deposits: 0, shows: 1 } },
  test: { message: 'Hello from the Dragon Farm booking tool' }
};

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  if (req.method === 'GET') return json(200, { on: automationsOn(), signed: !!process.env.N8N_WEBHOOK_SECRET, types: EVENT_TYPES });
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const type = EVENT_TYPES.includes(body.type) ? body.type : 'test';
  if (!automationsOn()) return json(503, { error: 'Add your n8n webhook URL in Netlify as N8N_WEBHOOK_URL first.' });
  const r = await emit(type, { ...SAMPLES[type], sample: true }, new URL(req.url).origin);
  return r.ok ? json(200, { sent: type }) : json(502, { error: r.status ? `n8n answered ${r.status}. Is the workflow active?` : `Couldn’t reach n8n (${r.error}).` });
};
