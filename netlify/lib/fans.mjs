// The fan list (email sign-ups from shows), in Netlify Blobs (df-fans).
// Private: only the passcode-protected fans.mjs function reads it.
import { getStore } from '@netlify/blobs';
import { clean, updateJSON } from './store.mjs';

const MAX_FANS = 20000;
export const fansStore = () => getStore({ name: 'df-fans', consistency: 'strong' });
export const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

// One entry per email. Signing up again at another show updates the town
// and adds the show, so the list shows who comes back.
export function addFan(input) {
  const email = clean(input.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return Promise.resolve(null);
  const at = clean(input.at, 40) || new Date().toISOString();
  const show = clean(input.show, 160);
  return updateJSON(fansStore(), 'list', saved => {
    const fans = saved?.fans || [];
    const i = fans.findIndex(f => f.email === email);
    if (i === -1) {
      if (fans.length >= MAX_FANS) return undefined;
      return { fans: [...fans, { email, name: clean(input.name, 120), city: clean(input.city, 120), shows: show ? [show] : [], first: at, last: at }] };
    }
    const f = fans[i];
    const next = {
      ...f,
      name: f.name || clean(input.name, 120),
      city: clean(input.city, 120) || f.city,
      shows: show && !f.shows.includes(show) ? [...f.shows, show].slice(-20) : f.shows,
      last: at > f.last ? at : f.last
    };
    return { fans: fans.map((x, j) => j === i ? next : x) };
  });
}

// "nashville, tn" and "Nashville, TN" are one town (same rule as report.js and fans.js).
export function townOf(city) {
  const c = String(city || '').trim().replace(/\s+/g, ' ');
  if (!c) return 'No town set';
  return c.split(', ').map((part, i) => i > 0 && part.length === 2 ? part.toUpperCase()
    : part.replace(/\b\w/g, ch => ch.toUpperCase())).join(', ');
}
