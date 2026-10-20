// Which booked shows are public, and the fan-facing part of one (no money,
// contacts or notes). Used by the public Shows page and the social posts.
import { parseTime } from './showtime.mjs';

const ACT = 'Timothy Chance and Rasta Country';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isPublic = l => l.status === 'booked' && DATE.test(l.eventDate || '') && !l.unlisted && l.type !== 'Private Event';

const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const hhmm = s => { const t = parseTime(s); return t ? `${String(t[0]).padStart(2, '0')}:${String(t[1]).padStart(2, '0')}` : ''; };
function link(u) {
  try { const url = new URL(String(u || '').trim()); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
}

export function publicShow(l) {
  return Object.fromEntries(Object.entries({
    date: l.eventDate,
    venue: clip(l.name, 120),
    city: clip(l.city, 80),
    address: clip(l.address, 160),
    artist: l.artist && l.artist !== 'Both' ? clip(l.artist, 120) : ACT,
    time: hhmm(l.setTime),
    doors: hhmm(l.doors),
    tickets: link(l.ticketUrl),
    price: clip(l.ticketPrice, 60),
    ages: clip(l.ages, 30)
  }).filter(([, v]) => v));
}
