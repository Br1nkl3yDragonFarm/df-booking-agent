// ============================================================
//  DRAGON FARM — FAN NEWSLETTER
//
//  Emails the fan list (all of it, or chosen towns) a branded newsletter
//  built with MJML: a headline, a few paragraphs, a ticket button and the
//  upcoming shows. Each fan gets their own copy with a one-click
//  unsubscribe link (unsubscribe.mjs), sent through Resend in batches.
//
//  POST {action:'preview', ...message}            passcode: the HTML, and how many it would go to
//  POST {action:'test', ...message}               passcode: send one copy to the booking inbox
//  POST {action:'send', ...message, expected}     passcode: send it; expected must match the count
//  GET                                            passcode: past sends
//
//  message: { subject, headline, body, ctaText, ctaUrl, towns: [], includeShows }
//  Needs RESEND_API_KEY and DF_MAILING_ADDRESS (the label's postal address,
//  required by US law in marketing email).
// ============================================================

import { getStore } from '@netlify/blobs';
import { fansStore, townOf } from '../lib/fans.mjs';
import { fromAddress, replyTo, sendMail } from '../lib/mail.mjs';
import { mailingAddress, renderNewsletter, unsubscribeUrl } from '../lib/newsletter.mjs';
import { passcodeMatches } from '../lib/passcode.mjs';
import { clean, json, labelToday, readList, updateJSON } from '../lib/store.mjs';

const BATCH = 100;           // Resend's batch limit
const MAX_PER_SEND = 2000;
const logStore = () => getStore({ name: 'df-newsletter', consistency: 'strong' });

async function readMessage(body) {
  const msg = {
    subject: clean(body.subject, 150), headline: clean(body.headline, 150), body: String(body.body || '').slice(0, 5000),
    ctaText: clean(body.ctaText, 40), ctaUrl: clean(body.ctaUrl, 500),
    towns: (Array.isArray(body.towns) ? body.towns : []).map(t => clean(t, 120)).filter(Boolean).slice(0, 50)
  };
  if (msg.ctaUrl && !/^https:\/\/[^\s"'<>]+$/i.test(msg.ctaUrl)) return { problem: 'The button link must start with https://' };
  if (!msg.subject) return { problem: 'Add a subject.' };
  if (!msg.body.trim()) return { problem: 'Write the message.' };
  if (body.includeShows) {
    const today = labelToday();
    msg.shows = (await readList('venue')).filter(l => l.status === 'booked' && l.eventDate && l.eventDate >= today)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate)).map(l => ({ eventDate: l.eventDate, name: l.name, city: l.city }));
  }
  return { msg };
}

async function audience(towns) {
  const fans = (await fansStore().get('list', { type: 'json' }))?.fans || [];
  return towns.length ? fans.filter(f => towns.includes(townOf(f.city))) : fans;
}

export default async (req) => {
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, { error: 'Enter the Dragon Farm passcode' });
  const site = process.env.URL || new URL(req.url).origin;
  if (req.method === 'GET') return json(200, { log: (await logStore().get('log', { type: 'json' })) || [], setup: { email: !!process.env.RESEND_API_KEY, address: mailingAddress() } });
  if (req.method !== 'POST') return json(405, {});
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const { msg, problem } = await readMessage(body);
  if (problem) return json(400, { error: problem });
  const fans = await audience(msg.towns);

  if (body.action === 'preview') {
    const { html } = await renderNewsletter(msg, { site, unsubscribe: unsubscribeUrl(site, 'fan@example.com') });
    return json(200, { html, count: fans.length });
  }
  if (!process.env.RESEND_API_KEY) return json(503, { error: 'Set up Resend first (RESEND_API_KEY in Netlify).' });
  if (!mailingAddress()) return json(503, { error: 'Add the label’s mailing address in Netlify as DF_MAILING_ADDRESS. US law requires a postal address in every marketing email (a PO box works).' });

  if (body.action === 'test') {
    const to = replyTo();
    const { html, text } = await renderNewsletter(msg, { site, unsubscribe: unsubscribeUrl(site, to) });
    const r = await sendMail({ to, subject: `[Test] ${msg.subject}`, text, html });
    return r.ok ? json(200, { sent: to }) : json(502, { error: r.error });
  }
  if (body.action !== 'send') return json(400, { error: 'Unknown action' });
  if (!fans.length) return json(400, { error: 'No fans on the list for those towns yet.' });
  if (fans.length > MAX_PER_SEND) return json(400, { error: `That's ${fans.length} people; one send can go to ${MAX_PER_SEND}. Pick fewer towns.` });
  if (Number(body.expected) !== fans.length) return json(409, { error: `The list changed: it's ${fans.length} people now. Check and send again.`, count: fans.length });

  let sent = 0, failed = 0, lastError = '';
  for (let i = 0; i < fans.length; i += BATCH) {
    const emails = await Promise.all(fans.slice(i, i + BATCH).map(async f => {
      const unsub = unsubscribeUrl(site, f.email);
      const { html, text } = await renderNewsletter(msg, { site, unsubscribe: unsub });
      return {
        from: fromAddress(), to: [f.email], reply_to: replyTo(), subject: msg.subject, html, text,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      };
    }));
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(emails)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) sent += emails.length; else { failed += emails.length; lastError = data.message || `error ${res.status}`; }
    } catch { failed += emails.length; lastError = 'Couldn’t reach the email service'; }
  }
  const entry = { at: new Date().toISOString(), subject: msg.subject, towns: msg.towns, sent, failed, error: lastError };
  await updateJSON(logStore(), 'log', log => [entry, ...(log || [])].slice(0, 50));
  return json(failed && !sent ? 502 : 200, { ...entry, error: lastError ? `The email service said: ${lastError}` : '' });
};
