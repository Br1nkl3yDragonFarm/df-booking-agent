# Dragon Farm on the Mac mini

These are 11 open-source AI tools, each checked against what Dragon Farm needs: booking shows, landing sync placements and brand deals, growing the fan list, and making content for Timothy Chance and Rasta Country. They were also checked against a Mac mini with Apple Silicon, which has no NVIDIA graphics card.

Checked 21 Oct 2026 from each project's GitHub page. These projects move fast, so check again before relying on a detail.

## Verdicts

| Tool | Verdict | What it does for Dragon Farm | Runs on the Mac mini? | Cost / keys |
|---|---|---|---|---|
| **slide-maker** ([addsumtech/slides_maker](https://github.com/addsumtech/slides_maker), MIT) | ✅ **Use** | Sponsor pitch decks, sync one-sheets, a venue or festival pitch deck, a yearly label review. Decks are real, editable PowerPoint/Keynote files. | Yes (CPU only, needs LibreOffice) | None beyond Claude Code |
| **OpenChatCut** ([0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut), AGPL-3.0) | ✅ **Use** | Cut live footage into clips and reels by chatting: trims pauses, adds captions and music. Exports MP4 and SRT. Claude Code can drive it. | Yes (official Apple Silicon build) | Your Anthropic key for its built-in agent; editing works without a key |
| **WeKnora** ([Tencent/WeKnora](https://github.com/Tencent/WeKnora), MIT) | ✅ **Use** | One searchable label brain: contracts, EPKs, venue notes, the label playbooks, exported pipeline summaries. Ask "what did we agree with Exit/In?" and get an answer with sources. | Yes, in Docker; embeddings run in Ollama on the Mac | Free with Ollama; Claude optional |
| **BambooAI** ([pgalko/BambooAI](https://github.com/pgalko/BambooAI), MIT) | ✅ **Use** | Ask questions of the exported CRM ("which towns book us and pay best?", "which pitch subjects get replies?") and get charts and a checked report. Goes further than `report.html`. | Yes (needs Docker) | Anthropic or OpenRouter key; or free with Ollama |
| **video-shotcraft** ([Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft), Apache-2.0) | 🟡 **Use, with a check** | Turns the public Shows page or press kit into a short cinematic promo for social or a pitch email. | Yes (renders on the CPU, so slowly) | Free. It renders with Remotion: [check Remotion's licence](https://www.remotion.dev/license) for company use. |
| **founder-skill** ([Jakeschincariol/founder-skill](https://github.com/Jakeschincariol/founder-skill), MIT) | 🟡 **Use selectively** | `founder-pricing` (merch and ticket prices), `founder-offer` (VIP and bundle offers), `founder-launch` (release rollouts), `founder-cfo` (tour maths). The rest overlaps the SNOOP skills you already have. | Yes | None beyond Claude Code |
| **Vindex** ([vaibhav-space/vindex](https://github.com/vaibhav-space/vindex), MIT) | ⏸ **Not now** | Could index hours of show footage so Claude can find moments by searching. | Yes, it's built for Apple Silicon | Free. But it is a v0.1 prototype that hasn't changed since July, and `pip install vindex` installs a *different* package. Revisit if it comes back to life. |
| **MiroFish** ([666ghj/MiroFish](https://github.com/666ghj/MiroFish), AGPL-3.0) | ❌ **Skip** | "Predicting" how fans will react with thousands of simulated agents. These are role-play guesses that nobody has validated. | Yes | Costly per run. By default it sends your data to Alibaba's cloud and to Zep Cloud. A real poll of the fan list beats it. |
| **Maestro** ([Blizaine/Maestro](https://github.com/Blizaine/Maestro)) | ❌ **Skip** | AI music videos. | **No**: it needs an NVIDIA GPU, and its WanGP engine is broken for video on Apple Silicon | Its licence is **non-commercial only**, so it can't be used for label releases |
| **ArtCraft** ([storytold/artcraft](https://github.com/storytold/artcraft)) | ❌ **Skip** | 3D scene and camera control for AI images and video. | The app runs, but all generation happens in the cloud | Paid credits or other paid accounts. The OpenArt and ElevenLabs connectors already cover visuals. |
| **image-blaster** ([neilsonnn/image-blaster](https://github.com/neilsonnn/image-blaster)) | ❌ **Skip** | Turns a photo into a 3D world with sound effects. Impressive, but nothing in booking, sync or fans needs it. | Cloud-only | Paid World Labs and FAL keys for every image. Its project settings also pre-approve shell commands and run hooks automatically. |

**How the six "use" tools fit together:** the CRM (on Netlify) is exported every morning by `export-crm.mjs` into `~/dragon-farm-data/latest/`.
- BambooAI analyses the CSVs.
- WeKnora indexes `summary.md` and your documents.
- slide-maker and founder-skill run inside Claude Code against the same files.
- OpenChatCut and video-shotcraft make the content that the Posts drafts (`posts.js`) go out with.

## Setup

Check what the Mac mini has first: Apple menu → About This Mac. 16 GB of memory is enough for everything above. 8 GB will struggle with WeKnora and Docker running together.

```bash
git clone https://github.com/Br1nkl3yDragonFarm/df-booking-agent.git ~/df-booking-agent
cd ~/df-booking-agent/mac-mini
./setup.sh base                 # Homebrew packages (install Homebrew first: https://brew.sh)
./setup.sh export               # asks for the site address and team passcode once
./setup.sh slides founder shotcraft
./setup.sh chatcut              # downloads and checks the checksum; you drag it to Applications
./setup.sh bamboo weknora       # these need Docker; the script installs OrbStack if you have none
```

Each step can be run again safely. Here is what each one does that you should know about:

- **export** saves the site address and passcode in `~/.dragon-farm.env`, which only you can read. It then refreshes `~/dragon-farm-data/latest` every day at 7 am.
  - Those files contain contacts and money, so they stay on this Mac.
  - The fan list is exported only when you run `node export-crm.mjs --fans` yourself.
  - Analyse fans only with a local Ollama model, never a cloud one.
- **weknora** writes fresh secrets into WeKnora's `.env`, replacing its published default passwords.
  - It also makes WeKnora reachable only from the Mac itself, at http://127.0.0.1:8088.
  - **Back up that `.env`.** If its encryption key is lost, the saved model keys can't be read back.
- **slides** stops before running slide-maker's installer so you can read the installer first.
- **chatcut** refuses the download if its checksum doesn't match the one OpenChatCut published.
  - The app isn't notarized by Apple, so the first launch needs right-click → Open.

## Ready-to-use prompts

Run these in Claude Code from `~/df-booking-agent` after setup.

- **Sponsor deck (slide-maker):** "Use slide-maker to build an 8-slide sponsor deck for Timothy Chance and Rasta Country aimed at outdoor and Western lifestyle brands. Use only facts from `epk-data.js` and `~/dragon-farm-data/latest/summary.md`. Include draw by town, upcoming shows and two content ideas. No invented numbers."
- **Sync one-sheet (slide-maker):** "Make a one-slide sync one-sheet for 'Mr. Iron Man (Live)': mood, BPM, versions available (full, clean, instrumental), one-stop clearance, contact. Leave blanks where I haven't given you the fact."
- **Show promo (video-shotcraft):** "Make a 20-second vertical promo of https://dragonfarmgrowth.net/shows.html for Instagram Reels."
- **Merch pricing (founder-pricing):** "Price a tour T-shirt, a hat and a signed poster for small Nashville-area rooms. Treat the simulated buyers as a starting guess, not data."
- **Pipeline questions (BambooAI, upload `booking.csv`):** "Which lead types and towns turn into booked shows, and what does each pay on average? Which ones go cold after the first pitch?"
- **Label memory (WeKnora):** after uploading contracts and EPKs, ask "What deposit terms have we agreed to with venues this year?"

## Security notes

- Every skill and tool here runs with your permissions. Read a skill's `SKILL.md` and scripts once before its first use.
- Keep API keys out of this repo. Put them in each tool's settings or in `~/.dragon-farm.env`.
- Don't point video-shotcraft at logged-in pages, such as the dashboard. It screenshots whatever it's given.
- OpenChatCut's MCP endpoint is local only. If you ever expose it, set `OPENCHATCUT_MCP_TOKEN` first.
