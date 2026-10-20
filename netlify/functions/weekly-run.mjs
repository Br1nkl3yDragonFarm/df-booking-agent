// ============================================================
//  DRAGON FARM — MONDAY KICK-OFF (scheduled)
//
//  Every Monday at 13:00 UTC (8 am in Nashville in summer, 7 am in
//  winter) this starts weekly-background.mjs, which runs the saved
//  searches and sends the digest. Scheduled functions only get 30
//  seconds, so the long work happens in the background function.
// ============================================================

export const config = { schedule: '0 13 * * 1' };

export default async () => {
  const site = process.env.URL;
  if (!site || !process.env.DF_CRM_PASSCODE) return new Response('Not set up', { status: 200 });
  await fetch(`${site}/.netlify/functions/weekly-background`, {
    method: 'POST', headers: { 'x-df-passcode': process.env.DF_CRM_PASSCODE, 'Content-Type': 'application/json' }, body: '{}'
  }).catch(() => {});
  return new Response('Started');
};
