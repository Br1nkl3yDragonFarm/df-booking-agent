# Dragon Farm Records — Booking Hub
### dragonfarmgrowth.net

Independent multi-genre record label booking hub. Built for Dragon Farm Records, Nashville, TN.

---

## Features
- **Artist Roster** — Timothy Chance and Rasta Country & Poetic Nocturnal Creatures
- **Sync & Licensing** — Film, TV, ads, games licensing info
- **Booking Inquiry Form** — Direct booking requests with mailto fallback
- **Private tools** (`hub.html`, `dashboard.html`, `sync.html`, `agent.html`) — Find Bookers (live web search for venues, talent buyers, booking agencies, festivals, colleges, breweries, private events and fairs, each result linked to its source), Find Sync Contacts (the same live search for music supervisors, trailer houses, ad agencies, game studios, sync libraries and open briefs), email composer, and shared lead pipelines, all behind the team passcode

---

## Setup

### 1. Add Your Anthropic API Key
In Netlify → **dragonfarmbookingagent** → Environment variables, set `ANTHROPIC_API_KEY` (get one at https://console.anthropic.com).
The private tools call it through `netlify/functions/ai-proxy.js`, which only answers requests carrying the `DF_CRM_PASSCODE` from step 3.
Never put a real API key in the code.

### 2. Booking Email
The public booking form and contact links send to `booking@dragonfarm.net` (set in `app.js` and `index.html`).
The booking form submits through Netlify Forms (form name `booking-inquiry`); submissions appear under Netlify → **dragonfarmbookingagent** → Forms.
To get each one by email: Project configuration → Notifications → Emails and webhooks → Form submission notifications → Add notification → Email, sent to `booking@dragonfarm.net`.
If the form service can't be reached, the form falls back to opening the visitor's email app.

### 3. Turn On Shared Leads (CRM sync)
Leads in the booking and sync pipelines are saved online (Netlify Blobs) so your phone and computer see the same list.
In Netlify → **dragonfarmbookingagent** → Project configuration → Environment variables, add:
- `DF_CRM_PASSCODE` = a passcode only your team knows

Redeploy, then open any page. Enter the passcode when asked; the badge in the bottom-left corner shows **☁️ Synced across devices**.
Until the passcode is set, leads stay in each browser only (badge: **💾 This device only**) and upload automatically once it is.

### 4. Deploy to Netlify
Connect this repo to Netlify:
- **Build command:** *(leave blank)*
- **Publish directory:** `.`

---

## File Structure
```
/
├── index.html       # Main page
├── styles.css       # Public page styles
├── logo-badge.webp  # Badge cut out of logo.jpg for the public page
├── app.js           # Public page: nav and booking form
├── config.js        # Label and roster details
├── crm-store.js     # Syncs pipeline leads with the crm function
├── followups.js     # Follow-up dates, "due today" panel and touch rhythm
├── calendar.js      # Show calendar: holds, confirmed shows, double-booking checks
├── deals.js         # Offers & contracts: deal terms, deposits, red-flag checks
├── showday.js       # Show-day details and settlement: what we were paid vs. the deal
├── finder.js        # Find Bookers and Find Sync Contacts: live web search for bookers and sync contacts
├── netlify/functions/finder-background.mjs  # Runs a search (Claude + web search) in the background, booking or sync mode
├── netlify/functions/finder-status.mjs      # Returns a finished search
├── netlify/lib/passcode.mjs                 # Shared passcode check
├── netlify/functions/crm.mjs  # Shared lead storage (Netlify Blobs)
├── netlify.toml     # Netlify deploy config
└── README.md
```

---

## Artists
| Artist | Genre | Single | UPC |
|--------|-------|--------|-----|
| Timothy Chance and Rasta Country | Country-Reggae | Mr. Iron Man (Live) | 820200992949 |
| Poetic Nocturnal Creatures | Conscious Hip-Hop | Peace Pipe | 820200962904 |

---

Dragon Farm Records © 2025 · Nashville, TN
