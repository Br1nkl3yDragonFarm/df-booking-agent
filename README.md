# Dragon Farm Records — Booking Hub
### dragonfarmgrowth.net

Independent multi-genre record label booking hub. Built for Dragon Farm Records, Nashville, TN.

---

## Features
- **Artist Roster** — Timothy Chance and Rasta Country (Poetic Nocturnal Creatures is off the roster for now)
- **Sync & Licensing** — Film, TV, ads, games licensing info
- **Booking Inquiry Form** — Direct booking requests with mailto fallback; each one lands in the booking (or sync) pipeline as a lead due today
- **Press kit** (`epk.html`) — A public page for the band: bio, music, live video, past shows, draw, stage info
- **Private tools** (`hub.html`, `dashboard.html`, `sync.html`, `agent.html`, `epk-edit.html`, `report.html`), all behind the team passcode:
  - Find Bookers (live web search for venues, talent buyers, booking agencies, festivals, colleges, breweries, private events and fairs, each result linked to its source) and Find Sync Contacts (the same live search for music supervisors, trailer houses, ad agencies, game studios, sync libraries and open briefs)
  - Email composer, and sending from `booking@dragonfarm.net` right from the tool. Replies are caught and flag the lead; one tap drafts the next follow-up or an answer
  - Tracked press kit links in pitches: see when a buyer opened the kit
  - Shared lead pipelines with follow-ups, calendar, deals and show-day settlement
  - "Fill nearby dates": from a booked show, search for gigs within a 3-hour drive on the open days around it
  - Invoices (print, PDF or email) with optional Stripe card payment links; deposits paid online are marked received, and overdue deposits get a one-tap reminder
  - What's working (`report.html`): which kinds of leads, towns and lead sources turn into shows or placements, what they pay on average, and which emails get answered, plus charts of emails sent and replies by week and show money by month (Chart.js)
  - Sync kit: a fee quote for each kind of placement (from the label's sync playbook, adjusted for use, term, territory and exclusivity), a printable one-stop sync + master license, links to the full mix, clean, instrumental and edits ready to tick into a pitch, and a pitch log of which song and versions went to which supervisor
  - Brand deals (`brands.html`): find sponsors and lifestyle brands that fit the band (drinks, outdoor, Western lifestyle, trucks, food, gear, events, cannabis where legal), an AI-drafted pitch that leads with fit and a content idea, and a deal check that flags exposure-only pay, rights grabs and forever exclusivity
  - Sign deals online: a performance agreement written from the deal (or the sync license, or a brand partnership agreement) goes out as a private link; they draw a signature on their phone, both sides get the signed PDF, and the deal is marked signed
  - Shows in your calendar: “📅 Calendar” on a booked show adds it to Google, Outlook or Apple Calendar; “📲 Subscribe” on the Calendar page gives one secret link that puts every booked show and hold on the band's phones and keeps them up to date
  - Import from a spreadsheet: “Import CSV” on the booking, sync and brand pipelines reads a CSV from Excel, Google Sheets or another CRM, matches its columns to the lead's fields, previews it and skips anyone already in the pipeline
  - Real distances: leads show “📍 ~17 mi from Exit/In (Nov 9)” when they're near an upcoming booked show, “Fill nearby dates” results are sorted by miles from the show (too-far ones flagged), and booked shows show the drive to the next one, flagging long drives on back-to-back days
  - Email typo hints: “Did you mean jane@gmail.com?” under any email field (leads, the send window, fan sign-up), with one tap to fix
  - Fan newsletters: from the Fan list, email everyone or chosen towns a branded email (MJML) with a headline, message, ticket button and upcoming shows; each fan gets a one-click unsubscribe link, and the label's mailing address is in every email as US law requires
  - Phone numbers: tidied as you type them in, impossible ones flagged, and tap-to-call and text links on leads, show cards, brands and finder results
  - Fan list: a QR code for the merch table (from any booked show) opens a sign-up page; fans land on a private list counted by town, with CSV export, removal on request, counts for the press kit's draw and a fans-by-town table in the report
  - Weekly automatic searches: save any finder search to run every Monday morning; new places land in the pipeline, and a digest of what's due goes out by email and/or Discord

---

## Setup

### 1. Add Your Anthropic API Key
In Netlify → **dragonfarmbookingagent** → Environment variables, set `ANTHROPIC_API_KEY` (get one at https://console.anthropic.com).
The private tools call it through `netlify/functions/ai-proxy.mjs`, which only answers requests carrying the `DF_CRM_PASSCODE` from step 3.
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

### 6. Weekly Searches and the Monday Digest (optional)
In **Find bookers** or **Find sync contacts**, set up a search and tap **⟳ Run this search every Monday**. Every Monday at about 8 am Nashville time (7 am in winter), the saved searches run, places not already in a pipeline are added as new leads due that day, and a digest goes out listing new leads, follow-ups due (unanswered replies first), overdue deposits and this week's shows.
- **Email:** goes out through Resend (step 4) to the booking inbox. To send it somewhere else, add `DF_DIGEST_TO` in Netlify: one address, or several separated by commas.
- **Discord (optional):** in your Discord server, open the channel's **Edit Channel → Integrations → Webhooks → New Webhook**, copy its URL and add it in Netlify as `DISCORD_WEBHOOK_URL` (mark it secret).
- **Run all now** and **Send a digest now** on the finder let you try it without waiting for Monday. Each search costs about the same as running it by hand.

### 7. Song Versions for Sync
On the sync page, open **Pitch composer → Versions ready to send** and paste share links (Dropbox, Google Drive, DISCO…) for the full mix, clean and instrumental versions, plus BPM, mood, writers and publisher. Supervisors often need a clean or instrumental version; without them you lose placements. Have a music attorney look over the one-stop license before the first one goes out.

### 8. Fan List at Shows
On **Booked shows**, tap **📱 Fan QR** on a show and **Print a sign** for the merch table. Fans scan it, add their email and town, and land on the private **Fan list** (`fan-list.html`). Sign-ups come in through Netlify Forms (the form is named `fan-signup`; Netlify's spam filter applies), so form detection must stay on in Netlify. Export the list as CSV to your email tool to send news, and remove anyone who asks. In the press kit editor, **+ Add fan list numbers** puts the real counts in the draw.

### 9. Fan Newsletters
On the **Fan list** page, **Email your fans** sends a branded email to everyone or to chosen towns, through Resend (step 4). Before the first send, add the label's postal address in Netlify as `DF_MAILING_ADDRESS` (a PO box works): US law (CAN-SPAM) requires it in marketing email, and the tool won't send without it. Use **Send me a test** first. Resend's free plan sends up to 100 emails a day; a bigger list needs a paid plan.

### 10. Press Kits
Open **Press Kits** (`epk-edit.html`) and fill in the artist's photo link, music and video links, past shows, draw and stage info.
It starts from the bio on the public site. Add only facts you can stand behind: buyers check.

### 11. Automations with n8n (optional)
The tool can tell [n8n](https://n8n.io) (a drag-and-drop workflow tool) when something happens: a show is booked, a sync is licensed, a brand deal is signed, someone replies, a deposit is paid, an agreement is signed, an inquiry or a fan sign-up comes in, the Monday rundown goes out. n8n then does the follow-on chores: post to Discord or social media, add a row to a Google Sheet, text you.
1. Get n8n: n8n Cloud, or self-host the free version.
2. In n8n, **Import from file** → `n8n/dragon-farm-events.json`. Open its **Webhook** step, copy the **Production URL**, and turn the workflow on.
3. In Netlify, add `N8N_WEBHOOK_URL` (that URL). Optionally add `N8N_WEBHOOK_SECRET` (any long random text) and put the same text in the workflow's **Settings** step, so n8n ignores events that didn't come from you.
4. Open **Automations** (`automations.html`) and send a test event.

The workflow's Discord and Google Sheets steps start switched off: paste a Discord channel webhook in **Settings**, or connect Google and pick a sheet, then switch the step on. If n8n is down, nothing in the tool breaks; that event just isn't sent.

### 12. Deploy to Netlify
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
├── epk.html         # Public press kit page (epk.html?a=tcrc)
├── epk-edit.html    # Press kit editor (private)
├── epk-data.js      # Press kit starting text, shared by the two pages above
├── report.html      # What's working report (private)
├── sync-kit.js      # Sync quotes, one-stop license, versions on file, pitch log
├── brands.html      # Brand deals: pipeline, brand finder, pitches, deal check (private)
├── sign.html        # Public page where the other side reads and signs an agreement
├── esign.js         # Writes agreements from the deal and sends them for signature
├── showcal.js       # Add a show to a calendar (datebook) and the subscribe link
├── importer.js      # Import leads from a CSV (Papa Parse): column matching, duplicates skipped
├── distance.js      # Miles between towns (geolib + US city coordinates)
├── emailcheck.js    # “Did you mean …?” hints for mistyped email addresses (Mailcheck)
├── phone.js         # Phone formatting, checks and call/text links (libphonenumber-js)
├── fans.html        # Public fan sign-up page the merch-table QR code opens (Netlify form "fan-signup")
├── fan-list.html    # Fan list by town, CSV export, QR maker (private)
├── fans.js          # Fan list helpers and the QR code / printable sign
├── automations.html # n8n status and test events (private)
├── n8n/dragon-farm-events.json              # Ready-to-import n8n workflow: checks the signature, writes a message, routes by event
├── vendor/          # Third-party browser libraries, all MIT, each with its license header:
│                    #   qrcode.js, signature_pad.js, datebook.js, papaparse.js, geolib.js, mailcheck.js, libphonenumber.js, chart.js,
│                    #   us-cities.json (US-Cities-Database by Kelvin S. do Prado, MIT)
├── report.js        # Report numbers: conversion and pay by kind, town and source; which pitches get replies
├── netlify/functions/finder-background.mjs  # Runs a search (Claude + web search) in the background, booking or sync mode
├── netlify/functions/finder-status.mjs      # Returns a finished search
├── netlify/functions/crm.mjs                # Shared lead storage (Netlify Blobs): booking, sync and brand pipelines
├── netlify/functions/submission-created.mjs # Booking inquiries become leads; fan sign-ups go to the fan list (runs on the form event)
├── netlify/functions/email.mjs              # Sends email through Resend
├── netlify/functions/email-inbound.mjs      # Resend webhook: matches replies to leads
├── netlify/functions/activity.mjs           # Emails sent, replies, press kit views and payments, per lead
├── netlify/functions/payment-link.mjs       # Stripe payment link for an invoice
├── netlify/functions/stripe-webhook.mjs     # Stripe webhook: records payments
├── netlify/functions/epk.mjs                # Press kits: public read (counts tracked views), passcode save
├── netlify/functions/sign.mjs               # Signing links, signatures, signed PDFs (pdf-lib), emails both sides
├── netlify/functions/calendar-feed.mjs      # Subscribable calendar of shows and holds (ical-generator), behind a secret link
├── netlify/lib/showtime.mjs                 # Reads typed show times ("9 PM", "21:00")
├── netlify/functions/newsletter.mjs         # Fan newsletter: preview, test, send by town through Resend (batches)
├── netlify/functions/unsubscribe.mjs        # One-click unsubscribe from the newsletter
├── netlify/lib/newsletter.mjs               # The newsletter email (MJML) and its text version
├── netlify/lib/unsubscribe.mjs              # Signed unsubscribe links
├── netlify/functions/fans.mjs               # Fan list: read and remove (passcode)
├── netlify/lib/fans.mjs                     # Adds fan sign-ups (one entry per email)
├── netlify/functions/catalog.mjs            # Song versions (links) and metadata for sync pitches
├── netlify/functions/weekly.mjs             # Weekly searches: save, remove, run now, send the digest now
├── netlify/functions/weekly-run.mjs         # Scheduled every Monday: starts the weekly run
├── netlify/functions/weekly-background.mjs  # Runs the saved searches, adds new leads, sends the digest
├── netlify/lib/finder.mjs                   # The finder search itself, shared by the page searches and the weekly run
├── netlify/lib/digest.mjs                   # Builds and sends the Monday digest (email and/or Discord)
├── netlify/lib/weekly.mjs                   # Where weekly searches and the last run are kept
├── netlify/functions/automations.mjs        # Automations status and sample events (passcode)
├── netlify/lib/events.mjs                   # Sends events to n8n (signed, never blocks the thing that caused it)
├── netlify/lib/passcode.mjs                 # Shared passcode check
├── netlify/lib/store.mjs                    # Shared Blobs helpers (pipelines, activity)
├── netlify/lib/mail.mjs                     # Sending through Resend, addresses and webhook signature checks
├── netlify.toml     # Netlify deploy config
└── README.md
```

---

## Artists
| Artist | Genre | Single | UPC |
|--------|-------|--------|-----|
| Timothy Chance and Rasta Country | Country-Reggae | Mr. Iron Man (Live) | 820200992949 |

---

Dragon Farm Records © 2025 · Nashville, TN
