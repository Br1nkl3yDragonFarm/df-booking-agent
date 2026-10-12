# Dragon Forge Digital: audit of "Experience 2" and the rebuild brief

**Date:** October 12, 2026
**Audited:** `index.html`, `drone-video.html`, `styles.css`, `script.js`, `assets/forge-experience.js`, `privacy.html`, `terms.html`, `thanks.html`, `netlify.toml`, `robots.txt`, `README-LAUNCH.md`, `START-HERE.md`, `SEO-90-DAY-ROADMAP.md`, the master emblem, and the old social card image.
**Not in the upload, so not checked:** `assets/brandmark.svg`, `assets/flightpath-scene.svg`, `assets/favicon.svg`, `assets/og-card.png`. The old social card was reviewed from the attached image.
**Method:** I rendered both pages in Chromium at 1440 px desktop and at iPhone 13 size, measured contrast with the WCAG formula, and inspected the stylesheet in the browser. The audit runs in two passes: (1) does it read as AI-generated, and (2) is anything missing or broken.

---

## Verdict

The content underneath is honest and the inquiry form is well built. The site looks like a stock AI template, though, and it doesn't do the one thing it promises.

Its own manifesto says *"Every interaction on this website is a demonstration of what we can create for your business."* Apart from the menu, a scroll bar, hover effects and the FAQ accordion, nothing on the page responds to a visitor. The one dimensional feature, the tilting 3D master logo, has CSS and JavaScript written for it, but the element was never added to the HTML. **The right half of the first screen is empty on desktop.** Below the hero, three color systems take turns: black and orange, then cream and copper, then navy and teal. That happened because the v2 color override only reaches the few colors that used variables.

The rebuild keeps the strong parts (the copy discipline, the prices, the drone caveats, the form) and makes the manifesto true. Every major section is now a working sample of something you sell.

---

## What's worth keeping

| Strength | Where it went in the rebuild |
|---|---|
| Honest, specific drone copy: FAA Part 107, the indoor-only exemption, 8K "up to" wording, no guaranteed routes. This is rare and it builds trust. | Kept almost word for word in Exhibit 04 and on the Forge Flight page |
| Real starting prices with clear "starting price" framing and listed exclusions | All 10 prices kept, plus a single rate card |
| No invented testimonials, client logos, review counts or statistics | Same rule. Nothing is fabricated |
| The ownership stance ("you retain control of your domains, accounts, customer information"). It was buried as FAQ #2 | Promoted to its own section: *"If I stop paying you, do I lose my website?"* |
| Inquiry form: Netlify honeypot, consent checkbox, `maxlength`, `autocomplete`, `?service=` deep links, conditional filming fields | Kept with **identical form name and field names**, so existing Netlify settings and notifications keep working |
| Skip link, landmarks, one H1, reduced-motion handling, native `<details>` | Kept and extended |
| The idea "the proof is the experience" | This became the organizing idea of the rebuild |

---

## Pass 1: why it reads as a stock AI website

Each item below is a pattern visitors have seen on hundreds of generated sites. A pass-1 finding means rebuild the section, not tweak it.

| # | Pattern | Evidence | Replacement in the rebuild |
|---|---|---|---|
| 1 | Gradient text on the headline keyword | H1 "digital presence" uses a teal→cream→peach gradient that matches neither the emblem nor the v2 palette | Solid type only. Ember color marks one phrase, never as a gradient |
| 2 | Stacked eyebrows | A tracked-caps line *and* a pill with a glowing status dot, both above the H1 | One mono label |
| 3 | Two-button hero plus a checkmark microcopy row | "Get your free consultation" and "Explore packages", then "Made for real people · Simple to use · Built around your goals" | One action plus a numbered index of the five live samples |
| 4 | Decorative fake dashboard | `yourbusiness.com / dashboard`, "Organized", "ACTIVE" pill, floating chips. Still in the HTML, now hidden | A real-time 3D medallion of the actual emblem |
| 5 | Audience names set like a client-logo strip | "BUILT FOR THE PEOPLE BUILDING SOMETHING: LOCAL BUSINESSES · CONTRACTORS · …" | Cut. Each exhibit names who it's for in a "Best for" line |
| 6 | Icon-tile principle cards that repeat the services | Create / Connect / Protect / Grow | Cut. The exhibits show this instead of saying it |
| 7 | Six equal service cards (icon tile, bullets, arrow link) | `#services` | Five live exhibits, each ending in its package. The full line-up is listed above them, and every card links into a working sample (see the revision note below) |
| 8 | Pricing cards with a "recommended" ribbon and glyph icons | "BUILT TO CONVERT", ✦ ◈ ↗ ▣; prices in the order $249, $699, $1,299, $899 | A "maker's plate" under each exhibit, and one rate card table in price order |
| 9 | One headline formula, ten times | "Statement. *Colored twist.*": "Not just another website. *A better way to do business.*", "Clear packages. *Real deliverables.*", "Technology is powerful. *People come first.*", "Ready to build *what's next?*" … | Headlines are questions customers actually ask, e.g. "Can people save my number without typing it in?" |
| 10 | Generic four-step process | Tell us → Get a plan → Watch it take shape → Launch | Three concrete lines beside the form: what happens after you hit send |
| 11 | Giant decorative numeral | "01" at 400 px behind the manifesto; there is no 02 | Cut |
| 12 | Hover-lift and glow on every card, clickable or not | `.service-card:hover`, `.price-card:hover`, `.flight-package:hover` | Motion only where something responds to you |
| 13 | Default AI font pairing | Outfit + DM Sans | Cinzel + Instrument Sans + IBM Plex Mono (reasons below) |
| 14 | Copy that fits any agency | "Make your digital presence work for you", "Everything your business needs to show up and stand out", "Let's forge something remarkable" | Plain answers to specific questions |

---

## Pass 2: coverage (fix items)

### Critical

1. **The hero's right half is empty.** `styles.css` hides the old dashboard (`.forge-hero .hero-visual>… {display:none!important}`) and styles a `.forge-master-stage` / `.forge-master-logo` that **does not exist in `index.html`**. `forge-experience.js` looks for those elements, finds nothing, and its tilt code never runs.
2. **The Forge Flight page has no menu on phones or tablets.** Below 900 px the nav links are hidden, and `drone-video.html` has no menu button, so visitors can't reach Services, Packages or Contact except through the one CTA.
3. **Three color systems on one page.** The v2 block redefines `:root` variables, but most colors in the v1 stylesheet are hard-coded hex values. The page therefore runs black/orange → cream → navy → cream. This also means `START-HERE.md`'s instruction "to change colors, edit the variables at the top of styles.css" doesn't work.

### High

4. **The keyboard focus ring is nearly invisible on light sections.** v2 changed `--cyan` to `#72b894`; the focus outline on cream measures **2.0–2.2 : 1** (WCAG 1.4.11 requires 3 : 1).
5. **Small labels fail contrast:** section kickers 3.45–3.73 : 1, service labels 3.49 : 1, package numbers 4.10 : 1, form fine print 3.69 : 1, FAQ intro 4.04 : 1 (4.5 : 1 required). The stylesheet also has **50 font-size declarations under 12 px**, including 7 px and 8 px.
6. **The old provisional emblem is still in use.** Your notes say the master emblem is authoritative, but `brandmark.svg` still appears on the About section, the Forge Flight page header and footer, and the Privacy, Terms and Thanks pages.
7. **Internal drafting notes are visible to the public.** Privacy and Terms both show a "Before publishing: this draft should be reviewed…" banner.
8. **Social previews will look wrong.** The homepage `og:image` is the square master art, which gets cropped in 1.91 : 1 link previews. The Forge Flight page uses a relative `og:image` (`/assets/og-card.png`), which most link scrapers ignore. The old card shows the navy/teal "DF" hexagon, not the master emblem. There is no `og:url` or `twitter:card` tag.

### Medium

9. **A 43-pixel logo downloads the full 1536 × 1536 master artwork**, twice in the markup (header and footer). At that size the detail is lost anyway.
10. **No `sitemap.xml`,** although the SEO roadmap says to submit one. `robots.txt` has no `Sitemap:` line, and only the homepage has a canonical tag.
11. **Structured data contradicts the copy.** `areaServed` says "United States" while the FAQ says "rooted in Western Kentucky". The Organization has no `url` or `logo`.
12. **Package names differ between pages.** The middle drone package is "02 / SIGNATURE TOUR" on the homepage and "FEATURED OFFER" on the drone page.
13. **Dead code.** The hidden dashboard, floating chips and orbit rings from v1, the 3D-logo styles with no element, and a `.flight-package-crosssell` style with no markup. A large share of the stylesheet styles things visitors never see, and it is minified onto single lines, which makes "edit it yourself" impractical.
14. **The privacy notice says there are no third-party requests, but fonts load from Google's servers.** The rebuild self-hosts the fonts, so the statement is now true.
15. **Out-of-date docs.** `START-HERE.md` describes v1: it calls `brandmark.svg` the emblem and gives the color-variable instructions mentioned above.

### Low

16. The title tag has no service or location words ("Digital Assets & Business Solutions").
17. The About image has no `width`/`height`, so the layout shifts while it loads.
18. On the drone page, the nav and the CTA both have inline `margin-left:auto`, which spaces the header oddly.

---

## Proof inventory

**Exists and is usable now:** the master emblem; draft prices for 10 packages and 3 custom-quote services; per-package deliverables; honest drone limits and legal wording; the website itself (now with working samples).

**Exists but needs your OK before it goes public:**
- "15+ years in sales and customer-facing work" (in v2 copy; `START-HERE.md` asks you to confirm it)
- "Rooted in Western Kentucky" (same)
- The HOVERAir model. "Up to 8K" requires the X1 PROMAX
- **The Dragon Farm Records booking hub in this repository** (AI venue finder, sync-licensing advisor, booking form). It's a real build and could be your first case study. It is not on the site.

**Doesn't exist yet, so the site doesn't pretend:** client testimonials or reviews, client logos, case studies, real drone footage, a founder name or photo, a Part 107 certificate, and public contact details (none were invented).

---

## The rebuild brief

### Organizing idea

**"Try the work before you hire us."** The homepage is a sequence of five working exhibits. Each is a live sample of a service, followed by that service's package and price. Sections that only *describe* services (principle cards, a generic process, pricing cards) can't exist, because the exhibit itself is the description. The one list of services sends visitors into the samples instead of standing in for them.

### Three binding decisions

- **Type.** Each face comes from the emblem:
  - **Cinzel** for headlines: carved Roman capitals in the same style as the "DRAGON FORGE" lettering on the medallion.
  - **IBM Plex Mono** for labels, prices and telemetry: the binary digits in the emblem ring.
  - **Instrument Sans** for reading text: plain English, set at 17–18 px. Nothing smaller than 12 px.
  - All fonts are self-hosted, about 85 KB in total.
- **Color.** Every color is taken from the emblem; there's no navy, cream or teal.
  - Forge black `#0b0907`, iron surfaces, and warm ash text.
  - **Heat means action:** ember `#ff7a1a` and gold `#ffb547` appear only on things you can click, and on prices.
  - **Dragon green** `#7cc47f` appears only on "live / working" states.
  - All body text is at least 4.5 : 1 against its background.
- **Layout.** Every exhibit has the same anatomy, so the page reads like a catalog:
  1. A mono tag
  2. The customer's question (H2)
  3. A plain answer
  4. The live demo, at least 60 % of the width
  5. A **maker's plate**: package, price, inclusions, and a button that preselects the form
  
  The fly-through breaks the grid on purpose: it goes full-bleed and stays pinned while you scroll.

### Exhibit map

| # | Customer question | Live demo | Package it sells |
|---|---|---|---|
| Hero | — | Real-time 3D medallion of the emblem with embers; drag it or strike it | Interactive 3D & brand pieces (custom quote, **new line, needs your OK**) |
| 01 | "Can people save my number without typing it in?" | 3D business card you can edit live, with a real scannable QR code and a downloadable contact file | Digital Spark, $249 |
| 02 | "What am I actually paying for in a website?" | This page, pulled apart into 3D layers, with a phone/tablet/desktop toggle | Digital Foundation, $699 |
| 03 | "Can my website book appointments while I'm on a job?" | Booking lab: inquiry → CRM → instant reply → booking → reminder → review request, plus a follow-up time calculator | Revenue Engine, $1,299; Customer communication |
| 04 | "Wait — you can fly a drone *through* the house?" | Scroll-driven 3D fly-through of a modeled home with drone HUD and route minimap, labeled as a route plan, not footage | Flight Reel $349, Signature Flythrough $699, Business Spotlight $1,199 |
| 05 | "Where's the latest version of our logo?" | Scattered files and logins sorted into a labeled vault, in 3D | Asset Vault, $899 |
| — | "What can you build for my business?" | Nine service cards, each linked to its working sample and its form option; the cards catch a forge light that follows the mouse | Every service from the first site |
| — | "If I stop paying you, do I lose my website?" | Typographic statement | All services |
| — | "What does it cost?" | One rate card | Every package and care plan |

**Revision, October 12, 2026.** At the owner's request, the site keeps offering every product and service from the first deploy. A "What we build" section after the hero lists all nine services:
- the six service lines with their original inclusions: branding, websites, booking systems, asset management, customer communication, and artist & creator kits;
- Forge Flight;
- the three care plans;
- interactive 3D pieces.

Each card shows its starting price, links to the exhibit that demonstrates it, and preselects the matching form option. The heading follows the site's rule that headlines are customer questions. The audience list is in the answer text, not a logo-style strip.

**Fallbacks.**
- **No WebGL:** the hero shows the static emblem and the fly-through becomes a step-through route plan.
- **Reduced motion:** the samples still work, without the motion.
- **No JavaScript:** all content, prices and the form still work.

### Competitor check

The SEO roadmap names WebFX, Hibu, Scorpion and LocaliQ. This environment's network policy blocks those domains, so I couldn't examine them. The site makes no claims about any named competitor. The ownership message is general ("some companies rent you a website…").

---

## Open decisions for you

1. Keep "15+ years in sales and customer-facing work" and "Western Kentucky" public? Both are in the copy, as they were in v2.
2. Keep the new **Interactive 3D & brand pieces (custom quote)** line? It's there so the 3D hero maps to something you sell.
3. Add your name and a photo near the contact form. This is the strongest trust signal you can add without clients.
4. Use the Dragon Farm Records booking hub as Exhibit 06, your first real case study?
5. Confirm the HOVERAir model before advertising 8K.
6. Confirm Part 107 coverage before taking outdoor commercial flights.
7. Choose the final domain. Canonical, sitemap and social-card URLs currently use `dragon-forge-digital.netlify.app`.
