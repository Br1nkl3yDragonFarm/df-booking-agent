// ============================================================
//  DRAGON FARM — BOOKER FINDER (background job)
//
//  Searches the live web for venues, talent buyers, booking agencies,
//  festivals and anyone else who books bands, using Claude with the
//  web search tool. Every result has to come with the page it was
//  found on, and contact details are only kept if they appeared there.
//
//  Netlify answers the browser with 202 straight away and this keeps
//  running (up to 15 minutes). The result is written to Blobs under the
//  job id, where finder-status.mjs hands it back.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { passcodeMatches } from '../lib/passcode.mjs';

export const config = { background: true };

const MODEL = 'claude-opus-5-5';
const MAX_CONTINUES = 4;
const MAX_RESULTS = 25;

const CATEGORIES = {
  venues: 'live music venues, clubs and bars that book touring and regional acts',
  buyers: 'talent buyers and independent promoters who book shows (the person, not just the room)',
  agencies: 'booking agencies and agents who take on independent artists in these genres',
  festivals: 'music festivals that book independent or regional acts, with their submission process',
  colleges: 'colleges and universities that book bands (campus activities / programming boards)',
  breweries: 'breweries, wineries, distilleries and restaurants with regular live music',
  private: 'private and corporate event planners, wedding and event entertainment companies',
  community: 'fairs, city concert series, community events and summer concert programs',
  similar: 'venues, promoters and festivals that recently booked artists similar to ours'
};

const ARTISTS = {
  'Timothy Chance and Rasta Country': 'Timothy Chance and Rasta Country (country-reggae fusion)',
  'Poetic Nocturnal Creatures': 'Poetic Nocturnal Creatures (conscious hip-hop)'
};

const SYSTEM = `You research booking opportunities for Dragon Farm Records, an independent label in Nashville, TN.
Use web search to find real organizations and people who book live music. Rules:
- Only include organizations you found in search results during this task. Never rely on memory alone.
- Every result needs source_url: the exact page where you found it.
- Only include an email address or phone number if it appears in your search results. Never guess or construct one (no "booking@venuename.com" patterns). If none was shown, leave it empty and give the booking, submission or contact page URL instead.
- Prefer the specific person who books (talent buyer, booker, programming board) and their role when a page names them.
- Skip anything closed, pay-to-play, or clearly a poor fit for the artist.
When you are done, reply with only a JSON array, no other text. Each item:
{"name","category","city","state","contact_name","contact_role","email","phone","website","booking_url","source_url","fit","how_to_approach"}
Use "" for anything you did not find. "category" is one of: ${Object.keys(CATEGORIES).join(', ')}.`;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function buildPrompt(q) {
  const artist = ARTISTS[q.artist] || `${ARTISTS['Timothy Chance and Rasta Country']} and ${ARTISTS['Poetic Nocturnal Creatures']}`;
  const lines = [
    `Find up to ${q.count} booking opportunities for ${artist}.`,
    `Location: ${q.location}.`,
    'Look for:',
    ...q.categories.map(c => `- ${CATEGORIES[c]}`)
  ];
  if (q.similar) lines.push(`Artists similar to ours, to find who books this kind of act: ${q.similar}.`);
  if (q.notes) lines.push(`Also keep in mind: ${q.notes}`);
  return lines.join('\n');
}

function clean(s, max = 300) { return String(s ?? '').trim().slice(0, max); }
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

// URLs the search actually returned, so each result can be checked against them.
function collectSources(content, urls) {
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url) urls.add(r.url);
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c.url) urls.add(c.url);
    }
  }
}

function parseResults(text, urls) {
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('The search did not return a list of results.');
  const raw = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(raw)) throw new Error('The search did not return a list of results.');
  const hosts = new Set([...urls].map(hostOf));
  return raw.slice(0, MAX_RESULTS).filter(r => r && r.name).map(r => {
    const source = clean(r.source_url, 500);
    const email = clean(r.email, 120);
    return {
      name: clean(r.name, 120),
      category: CATEGORIES[r.category] ? r.category : 'venues',
      city: clean(r.city, 80),
      state: clean(r.state, 40),
      contact_name: clean(r.contact_name, 120),
      contact_role: clean(r.contact_role, 120),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
      phone: clean(r.phone, 40),
      website: clean(r.website, 500),
      booking_url: clean(r.booking_url, 500),
      source_url: source,
      // The source page was one the search really returned (or on the same site).
      verified: !!source && (urls.has(source) || hosts.has(hostOf(source))),
      fit: clean(r.fit, 400),
      how_to_approach: clean(r.how_to_approach, 400)
    };
  });
}

async function runSearch(q) {
  const client = new Anthropic();
  const messages = [{ role: 'user', content: buildPrompt(q) }];
  const urls = new Set();
  let searches = 0;
  let response;
  for (let i = 0; i <= MAX_CONTINUES; i++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(4 + q.categories.length * 2, 15) }],
      messages
    });
    collectSources(response.content, urls);
    searches += response.usage?.server_tool_use?.web_search_requests || 0;
    // A long search can pause; send the turn back to let it carry on.
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  if (response.stop_reason === 'refusal') throw new Error('The search was declined. Try rewording it.');
  if (response.stop_reason === 'pause_turn') throw new Error('The search ran too long. Try fewer categories or a smaller area.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { results: parseResults(text, urls), searches, sources: urls.size };
}

export default async (req) => {
  // Background functions retry on a thrown error, which would run (and bill) the
  // search again, so every failure is recorded instead of thrown.
  if (!passcodeMatches(req.headers.get('x-df-passcode'), process.env.DF_CRM_PASSCODE)) return json(401, {});
  let body;
  try { body = await req.json(); } catch { return json(400, {}); }
  const jobId = String(body.jobId || '');
  if (!/^[a-z0-9-]{8,64}$/i.test(jobId)) return json(400, {});

  const q = {
    categories: (Array.isArray(body.categories) ? body.categories : []).filter(c => CATEGORIES[c]).slice(0, 9),
    location: clean(body.location, 120),
    artist: clean(body.artist, 80),
    similar: clean(body.similar, 200),
    notes: clean(body.notes, 300),
    count: Math.min(Math.max(parseInt(body.count, 10) || 10, 3), MAX_RESULTS)
  };
  const store = getStore({ name: 'df-finder', consistency: 'strong' });
  if (!q.location || !q.categories.length) {
    await store.setJSON(jobId, { status: 'error', message: 'Pick at least one kind of booker and a location.', query: q });
    return json(400, {});
  }

  await store.setJSON(jobId, { status: 'running', startedAt: new Date().toISOString(), query: q });
  try {
    const { results, searches, sources } = await runSearch(q);
    await store.setJSON(jobId, { status: 'done', finishedAt: new Date().toISOString(), query: q, results, searches, sources });
  } catch (err) {
    const message = err instanceof Anthropic.APIError
      ? `The search service returned an error (${err.status}). Try again in a minute.`
      : err.message || 'The search failed.';
    await store.setJSON(jobId, { status: 'error', finishedAt: new Date().toISOString(), query: q, message });
  }
  return json(200, {});
};
