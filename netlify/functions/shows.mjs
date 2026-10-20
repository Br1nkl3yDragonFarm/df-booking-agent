// ============================================================
//  DRAGON FARM — PUBLIC SHOW LIST
//
//  GET → { upcoming: [...], recent: [...] } for the public Shows page and
//  the "Next up" strip on the home page. Only booked shows with a date,
//  and never a Private Event or a show marked "keep off the public page".
//  Only what a fan needs: no money, contacts, notes or deal terms.
// ============================================================

import { isPublic, publicShow } from '../lib/listing.mjs';
import { labelToday, readList } from '../lib/store.mjs';

const MAX_UPCOMING = 50;
const MAX_RECENT = 12;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export function showLists(leads, today) {
  const shows = leads.filter(isPublic);
  const yearAgo = String(Number(today.slice(0, 4)) - 1) + today.slice(4);
  return {
    upcoming: shows.filter(l => l.eventDate >= today).sort((a, b) => a.eventDate.localeCompare(b.eventDate)).slice(0, MAX_UPCOMING).map(publicShow),
    recent: shows.filter(l => l.eventDate < today && l.eventDate >= yearAgo).sort((a, b) => b.eventDate.localeCompare(a.eventDate)).slice(0, MAX_RECENT)
      .map(l => ({ date: l.eventDate, venue: clip(l.name, 120), city: clip(l.city, 80) }))
  };
}

export default async (req) => {
  if (req.method !== 'GET') return new Response('', { status: 405 });
  const lists = showLists(await readList('venue'), labelToday());
  return new Response(JSON.stringify(lists), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' }
  });
};
