# Dragon Forge Digital — website (Experience 3)

The site is built around one idea: **try the work before you hire us.** Every major section on the homepage is a working sample of something Dragon Forge Digital sells, with that service's package and price attached to it:

| Section | What visitors do | What it sells |
|---|---|---|
| Hero | Drag, strike and turn over a real-time 3D medallion of the emblem | Interactive 3D & brand pieces (custom quote) |
| Exhibit 01 | Type their details onto a 3D business card, scan its real QR code, download the contact file | Digital Spark, $249 |
| Exhibit 02 | Turn an exploded 3D view of this website, switch phone/tablet/desktop, read live speed and contrast figures | Digital Foundation, $699 |
| Exhibit 03 | Send a test inquiry and watch it get answered, booked, reminded and followed up; work out their own follow-up hours | Revenue Engine, $1,299 |
| Exhibit 04 | Scroll to fly a drone route through a 3D home, with a drone HUD and route map | Forge Flight video packages, from $349 |
| Exhibit 05 | Watch a mess of files and logins get sorted into a vault | Asset Vault, $899 |

`AUDIT.md` explains what was wrong with the previous version and why the site is built this way.

---

## Folder layout

```
dragon-forge-digital/
├── site/                  ← the website. This is the only folder that gets published.
│   ├── index.html         homepage (all the copy is here)
│   ├── drone-video.html   Forge Flight page
│   ├── privacy.html, terms.html, thanks.html, 404.html
│   ├── _headers           security headers for Netlify
│   ├── robots.txt, sitemap.xml, site.webmanifest, favicon.ico
│   └── assets/
│       ├── css/forge.css  all styling; colors and type sizes are tokens at the top
│       ├── js/            hand-written scripts (menu, form, the card/website/booking/vault samples)
│       ├── js/3d/scenes.js  BUILT FILE — the 3D hero and fly-through (don't edit by hand)
│       ├── js/vendor/qrcode.js  BUILT FILE — QR code library
│       ├── img/           emblem textures, icons, social cards
│       └── fonts/         self-hosted Cinzel, Instrument Sans, IBM Plex Mono
├── src/3d/                source for the 3D scenes (hero.js, flythrough.js, house.js)
├── tools/                 build script and texture generator
├── brand/                 the master emblem artwork
├── netlify.toml           settings for a Git-connected Netlify site
├── package.json           only needed if you change the 3D code
├── AUDIT.md
└── README.md
```

---

## 1. Preview it on your computer

Pages that use JavaScript modules don't run from a double-clicked file, so start a small local server:

```bash
cd dragon-forge-digital
npx serve site          # then open the address it prints, usually http://localhost:3000
```

Any static server works, for example `python3 -m http.server --directory site`.

The inquiry form only sends once the site is on Netlify. Locally it shows a notice instead.

## 2. Publish it on Netlify

Pick **one** of these.

**A. Connect this GitHub repository (recommended).** Every change you push is published automatically.
1. In Netlify, choose **Add new site → Import an existing project**, then pick this repository.
2. Set **Base directory** to `dragon-forge-digital`. Leave the build command and publish directory alone; `netlify.toml` supplies them.
3. Deploy. If you're replacing the old site, attach it to the existing `dragon-forge-digital` Netlify site, or move the domain over.

**B. Drag and drop.** Open https://app.netlify.com/drop and drag the **`site`** folder (not the whole project) onto the page.

This repository also holds the Dragon Farm Records booking hub at its root. That site's deploy settings are unchanged: it publishes the repository root, so it ignores this folder until you set a base directory.

## 3. Turn on the inquiry form

The form keeps the old form name `dragon-forge-inquiry` and the same field names, so an existing Netlify form setup and notifications carry over. On a new site:

1. In the Netlify dashboard, open **Forms** and choose **Enable form detection**.
2. **Deploy again.** Netlify finds forms while it deploys.
3. Send a test inquiry from the live site. Check that it appears under Forms and that you land on the thank-you page.
4. Under **Forms → Form notifications**, add an email notification to the inbox you monitor.

## 4. Editing

**Words.** All homepage copy lives in `site/index.html`, in the order it appears on the page. Each exhibit has a question (the `<h2>`), a plain answer, the sample, and a "maker's plate" with the package.

**Prices.** Each price appears in up to four places. Change all of them together:
1. The exhibit's plate (`plate__price`)
2. The rate card table (`#rates`)
3. The form's `<option value="…">`
4. Every `data-package="…"` that points at it. This value must match the option value exactly; it's how the buttons preselect the form.

The structured data near the top of `index.html` (`"minPrice"`) and `drone-video.html` also lists prices.

**Colors and type.** Edit the tokens at the top of `site/assets/css/forge.css`. Every color on the site comes from those tokens except the four business-card finishes.

**Logo.** Replace `brand/dragon-forge-master.jpg` and run `python3 tools/make-textures.py`. That rebuilds the 3D medallion textures, the small marks and all the icons. It needs Python with Pillow and numpy installed.

**The one inline script.** Every page has `<script>document.documentElement.classList.add('js')</script>` in its `<head>`. The security policy in `site/_headers` allows that exact line by its hash. If you change it, update the `sha256-…` value. Run the following command and paste the output after `sha256-`:

```bash
printf "%s" "document.documentElement.classList.add('js')" | openssl dgst -sha256 -binary | openssl base64
```

## 5. Changing the 3D scenes

The source is in `src/3d/`:
- `hero.js` is the medallion.
- `flythrough.js` is the scroll flight and HUD.
- `house.js` is the home model and the route waypoints (`ROUTE`).

After editing:

```bash
cd dragon-forge-digital
npm install        # first time only
npm run build      # writes site/assets/js/3d/scenes.js and site/assets/js/vendor/qrcode.js
```

Commit the built files too. Netlify publishes them as they are and doesn't build anything.

How the 3D behaves on different devices:
- **Phones and lower-power machines** get fewer particles, fewer lights and no glow effect.
- **Slow devices:** if frames get slow, the hero turns its glow off by itself.
- **Reduce motion turned on:** the scenes hold still. The medallion moves only when someone drags it, and the fly-through becomes a step-through you control with Prev and Next.
- **No WebGL:** visitors see the static emblem and a drawn route plan.

---

## Before you promote the site

These notes were drafting banners on the public privacy and terms pages. They belong here.

- [ ] **Legal review.** Have a qualified professional review `privacy.html`, `terms.html` and your real client agreement. The site's pages are plain-language descriptions, not contracts or legal advice.
- [ ] **Confirm the public facts.** Do you want "15+ years in sales and customer-facing work" and "Western Kentucky" shown? Both are on the homepage, and Western Kentucky is also in the title and structured data.
- [ ] **New price line.** Keep or remove "Interactive 3D & brand pieces — custom quote" in the rate card, the hero note and the form.
- [ ] **HOVERAir model.** "Up to 8K" requires the X1 PROMAX. Edit the 8K wording if you fly a different model.
- [ ] **Outdoor flights.** Arrange FAA Part 107 coverage (yourself or an insured, certificated subcontractor) before offering outdoor commercial drone work. Also check registration, Remote ID and airspace.
- [ ] **Test the form** on the live site and set up email notifications (step 3).
- [ ] **Final domain.** When you have one, replace `https://dragon-forge-digital.netlify.app` in every page's `canonical` and `og:` tags, the structured data, `sitemap.xml` and `robots.txt`.
- [ ] **Search Console.** Verify the site and submit `sitemap.xml`. See `SEO-90-DAY-ROADMAP.md` from the previous package.
- [ ] **Trust signals you can add honestly.** Your name and photo near the form, and real projects as they happen. Suggested first project: the Dragon Farm Records booking hub in this repository.
- [ ] **Real footage.** Replace or supplement the 3D route plan with fly-through footage you shot and have permission to use. Never present manufacturer footage or illustrations as client work.

## Credits and licenses

- [three.js](https://threejs.org), MIT license (bundled in `scenes.js`)
- [QR Code Generator for JavaScript](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase, MIT license
- Fonts, SIL Open Font License: Cinzel (Natanael Gama), Instrument Sans (Instrument), IBM Plex Mono (IBM)
- Everything else (code, the 3D house, the copy) was written for Dragon Forge Digital.
