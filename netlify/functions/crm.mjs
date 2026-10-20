// ============================================================
//  DRAGON FARM CRM — SHARED LEAD STORAGE
//  Keeps the booking, sync and brand pipelines in Netlify Blobs so
//  every phone and computer sees the same leads.
//
//  Requires the DF_CRM_PASSCODE environment variable in Netlify.
//  Every request must send it in the x-df-passcode header.
// ============================================================

import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
import { emit, leadSummary } from '../lib/events.mjs';
import { isPublic } from '../lib/listing.mjs';
import { socialStore } from '../lib/social.mjs';
import { labelToday } from '../lib/store.mjs';

// A lead reaching this status is news for the automations (lib/events.mjs).
const WON = { venue: ['booked', 'show.booked'], sync: ['licensed', 'sync.licensed'], brand: ['signed', 'brand.signed'] };

const LISTS = ['venue', 'sync', 'brand'];
const MAX_ITEMS = 5000;
const MAX_ITEM_BYTES = 20000;
const MAX_WRITE_ATTEMPTS = 8;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

function passcodeMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validItem(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100
    && JSON.stringify(item).length <= MAX_ITEM_BYTES;
}

// Newly booked public shows get social post drafts (social-background.mjs),
// unless they already have some. The background job answers at once.
async function draftPosts(won, req, origin) {
  const today = labelToday();
  const shows = won.filter(l => isPublic(l) && l.eventDate >= today);
  if (!shows.length || !process.env.ANTHROPIC_API_KEY) return;
  const store = socialStore();
  await Promise.all(shows.map(async l => {
    try {
      const saved = await store.get(l.id, { type: 'json' });
      if (saved && saved.status !== 'error') return;
      await fetch(`${origin}/.netlify/functions/social-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-df-passcode': req.headers.get('x-df-passcode') },
        body: JSON.stringify({ id: l.id }),
        signal: AbortSignal.timeout(5000)
      });
    } catch {}
  }));
}

export default async (req) => {
  const expected = process.env.DF_CRM_PASSCODE;
  if (!expected) return json(503, { error: 'not_configured' });
  if (!passcodeMatches(req.headers.get('x-df-passcode'), expected)) {
    return json(401, { error: 'wrong_passcode' });
  }

  const url = new URL(req.url);
  const store = getStore({ name: 'df-crm', consistency: 'strong' });

  if (req.method === 'GET') {
    const list = url.searchParams.get('list');
    if (!LISTS.includes(list)) return json(400, { error: 'unknown_list' });
    const saved = await store.get(list, { type: 'json' });
    return json(200, { items: saved?.items || [] });
  }

  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = await req.json(); }
  catch { return json(400, { error: 'invalid_json' }); }

  const { list } = body;
  const upserts = Array.isArray(body.upserts) ? body.upserts : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes.map(String) : [];
  if (!LISTS.includes(list)) return json(400, { error: 'unknown_list' });
  if (!upserts.every(validItem)) return json(400, { error: 'invalid_item' });

  // Apply the changes on top of whatever is stored now, so edits made on
  // another device in the meantime are kept. The etag check retries if
  // two devices write at the same moment.
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const saved = await store.getWithMetadata(list, { type: 'json' });
    const removed = new Set(deletes);
    const before = new Map((saved?.data?.items || []).map(item => [item.id, item.status]));
    const items = (saved?.data?.items || []).filter(item => !removed.has(item.id));
    for (const item of upserts) {
      const i = items.findIndex(existing => existing.id === item.id);
      if (i === -1) items.push(item);
      else items[i] = item;
    }
    if (items.length > MAX_ITEMS) return json(413, { error: 'too_many_items' });

    const value = { items, updatedAt: new Date().toISOString() };
    const result = saved
      ? await store.setJSON(list, value, { onlyIfMatch: saved.etag })
      : await store.setJSON(list, value, { onlyIfNew: true });
    if (result.modified) {
      const [status, type] = WON[list] || [];
      const won = upserts.filter(item => status && item.status === status && before.get(item.id) !== status);
      if (won.length) await Promise.all(won.map(item => emit(type, leadSummary(item), url.origin)));
      if (list === 'venue') await draftPosts(won, req, url.origin);
      return json(200, { items });
    }
  }
  return json(409, { error: 'busy_try_again' });
};
