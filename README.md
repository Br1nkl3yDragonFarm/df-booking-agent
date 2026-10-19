# Dragon Farm Records — Booking Hub
### dragonfarmgrowth.net

Independent multi-genre record label booking hub. Built for Dragon Farm Records, Nashville, TN.

---

## Features
- **Artist Roster** — Timothy Chance and Rasta Country & Poetic Nocturnal Creatures
- **Sync & Licensing** — Film, TV, ads, games licensing info
- **Booking Inquiry Form** — Direct booking requests with mailto fallback; each one lands in the booking (or sync) pipeline as a lead due today
- **Press kits** (`epk.html`) — A public page per artist: bio, music, live video, past shows, draw, stage info
- **Private tools** (`hub.html`, `dashboard.html`, `sync.html`, `agent.html`, `epk-edit.html`), all behind the team passcode:
  - Find Bookers (live web search for venues, talent buyers, booking agencies, festivals, colleges, breweries, private events and fairs, each result linked to its source) and Find Sync Contacts (the same live search for music supervisors, trailer houses, ad agencies, game studios, sync libraries and open briefs)
  - Email composer, and sending from `booking@dragonfarm.net` right from the tool. Replies are caught and flag the lead; one tap drafts the next follow-up or an answer
  - Tracked press kit links in pitches: see when a buyer opened the kit
  - Shared lead pipelines with follow-ups, calendar, deals and show-day settlement
  - "Fill nearby dates": from a booked show, search for gigs within a 3-hour drive on the open days around it
  - Invoices (print, PDF or email) with optional Stripe card payment links; deposits paid online are marked received, and overdue deposits get a one-tap reminder

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

### 4. Send Email From the Tool and Catch Replies (optional, recommended)
Without this, "Review & send" opens your mail app instead and you tap "I sent it" to log the touch.
1. Make a free account at https://resend.com, add the domain `dragonfarm.net` and add the DNS records it shows. Wait until it says Verified.
2. Create an API key (sending access is enough) and add it in Netlify as `RESEND_API_KEY`.
   Optional: `DF_FROM_EMAIL` (default `Dragon Farm Booking <booking@dragonfarm.net>`) and `DF_REPLY_TO` (default `booking@dragonfarm.net`; replies go there and every email sent is BCC'd there).
3. To catch replies: in Resend, open Emails → Receiving and copy your receiving address (it ends in `.resend.app`).
   In the `booking@dragonfarm.net` mailbox, set up automatic forwarding of all mail to an address there, e.g. `replies@<yours>.resend.app`.
4. In Resend → Webhooks, add `https://<your site>/.netlify/functions/email-inbound` for the event `email.received`, then copy its signing secret into Netlify as `RESEND_WEBHOOK_SECRET`.

A reply is matched to its lead by the sender's address, or by the lead's website domain when there's no email on file. Replies from people who aren't in a pipeline are left alone.

### 5. Card Payments on Invoices (optional)
1. In Stripe → Developers → API keys, create a restricted key with write access to Products, Prices and Payment Links. Add it in Netlify as `STRIPE_SECRET_KEY`.
2. In Stripe → Developers → Webhooks, add `https://<your site>/.netlify/functions/stripe-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret into Netlify as `STRIPE_WEBHOOK_SECRET`.

Each payment link takes one payment. When a deposit is paid, the lead's deposit is marked received the next time a page opens.

### 6. Press Kits
Open **Press Kits** (`epk-edit.html`) and fill in each artist's photo link, music and video links, past shows, draw and stage info.
It starts from the bio on the public site. Add only facts you can stand behind: buyers check.

### 7. Deploy to Netlify
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
├── outreach.js      # Send emails, replies, follow-up drafts, press kit links, invoices, reminders, open dates
├── epk.html         # Public press kit page (epk.html?a=tcrc, ?a=pnc or ?a=tcrc,pnc)
├── epk-edit.html    # Press kit editor (private)
├── epk-data.js      # Press kit starting text, shared by the two pages above
├── netlify/functions/finder-background.mjs  # Runs a search (Claude + web search) in the background, booking or sync mode
├── netlify/functions/finder-status.mjs      # Returns a finished search
├── netlify/functions/crm.mjs                # Shared lead storage (Netlify Blobs)
├── netlify/functions/submission-created.mjs # Turns each booking-inquiry form submission into a lead (runs on the form event)
├── netlify/functions/email.mjs              # Sends email through Resend
├── netlify/functions/email-inbound.mjs      # Resend webhook: matches replies to leads
├── netlify/functions/activity.mjs           # Emails sent, replies, press kit views and payments, per lead
├── netlify/functions/payment-link.mjs       # Stripe payment link for an invoice
├── netlify/functions/stripe-webhook.mjs     # Stripe webhook: records payments
├── netlify/functions/epk.mjs                # Press kits: public read (counts tracked views), passcode save
├── netlify/lib/passcode.mjs                 # Shared passcode check
├── netlify/lib/store.mjs                    # Shared Blobs helpers (pipelines, activity)
├── netlify/lib/mail.mjs                     # Addresses and webhook signature checks
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
