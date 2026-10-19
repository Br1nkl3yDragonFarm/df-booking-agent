// ============================================================
//  DRAGON FARM — FINDER SEARCH (shared)
//
//  Searches the live web for people who book bands (booking mode) or
//  license music (sync mode), using Claude with the web search tool.
//  Every result has to come with the page it was found on, and contact
//  details are only kept if they appeared there.
//
//  Used by finder-background.mjs (searches started from the pages) and
//  weekly-background.mjs (the saved searches that run every Monday).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const MAX_CONTINUES = 4;
export const MAX_RESULTS = 25;

const BOOKING_CATEGORIES = {
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

const SYNC_CATEGORIES = {
  supervisors: 'music supervisors and music supervision companies working on film and TV',
  trailers: 'trailer houses and promo / marketing music teams',
  ads: 'ad agencies, music houses and brand music teams that license songs for commercials',
  games: 'video game studios and game audio teams that license songs',
  libraries: 'sync agencies and production music libraries that represent independent catalogs',
  briefs: 'open sync briefs and submission calls accepting music right now',
  creators: 'YouTube creators, podcasts and documentary producers that license independent music',
  lifestyle: 'lifestyle, outdoor and cannabis-friendly brands that use independent music in campaigns'
};

const BOOKING_ARTISTS = {
  'Timothy Chance and Rasta Country': 'Timothy Chance and Rasta Country (country-reggae fusion)'
};

const SYNC_TRACKS = {
  'Mr. Iron Man (Live)': '"Mr. Iron Man (Live)" by Timothy Chance and Rasta Country (country-reggae fusion)'
};

const RULES = `Rules:
- Only include organizations you found in search results during this task. Never rely on memory alone.
- Every result needs source_url: the exact page where you found it.
- Only include an email address or phone number if it appears in your search results. Never guess or construct one (no "name@company.com" patterns). If none was shown, leave it empty and give the booking, submission or contact page URL instead.
- Prefer the specific person who decides and their role when a page names them.`;

export const MODES = {
  booking: {
    categories: BOOKING_CATEGORIES,
    system: `You research booking opportunities for Dragon Farm Records, an independent label in Nashville, TN.
Use web search to find real organizations and people who book live music.
${RULES}
- Skip anything closed, pay-to-play, or clearly a poor fit for the artist.
When you are done, reply with only a JSON array, no other text. Each item:
{"name","category","city","state","contact_name","contact_role","email","phone","website","booking_url","source_url","fit","how_to_approach"}
Use "" for anything you did not find. "category" is one of: ${Object.keys(BOOKING_CATEGORIES).join(', ')}.`,
    prompt(q) {
      const artist = BOOKING_ARTISTS[q.artist] || Object.values(BOOKING_ARTISTS).join(' and ');
      return [
        `Find up to ${q.count} booking opportunities for ${artist}.`,
        `Location: ${q.location}.`,
        'Look for:',
        ...q.categories.map(c => `- ${BOOKING_CATEGORIES[c]}`),
        q.similar && `Artists similar to ours, to find who books this kind of act: ${q.similar}.`,
        q.dates && `We want to fill these dates: ${q.dates}. Favor places that book on short notice or have openings then, and say so in "fit" when the page shows it.`
      ].filter(Boolean).join('\n');
    }
  },
  sync: {
    categories: SYNC_CATEGORIES,
    system: `You research sync licensing opportunities (placing songs in film, TV, ads, games and other media) for Dragon Farm Records, an independent label in Nashville, TN that controls its masters and publishing (one-stop clearance).
Use web search to find real people and companies who license music.
${RULES}
- In how_to_approach, say whether they accept unsolicited music and how they want it sent (submission form, a specific platform, referral only), if the page says.
- Put recent or current projects or credits in "project" when you find them.
- Skip pay-to-submit schemes that charge artists per submission without a clear placement record.
When you are done, reply with only a JSON array, no other text. Each item:
{"name","category","company","project","city","state","contact_name","contact_role","email","phone","website","booking_url","source_url","fit","how_to_approach"}
"booking_url" is their submission or contact page. Use "" for anything you did not find. "category" is one of: ${Object.keys(SYNC_CATEGORIES).join(', ')}.`,
    prompt(q) {
      const track = SYNC_TRACKS[q.artist] || Object.values(SYNC_TRACKS).join(' and ');
      return [
        `Find up to ${q.count} sync licensing contacts or opportunities for ${track}.`,
        q.location && `Focus: ${q.location}.`,
        'Look for:',
        ...q.categories.map(c => `- ${SYNC_CATEGORIES[c]}`),
        q.similar && `Songs or artists with a similar sound, to find who licenses music like ours: ${q.similar}.`
      ].filter(Boolean).join('\n');
    }
  }
};

export function clean(s, max = 300) { return String(s ?? '').trim().slice(0, max); }
export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

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

function parseResults(text, urls, categories) {
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
      category: categories[r.category] ? r.category : Object.keys(categories)[0],
      company: clean(r.company, 120),
      project: clean(r.project, 200),
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

// A search request from a page (or a saved weekly search), checked and trimmed.
// problem is set when it can't run.
export function readQuery(body) {
  const modeName = body.mode === 'sync' ? 'sync' : 'booking';
  const mode = MODES[modeName];
  const q = {
    mode: modeName,
    categories: (Array.isArray(body.categories) ? body.categories : []).filter(c => mode.categories[c]).slice(0, 9),
    location: clean(body.location, 120),
    artist: clean(body.artist, 80),
    similar: clean(body.similar, 200),
    dates: modeName === 'booking' ? clean(body.dates, 200) : '',
    count: Math.min(Math.max(parseInt(body.count, 10) || 10, 3), MAX_RESULTS)
  };
  let problem = '';
  if (!q.categories.length || (modeName === 'booking' && !q.location)) {
    problem = modeName === 'booking' ? 'Pick at least one kind of booker and a location.' : 'Pick at least one kind of contact.';
  }
  return { q, problem };
}

export async function runSearch(q, mode) {
  const client = new Anthropic();
  const messages = [{ role: 'user', content: mode.prompt(q) }];
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
      system: mode.system,
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
  return { results: parseResults(text, urls, mode.categories), searches, sources: urls.size };
}


// ---- results -> pipeline leads (finder.js does the same for the pages) ----

export const LEAD_TYPES = {
  booking: {
    venues: 'Bar / Club', buyers: 'Promoter / Talent Buyer', agencies: 'Booking Agency', festivals: 'Festival', colleges: 'College',
    breweries: 'Brewery / Winery', private: 'Private Event', community: 'Fair / City Event', similar: 'Other'
  },
  sync: {
    supervisors: 'Film', trailers: 'Trailer', ads: 'Advertisement', games: 'Video Game', libraries: 'Sync Agency / Library',
    briefs: 'Other', creators: 'Creator / Podcast', lifestyle: 'Brand Campaign'
  }
};

const contactOf = r => [r.contact_name, r.contact_role && `(${r.contact_role})`].filter(Boolean).join(' ');
const notesFor = (r, linkLabel, extra) => [
  r.fit,
  r.project && `Projects: ${r.project}`,
  r.how_to_approach && `How to approach: ${r.how_to_approach}`,
  extra,
  r.booking_url && `${linkLabel}: ${r.booking_url}`,
  r.source_url && `Found on: ${r.source_url}`
].filter(Boolean).join('\n');

// A lead for the 'venue' or 'sync' list, due for a first pitch on `today`.
export function toLead(r, q, today, extraNote = '') {
  const base = { status: 'new', followUp: today, dateAdded: new Date().toISOString(), source: r.source_url, website: r.website };
  if (q.mode === 'sync') {
    return {
      ...base, name: r.name, project: r.project, category: LEAD_TYPES.sync[r.category] || 'Other',
      track: q.artist || 'Mr. Iron Man (Live)', contact: contactOf(r), email: r.email,
      notes: notesFor(r, 'Submission page', [extraNote, r.company && r.company !== r.name && `Company: ${r.company}`, r.phone && `Phone: ${r.phone}`].filter(Boolean).join('\n'))
    };
  }
  return {
    ...base, name: r.name, city: [r.city, r.state].filter(Boolean).join(', '), type: LEAD_TYPES.booking[r.category] || 'Other',
    artist: q.artist || 'Timothy Chance and Rasta Country', contactName: contactOf(r), contactEmail: r.email, contactPhone: r.phone,
    notes: notesFor(r, 'Booking page', extraNote)
  };
}

// Sites many different leads share, so a matching host says nothing.
const SHARED_HOSTS = ['facebook.com', 'instagram.com', 'linktr.ee', 'eventbrite.com', 'bandsintown.com', 'linkedin.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'google.com', 'sites.google.com'];

// Is this result someone already in the pipeline? Same name, website or email.
export function alreadyListed(r, items) {
  const name = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  const site = url => { const h = hostOf(url); return SHARED_HOSTS.includes(h) ? '' : h; };
  const n = name(r.name), host = site(r.website), email = String(r.email || '').toLowerCase();
  return items.some(l => (n && name(l.name) === n)
    || (host && site(l.website) === host)
    || (email && [l.email, l.contactEmail].some(e => String(e || '').toLowerCase() === email)));
}
