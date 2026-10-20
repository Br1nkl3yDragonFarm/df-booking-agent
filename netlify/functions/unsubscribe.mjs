// ============================================================
//  DRAGON FARM — UNSUBSCRIBE FROM THE FAN NEWSLETTER
//
//  The link in every newsletter: ?e=<email>&s=<signature>. Opening it (GET)
//  asks to confirm; confirming, or a mail app's one-click unsubscribe
//  (POST, RFC 8058), takes the email off the fan list right away.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import { fansStore } from '../lib/fans.mjs';
import { unsubscribeToken } from '../lib/unsubscribe.mjs';
import { updateJSON } from '../lib/store.mjs';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const page = (title, body) => new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#173226;color:#f3ecdc;font:16px/1.6 Arial,sans-serif}main{max-width:32rem;margin:0 auto;padding:3rem 16px;text-align:center}h1{font-size:1.6rem}button{background:#f08a24;color:#1d2321;border:0;border-radius:6px;padding:12px 22px;font-size:16px;font-weight:bold;cursor:pointer}a{color:#f0c060}</style></head>
<body><main>${body}</main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

function valid(email, sig) {
  const a = Buffer.from(String(sig || '')), b = Buffer.from(unsubscribeToken(email));
  return !!email && a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  const url = new URL(req.url);
  const email = String(url.searchParams.get('e') || '').toLowerCase().trim();
  if (!valid(email, url.searchParams.get('s'))) return page('Link not valid', '<h1>That link isn’t valid</h1><p>Reply to any of our emails with “unsubscribe” and we’ll take you off the list.</p>');
  if (req.method === 'POST') {
    await updateJSON(fansStore(), 'list', s => s && s.fans.some(f => f.email === email) ? { fans: s.fans.filter(f => f.email !== email) } : undefined);
    return page('Unsubscribed', `<h1>You're unsubscribed</h1><p>${esc(email)} won't get any more emails from us. Thanks for coming out to the shows.</p>`);
  }
  return page('Unsubscribe', `<h1>Unsubscribe?</h1><p>Stop emails to ${esc(email)} from Timothy Chance &amp; Rasta Country.</p><form method="post"><button type="submit">Unsubscribe</button></form>`);
};
