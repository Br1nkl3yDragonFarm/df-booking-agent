# Dragon Farm Records — Booking Hub
### dragonfarmgrowth.net

Independent multi-genre record label booking hub. Built for Dragon Farm Records, Nashville, TN.

---

## Features
- **Artist Roster** — Timothy Chance and Rasta Country & Poetic Nocturnal Creatures
- **AI Venue Finder** — Search venues by city, genre, and type (powered by Claude AI)
- **Sync & Licensing** — Film, TV, ads, games licensing portal + AI sync advisor chat
- **Booking Inquiry Form** — Direct booking requests with mailto fallback

---

## Setup

### 1. Add Your Anthropic API Key
Open `config.js` and replace `"YOUR_API_KEY_HERE"` with your key:
```js
ANTHROPIC_API_KEY: "sk-ant-..."
```
Get a key at https://console.anthropic.com

> **Security Note:** For production, move the API call to a Netlify Function to keep your key server-side. Never commit a real API key to a public repo.

### 2. Update Booking Email
In `app.js`, replace `booking@dragonfarmrecords.com` with your real booking email.

### 3. Deploy to Netlify
Connect this repo to Netlify:
- **Build command:** *(leave blank)*
- **Publish directory:** `.`

---

## File Structure
```
/
├── index.html       # Main page
├── styles.css       # All styles
├── app.js           # AI + form logic
├── config.js        # API key config (don't commit real keys)
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
