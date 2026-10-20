// ============================================================
//  DRAGON FARM — SOCIAL POST DRAFTS
//
//  Claude drafts the posts that announce a booked show: an Instagram
//  caption, a Facebook post, story text, a short post (X / Threads /
//  TikTok) and a "tonight" post for the day of the show. Nothing is
//  posted automatically: the drafts wait on the show for someone to
//  copy, edit and post them.
//
//  Drafts live in Netlify Blobs (df-social), one record per lead id:
//    { status: 'running' | 'done' | 'error', posts, hashtags, show, at, posted }
//  Claude only sees the public facts of the show (lib/listing.mjs).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';

const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;
export const CHANNELS = ['instagram', 'facebook', 'story', 'short', 'dayOf'];
const LIMITS = { instagram: 2200, facebook: 3000, story: 160, short: 280, dayOf: 2200 };

export const socialStore = () => getStore({ name: 'df-social', consistency: 'strong' });

const SYSTEM = `You write social media posts for Dragon Farm Records, an independent label in Nashville, Tennessee, announcing live shows by its band.

About the band: Timothy Chance and Rasta Country play country reggae: country soul over reggae roots, fiddles meeting riddims, boots on the dance floor. The debut single is "Mr. Iron Man (Live)". They play festivals, clubs, bars and private events.

Voice: warm, confident and plain-spoken, like the band talking to its own fans. Southern hospitality with an island lilt, never corporate and never hype-bot. A few emoji at most, only where they help.

Rules:
- Use only the show facts given. Never invent other acts on the bill, prices, ages, set times, specials or anything else not listed. If a fact isn't given, leave it out.
- Write dates the way people say them ("Thursday, November 19"), and times like "9 PM".
- Every post must name the venue, the town and the date.
- Instagram captions can't hold clickable links, so point to "the link in our bio" for tickets. Facebook and the short post include the ticket link if one is given, otherwise the Shows page link.
- Don't put hashtags inside the posts; return them separately.`;

const SCHEMA = {
  type: 'object',
  properties: {
    instagram: { type: 'string', description: 'Instagram feed caption announcing the show: 3 to 6 short lines, a clear call to get tickets via the link in bio. No hashtags.' },
    facebook: { type: 'string', description: 'Facebook post announcing the show, a little fuller than Instagram, ending with the ticket or Shows page link. No hashtags.' },
    story: { type: 'string', description: 'Text to lay over an Instagram/Facebook story: at most two short lines, under 120 characters in total.' },
    short: { type: 'string', description: 'A post for X, Threads or a TikTok caption: under 260 characters including the link.' },
    dayOf: { type: 'string', description: 'A post for the day of the show ("Tonight…"): 2 to 4 short lines with doors/show time if given and where to get tickets. No hashtags.' },
    hashtags: { type: 'array', items: { type: 'string' }, description: '5 to 8 relevant hashtags: genre, the town, the venue if it has a known tag. Each starts with #.' }
  },
  required: ['instagram', 'facebook', 'story', 'short', 'dayOf', 'hashtags'],
  additionalProperties: false
};

const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
function time12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

// The show facts Claude may use, as plain lines (show = publicShow(lead)).
export function showFacts(show, site) {
  return [
    `Band: ${show.artist}`,
    `Venue: ${show.venue}`,
    show.city && `Town: ${show.city}`,
    show.address && `Address: ${show.address}`,
    `Date: ${longDate(show.date)}`,
    show.doors && `Doors: ${time12(show.doors)}`,
    show.time && `Show time: ${time12(show.time)}`,
    show.ages && `Ages: ${show.ages}`,
    show.price && `Tickets: ${show.price}`,
    show.tickets ? `Ticket link: ${show.tickets}` : 'Ticket link: none yet',
    `Shows page (all dates): ${site}/shows.html`
  ].filter(Boolean).join('\n');
}

function clean(out) {
  const posts = {};
  for (const c of CHANNELS) posts[c] = String(out[c] || '').trim().slice(0, LIMITS[c]);
  const hashtags = [...new Set((Array.isArray(out.hashtags) ? out.hashtags : [])
    .map(h => '#' + String(h).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(h => h.length > 2))].slice(0, 10);
  return { posts, hashtags };
}

// → { posts: { instagram, facebook, story, short, dayOf }, hashtags: [...] }
export async function writePosts(show, site) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // If a safety check declines the request, the API retries it on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Write the posts announcing this show.\n\n${showFacts(show, site)}` }]
  });
  if (response.stop_reason === 'refusal') throw new Error('The writing assistant declined to write these posts.');
  if (response.stop_reason === 'max_tokens') throw new Error('The drafts came back cut off. Try again.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { throw new Error('The drafts came back in the wrong shape. Try again.'); }
  const result = clean(out);
  if (!result.posts.instagram || !result.posts.facebook) throw new Error('The drafts came back empty. Try again.');
  return result;
}
