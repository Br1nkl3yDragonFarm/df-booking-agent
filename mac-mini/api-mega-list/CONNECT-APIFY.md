# Connect Apify's MCP server to Claude

These steps come from Apify's official README (github.com/apify/apify-mcp-server), checked 2026-10-21.

All 11,500 Apify entries in the API Mega List come through **one** connector, Apify's hosted MCP server at `https://mcp.apify.com`. You don't add them one at a time. With the default tools, Claude can search the Apify Store, read an Actor's instructions and run it for you.

## Before you start

1. Create a free Apify account at apify.com. The free plan includes a small monthly credit, and anything past that is billed to the card on the account.
2. In Apify Console go to **Settings → Billing** and set a **usage limit**, e.g. $10/month. If Claude runs a scraper by mistake, this caps the bill.

## Option A: claude.ai, Claude Desktop and the Claude phone app (recommended)

1. Go to claude.ai → **Settings → Connectors → Add custom connector**.
2. Name: `Apify`. URL: one of the two below.
3. Click **Add**, then **Connect**, and log in to Apify (OAuth, so there's no token to paste).
4. In a chat, open the connectors menu (the **+** / tools button) and make sure Apify is switched on.

Once you add it on claude.ai, it's also available in Claude Desktop and the phone app.

**Which URL**

- General: Claude can find and run any Actor in the store.
  ```
  https://mcp.apify.com
  ```
- Dragon Farm set: the general tools plus five Actors from the list that Claude can call directly.
  ```
  https://mcp.apify.com?tools=actors,docs,parseforge/bandsintown-concerts-scraper,solidcode/eventbrite-scraper,compass/crawler-google-places,apify/instagram-profile-scraper,clockworks/tiktok-scraper
  ```
  These five are, in order: Bandsintown tour dates, Eventbrite events and organizers, Google Maps businesses (venues, breweries), Instagram profiles, and TikTok.

When you pass `tools=`, Apify's built-in defaults are replaced, so the URL above lists `actors,docs` to keep the store search and docs tools. To add another Actor later, append `,owner/actor-name`. You can copy the name from any link on the local search page.

## Option B: Claude Code on the Mac mini

In Terminal:

```
claude mcp add --transport http --scope user apify "https://mcp.apify.com?tools=actors,docs,parseforge/bandsintown-concerts-scraper,solidcode/eventbrite-scraper,compass/crawler-google-places,apify/instagram-profile-scraper,clockworks/tiktok-scraper"
```

Then start `claude`, type `/mcp`, pick **apify** and log in when the browser opens.

## Try it

- "Using Apify, get upcoming Bandsintown dates for [artist] and list the venues within 3 hours of Nashville."
- "Search the Apify store for a scraper that finds wedding venues, and tell me what it costs before running anything."
- "Find breweries with live music in Knoxville on Google Maps. Limit it to 20 results."

## Ground rules

- Ask Claude to **show you the Actor's price and plan the run before starting it**. Every run costs Apify credit.
- Keep runs small: "limit 20 results".
- Scraping Instagram, TikTok, LinkedIn or Google Maps goes against those sites' terms. Use the results for research, not bulk messaging, and don't put scraped personal emails into newsletters without consent (CAN-SPAM).
