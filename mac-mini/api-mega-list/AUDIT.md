# Audit: cporter202/API-mega-list

Audited 2026-10-21 at commit `b7c914f`.

## What it is

- It's a list of links in Markdown, not software you install or run. There are 24 category folders, each holding one big README table of `name | description`.
- **11,523 of the 11,693 unique entries (98.5%) link to the Apify Store.** They're third-party "Actors": mostly web scrapers written by individual developers (top publishers: parseforge, crawlerbros, shahidirfan, easyapi). Most charge per run or per 1,000 results on your own Apify account.
- The other 170 are the list owner's own pay-per-call marketplace (APIMesa). They sit in a "featured" folder, and every one of them links to the same homepage.
- The "10,498 APIs" headline and the README badge ("11,860") don't match each other, and neither matches the deduplicated count.

## Findings

| # | Finding | Risk |
|---|---------|------|
| 1 | Every Apify link carries the owner's affiliate code `?fpr=p2hrc6` (11,022 links in the main README alone). The owner earns a commission when you sign up or pay through those links. | Low: it's disclosed, but it explains why the list exists. The local copy strips the code. |
| 2 | There are sponsored slots (APIMesa, KamdenAI, earlier ApyHub), and recent commits are mostly about swapping sponsors. | Low. Treat "featured" as advertising. |
| 3 | There's no LICENSE file, so you have no stated rights to redistribute it. | Fine for personal lookup. Don't republish it. |
| 4 | Nobody vets the entries. Anyone can publish an Apify Actor, and quality, upkeep and pricing vary widely. | Medium. Check an Actor's rating, last update and price before you pay. |
| 5 | Many entries scrape sites whose terms forbid it: LinkedIn, Instagram, TikTok, Google Maps, Ticketmaster. Lead-gen scrapers also collect personal emails and phone numbers. | Medium. Account bans and CAN-SPAM/privacy exposure fall on whoever runs the scraper, not on the list. |
| 6 | The `settings/*.js` scripts only regenerate the READMEs from Apify's public store API. They don't use secrets, run shell commands, eval code or install anything. | None found. Our setup never runs them anyway. |
| 7 | 40 MB repo, 3 MB root README. GitHub's web view truncates it, which is why a local search helps. | n/a |

**Verdict:** safe to keep locally as a directory of what's out there. It isn't a toolkit. To actually use an entry you need an Apify account and API token, and you pay per run.

## What `setup.sh` does on the Mac mini

1. Makes sure Apple's Command Line Tools are installed (for git and python3).
2. Clones the list into `~/API-mega-list/source`, or updates it if it's already there.
3. Builds `~/API-mega-list/index/` with no affiliate codes and no duplicates:
   - `index.html`: an offline search page (search box plus category filter)
   - `api-index.csv`: opens in Numbers, Excel or Google Sheets
   - `api-index.json`: the same data for scripts or agents
4. Adds an `apisearch` command for Terminal, e.g. `apisearch venue booking`.

## Entries that fit Dragon Farm (verify the price and terms before using any)

- Bandsintown concert/tour-dates scrapers: routing research and seeing who plays which rooms (`apisearch bandsintown`)
- Eventbrite and Eventim event scrapers: venues, promoters and organizer contacts by city (`apisearch eventbrite`)
- Spotify artist and playlist scrapers, 46 entries: curator and playlist research (`apisearch spotify`)
- Instagram and TikTok profile scrapers: fan and brand research. Expect ToS risk (`apisearch instagram`)
- Google Maps business scrapers: breweries, bars and wedding venues by town, which overlaps with the hub's Find Bookers (`apisearch google maps`)
- MCP servers category, 289 entries: tools Claude can call directly once Apify is connected. See `CONNECT-APIFY.md`
