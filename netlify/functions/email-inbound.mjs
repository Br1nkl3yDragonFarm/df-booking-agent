// ============================================================
//  DRAGON FARM — CATCH REPLIES
//
//  Resend calls this (webhook, event "email.received") for every email
//  that reaches the label's Resend receiving address. Set the booking
//  inbox to forward its mail there, and each reply from a venue or
//  supervisor is matched to their lead by the sender's address (or their
//  website's domain) and flagged as "Replied" in the pipelines.
//
//  Environment variables:
//    RESEND_WEBHOOK_SECRET  the webhook's signing secret (whsec_...)
//    RESEND_API_KEY         used to read the reply's text
// ============================================================

import { emit, leadSummary } from '../lib/events.mjs';
import { bareAddress, fromAddress, replyTo, verifyResend } from '../lib/mail.mjs';
import { LISTS, clean, json, pushCapped, readList, recordActivity } from '../lib/store.mjs';

// Shared mail services: a match on these domains alone says nothing about the venue.
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'ymail.com', 'gmx.com', 'mail.com', 'zoho.com']);

const leadEmail = l => bareAddress(l.contactEmail || l.email || '');
const domainOf = email => email.split('@')[1] || '';
function siteDomain(url) {
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

async function findLead(sender) {
  const all = [];
  for (const list of LISTS) for (const lead of await readList(list)) all.push({ list, lead });
  const exact = all.find(({ lead }) => leadEmail(lead) === sender);
  if (exact) return exact;
  const domain = domainOf(sender);
  if (!domain || FREEMAIL.has(domain)) return null;
  const sameDomain = all.filter(({ lead }) => domainOf(leadEmail(lead)) === domain || siteDomain(lead.website || '') === domain);
  return sameDomain.length === 1 ? sameDomain[0] : null;
}

// The new part of a reply: drop quoted lines and everything after "On … wrote:".
function snippet(text) {
  const lines = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^On .+wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim())) break;
    if (line.trim().startsWith('>')) continue;
    lines.push(line);
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function replyText(emailId) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emailId) return '';
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return '';
    const email = await res.json();
    return email.text || String(email.html || '').replace(/<[^>]+>/g, ' ');
  } catch { return ''; }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, {});
  const raw = await req.text();
  if (!verifyResend(raw, req.headers, process.env.RESEND_WEBHOOK_SECRET)) return json(401, {});
  let event;
  try { event = JSON.parse(raw); } catch { return json(400, {}); }
  if (event.type !== 'email.received') return json(200, { ignored: event.type });

  const data = event.data || {};
  const sender = bareAddress(data.from);
  // Copies of our own sends (we BCC the booking inbox) aren't replies.
  if (!sender || [bareAddress(fromAddress()), bareAddress(replyTo())].includes(sender)) return json(200, { ignored: 'own' });

  const match = await findLead(sender);
  if (!match) return json(200, { matched: false });

  const reply = {
    at: new Date().toISOString(),
    from: clean(data.from, 200),
    subject: clean(data.subject, 200),
    snippet: snippet(await replyText(data.email_id)),
    id: clean(data.email_id, 100)
  };
  let isNew = false;
  await recordActivity(match.lead.id, a => {
    isNew = !(a.replies || []).some(r => r.id && r.id === reply.id);
    return isNew ? { ...a, replies: pushCapped(a.replies, reply) } : a;
  });
  if (isNew) await emit('reply.received', { from: reply.from, subject: reply.subject, snippet: reply.snippet, list: match.list, lead: leadSummary(match.lead) });
  return json(200, { matched: true, lead: match.lead.id });
};
