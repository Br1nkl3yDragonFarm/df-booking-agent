// ============================================================
//  DRAGON FARM — SHOW CALENDAR FEED
//
//  A calendar the band subscribes to on their phones (Apple, Google,
//  Outlook). It lists booked shows with load-in, set time, address and
//  the day-of contact, plus holds marked HOLD, and updates itself as the
//  pipeline changes. Times are "floating": 9 PM means 9 PM wherever the
//  show is.
//
//  GET  ?k=<feed key>               public to whoever has the secret link
//  POST {action:'get'|'reset'}      passcode: the link (reset makes a new one
//                                   and the old one stops working)
// ============================================================

import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import ical from 'ical-generator';
import { passcodeMatches } from '../lib/passcode.mjs';
import { json, readList } from '../lib/store.mjs';
import { parseTime } from '../lib/showtime.mjs';

const store = () => getStore({ name: 'df-calendar', consistency: 'strong' });
const CLOSED = ['passed'];
const DEFAULT_SET = 90;

function at(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const t = parseTime(time);
  return t ? new Date(Date.UTC(y, m - 1, d, t[0], t[1])) : null;
}
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US');

function describe(l) {
  const deal = l.dealType === 'guarantee' || (!l.dealType && l.guarantee) ? `${money(l.guarantee)} guarantee`
    : l.dealType === 'door' ? `${l.doorPct || '?'}% of the door`
    : l.dealType === 'vs' ? `${money(l.guarantee)} vs. ${l.doorPct || '?'}% of the door` : '';
  return [
    l.loadIn && `Load-in: ${l.loadIn}`,
    l.setTime && `Set: ${l.setTime}${l.setLength ? ` (${l.setLength} min)` : ''}`,
    l.address && `Address: ${l.address}`,
    (l.dayContact || l.dayPhone) && `Day-of contact: ${[l.dayContact, l.dayPhone].filter(Boolean).join(', ')}`,
    l.sound && `Sound: ${l.sound}`,
    l.hospitality && `Hospitality: ${l.hospitality}`,
    deal && `Deal: ${deal}`,
    Number(l.deposit) ? `Deposit: ${money(l.deposit)}${l.depositPaid ? ' received' : ' not received yet'}` : '',
    l.contract === 'signed' ? 'Contract signed' : ''
  ].filter(Boolean).join('\n');
}

export function feed(leads) {
  const cal = ical({ name: 'Dragon Farm shows', prodId: { company: 'Dragon Farm Records', product: 'Shows' }, ttl: 60 * 60 });
  for (const l of leads) {
    if (!l.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(l.eventDate) || CLOSED.includes(l.status)) continue;
    const booked = l.status === 'booked';
    const start = at(l.eventDate, l.setTime);
    const base = {
      id: `df-${l.id}@dragonfarm.net`,
      summary: `${booked ? '' : 'HOLD: '}${l.name}${l.city ? `, ${l.city}` : ''}`,
      location: l.address || [l.name, l.city].filter(Boolean).join(', '),
      description: describe(l),
      status: booked ? 'CONFIRMED' : 'TENTATIVE'
    };
    if (start) cal.createEvent({ ...base, start, end: new Date(start.getTime() + (Number(l.setLength) || DEFAULT_SET) * 60000), floating: true });
    else {
      const [y, m, d] = l.eventDate.split('-').map(Number);
      cal.createEvent({ ...base, start: new Date(Date.UTC(y, m - 1, d)), allDay: true });
    }
  }
  return cal.toString();
}

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const k = url.searchParams.get('k') || '';
    const saved = await store().get('key', { type: 'json' });
    if (!saved?.key || !passcodeMatches(k, saved.key)) return new Response('Not found', { status: 404 });
    return new Response(feed(await readList('venue')), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' } });
  }
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  let saved = await store().get('key', { type: 'json' });
  if (body.action === 'reset' || !saved?.key) {
    saved = { key: randomBytes(24).toString('base64url'), at: new Date().toISOString() };
    await store().setJSON('key', saved);
  }
  const https = `${url.origin}/.netlify/functions/calendar-feed?k=${saved.key}`;
  return json(200, { url: https, webcal: https.replace(/^https?:/, 'webcal:') });
};
