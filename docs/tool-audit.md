# Tool audit — repos and offers from Facebook posts (Oct 2026)

Each repo was cloned and read on 21 Oct 2026. The verdict is whether it helps Dragon Farm (booking, sync, fans, promo) or the owner.

## Used

| Tool | What it really is | What we did |
|---|---|---|
| **Claude Code setup prompt** (@kaijucode, 12 steps) | A checklist for setting a repo up for Claude Code: CLAUDE.md, permissions, hooks, a skill, a read-only reviewer, worktrees | Built it: `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/code-reviewer.md`, `.claude/skills/ship-change/`, `.gitignore`, `.worktreeinclude`. The formatter hook became a `node --check` hook, because this repo has no formatter |
| **vercel-labs/skills** (MIT, ~36k stars, active) | The `npx skills` installer. This repo already used it (`skills-lock.json`) | Installed its `find-skills` skill so Claude can search skills.sh when asked "is there a skill for…". CLAUDE.md says to ask before installing any skill, since skills run with full permissions |
| **jub0t/Concat** (AGPL-3.0, ~7.7k stars, beta, very active) | A free, offline CapCut replacement (Rust) with a built-in MCP server: Claude can cut, caption, title and export video | Built `.claude/skills/show-clips/`: turns show footage into 9:16 clips with captions and a ticket title card. Runs on the owner's computer only. The AGPL licence doesn't matter for using it, only for shipping modified copies |

## Worth a look later (not built)

| Tool | Why it could help | Why not now |
|---|---|---|
| **Audio8 TTS** (Apache-2.0, 0.6B, voice cloning) | Radio drops, ad reads and voicemail intros in an act's own voice | Preview release; Hugging Face has look-alike copies from other uploaders, so get it only from the official Audio8 page. Clone a voice only with that artist's written OK. Needs a GPU or the ONNX CPU build. The ElevenLabs connector you already have does this today |
| **google-ai-edge/gallery** (Apache-2.0, Google, ~25k stars) | Free app (Android, iOS, macOS) that runs open models on the phone, offline | Personal use only: e.g. drafting set-list notes or captions with no signal on the road. Nothing to build |

## Skipped

| Tool | Finding |
|---|---|
| **cporter202/generative-ai-arbitrage** | Not a repo of code: a README pushing one reseller (kie.ai), with the same referral code on 77 links. "Same models, 70-93% cheaper" comes from an unofficial middleman reselling Google/OpenAI models; uptime, rights to outputs and how long it lasts are unknown. You already have OpenArt and ElevenLabs connected |
| **cporter202/scraping-apis-for-devs**, **social-growth-apis-for-creators**, **marketing-apis-that-drive-roi** | Link lists of paid Apify scrapers: ~36,000 links, every one carrying the same affiliate code (`fpr=p2hrc6`). Apify is real, but each scraper is pay-per-use from unknown authors, and scraping Instagram/TikTok/Facebook breaks their terms. The hub's finder already searches the web for venues and buyers with sources |
| **XERJ** (Apache-2.0, release candidate) | Local code search to save agent tokens. This repo is small enough that it doesn't need it. Its quick start pipes a script from the internet into the shell and runs with `--insecure` |
| **Better-Linux/CleanMyLinux** | A Linux desktop cleaner. Not relevant to the label |
| **secdev/scapy** | A network packet tool for security work. Not relevant |
| **viralwavestudio.com** ($249), **AI with Chris Builder's Club** ($10/mo), **Genall AI Gumroad** | The paid "bonus" upsells under the posts. The hub already drafts social posts for booked shows (`posts.js`), and the promoter agent plus the TUPAC skills cover captions, scripts and calendars |

## Pattern to watch for
These posts share a format: a real or popular repo up front, then the poster's own link list or paid product in the comments. Before adopting anything from one: check who owns the repo, whether its links carry a referral code, when it last had a code commit, and whether you already have the capability.
