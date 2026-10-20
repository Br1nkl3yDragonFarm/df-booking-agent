// Shared Netlify Blobs helpers for the server functions.
//
//  df-crm       the booking ('venue'), sync and brand pipelines, as the pages save them
//  df-activity  things that happen to a lead outside the pages: emails sent,
//               replies received, press kit views, online payments. Kept apart
//               from the lead itself so a page saving an older copy of a lead
//               can never wipe them out.
import { getStore } from '@netlify/blobs';

export const LISTS = ['venue', 'sync', 'brand'];
const MAX_ATTEMPTS = 8;
const MAX_PER_KIND = 25;

export const crmStore = () => getStore({ name: 'df-crm', consistency: 'strong' });
export const activityStore = () => getStore({ name: 'df-activity', consistency: 'strong' });

export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export function clean(s, max = 300) { return String(s ?? '').trim().slice(0, max); }

// Read-modify-write one JSON blob. The etag check retries when two writers
// collide. change(current) returns the new value, or undefined to leave it.
export async function updateJSON(store, key, change) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const saved = await store.getWithMetadata(key, { type: 'json' });
    const next = change(saved ? saved.data : null);
    if (next === undefined) return saved ? saved.data : null;
    const result = saved
      ? await store.setJSON(key, next, { onlyIfMatch: saved.etag })
      : await store.setJSON(key, next, { onlyIfNew: true });
    if (result.modified) return next;
  }
  throw new Error('Storage is busy, try again');
}

export async function readList(list) {
  const saved = await crmStore().get(list, { type: 'json' });
  return saved?.items || [];
}

// Add a lead unless one with the same id is already there (it may have been edited since).
export function addLeadIfNew(list, item) {
  return updateJSON(crmStore(), list, saved => {
    const items = saved?.items || [];
    if (items.some(existing => existing.id === item.id)) return undefined;
    return { items: [...items, item], updatedAt: new Date().toISOString() };
  });
}

export async function findLeadById(id) {
  for (const list of LISTS) {
    const lead = (await readList(list)).find(l => l.id === id);
    if (lead) return { list, lead };
  }
  return null;
}

// change(activityForLead) returns the lead's new activity record.
export function recordActivity(leadId, change) {
  return updateJSON(activityStore(), 'leads', all => {
    const next = { ...(all || {}) };
    next[leadId] = change({ ...(next[leadId] || {}) });
    return next;
  });
}

// Append to one of a lead's activity lists, keeping the newest entries.
export function pushCapped(list, entry) {
  return [...(list || []), entry].slice(-MAX_PER_KIND);
}

// Today's date where the label works, as YYYY-MM-DD.
export function labelToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}
