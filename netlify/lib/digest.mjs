// ============================================================
//  DRAGON FARM — MONDAY DIGEST
//
//  A short plain-text rundown of what needs doing, built from the
//  pipelines and their activity: new leads from the weekly searches,
//  follow-ups due (unanswered replies first), overdue deposits and this
//  week's shows. Sent by email (Resend) and/or to a Discord channel.
//
//  Environment variables:
//    DF_DIGEST_TO         who gets the email (default: DF_REPLY_TO, the booking inbox)
//    DISCORD_WEBHOOK_URL  a Discord channel webhook; leave unset for email only
// ============================================================

import { replyTo, sendMail } from './mail.mjs';

const CLOSED = ['booked', 'licensed', 'passed'];
const MAX_LINES = 12;
const DISCORD_LIMIT = 1900;

const num = v => Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0;
const money = n => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const latest = list => (list || []).reduce((a, b) => (!a || b.at > a.at ? b : a), null);

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function niceDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Same rule as the pages: a reply newer than anything we sent, not marked handled.
function unanswered(lead, act) {
  const r = latest(act.replies);
  if (!r || lead.replyHandled === r.at) return null;
  const s = latest(act.sent);
  return !s || s.at < r.at ? r : null;
}

export const digestTo = () => process.env.DF_DIGEST_TO || replyTo();

export function buildDigest({ venue = [], sync = [], activity = {}, today, added = [], siteUrl = '' }) {
  const all = [...venue.map(l => ({ l, list: 'booking' })), ...sync.map(l => ({ l, list: 'sync' }))];
  const due = all
    .filter(({ l }) => !CLOSED.includes(l.status))
    .map(x => ({ ...x, reply: unanswered(x.l, activity[x.l.id] || {}) }))
    .filter(({ l, reply }) => reply || (l.followUp && l.followUp <= today))
    .sort((a, b) => (!!b.reply - !!a.reply) || String(a.l.followUp || '').localeCompare(String(b.l.followUp || '')));
  const deposits = venue.filter(l => l.status === 'booked' && num(l.deposit) && !l.depositPaid && l.depositDue && l.depositDue < today);
  const weekEnd = addDays(today, 7);
  const shows = venue.filter(l => l.status === 'booked' && l.eventDate && l.eventDate >= today && l.eventDate <= weekEnd)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const newCount = added.reduce((n, s) => n + (s.added || 0), 0);

  const lines = [];
  const section = (title, items) => { if (items.length) lines.push('', title, ...items); };
  section(`NEW FROM THIS WEEK'S SEARCHES (${newCount})`, added.filter(s => s.added || s.error).map(s =>
    s.error ? `• ${s.label}: didn't run (${s.error})` : `• ${s.label}: ${s.added} new`));
  section(`DUE (${due.length})`, [
    ...due.slice(0, MAX_LINES).map(({ l, list, reply }) => reply
      ? `💬 ${l.name} replied${reply.snippet ? `: "${String(reply.snippet).slice(0, 90)}"` : ''} (${list})`
      : `• ${l.name}${l.city ? `, ${l.city}` : ''}: ${num(l.touches) ? `follow-up #${num(l.touches) + 1}` : 'first pitch'} (${list})`),
    ...(due.length > MAX_LINES ? [`…and ${due.length - MAX_LINES} more`] : [])
  ]);
  section('DEPOSITS OVERDUE', deposits.map(l => `• ${l.name}: ${money(num(l.deposit))} was due ${niceDate(l.depositDue)}`));
  section('SHOWS THIS WEEK', shows.map(l => `• ${niceDate(l.eventDate)}: ${l.name}${l.city ? `, ${l.city}` : ''}`));
  if (!lines.length) lines.push('', 'Nothing due, no new leads and no shows this week.');

  const hub = siteUrl ? `${siteUrl.replace(/\/$/, '')}/hub.html` : '';
  const title = `Dragon Farm Monday rundown, ${niceDate(today)}`;
  const counts = [`${due.length} due`, newCount && `${newCount} new leads`, deposits.length && `${deposits.length} deposit${deposits.length > 1 ? 's' : ''} overdue`, shows.length && `${shows.length} show${shows.length > 1 ? 's' : ''} this week`].filter(Boolean).join(', ');
  const text = [title, ...lines, '', hub && `Open the hub: ${hub}`].filter(x => x !== false && x !== null).join('\n').trim();
  return { subject: `${title}: ${counts}`, text, counts: { due: due.length, added: newCount, deposits: deposits.length, shows: shows.length } };
}

// Sends wherever is set up. Returns { email, discord }: 'sent', 'off' or an error message.
export async function sendDigest(digest) {
  const out = { email: 'off', discord: 'off' };
  if (process.env.RESEND_API_KEY) {
    const r = await sendMail({ to: digestTo(), subject: digest.subject, text: digest.text });
    out.email = r.ok ? 'sent' : r.error;
  }
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (hook) {
    const content = digest.text.length > DISCORD_LIMIT ? digest.text.slice(0, DISCORD_LIMIT) + '\n…' : digest.text;
    try {
      const res = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
      out.discord = res.ok ? 'sent' : `Discord said ${res.status}${res.status === 404 ? ' (the webhook was deleted; make a new one)' : ''}`;
    } catch {
      out.discord = 'Couldn’t reach Discord';
    }
  }
  return out;
}
