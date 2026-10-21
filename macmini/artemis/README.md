# ARTEMIS on the Mac mini

[ARTEMIS](https://github.com/google/artemis) (from Google, Apache 2.0) lets Claude Code use an Android phone like a person would: it looks at the screen, taps and types. You tell it what to do in plain words, for example "Open dragonfarmgrowth.net/fans.html in Chrome, sign up as a test fan from Nashville, and tell me what the page says after."

This folder sets it up on the Mac mini, with safer settings than the default install.

## What it's good for here
- **Checking the sites on a real phone.** Most fans and bookers open the press kit, the Shows page and the fan sign-up on a phone. Ask Claude Code to have ARTEMIS open them, tap through, and report anything broken, cut off or slow.
- **Testing the merch-table QR flow end to end.** Scan-to-sign-up is hard to test from a computer. ARTEMIS can open the sign-up link, fill the form and confirm the thank-you screen.
- **Phone-only chores you'd otherwise do by hand**, like checking how a post or link preview looks in an app before sharing it.

What it is **not** for: posting, liking, following or messaging on Instagram, TikTok and similar apps. Their rules ban automated activity, and an account can be limited or banned for it. Let the 📣 Posts window draft posts, and post them yourself.

## What you need
- The Mac mini, with [Homebrew](https://brew.sh) and [Claude Code](https://claude.com/claude-code) installed.
- **An Android phone or an emulator.** ARTEMIS doesn't work with iPhones.
  - Best: a spare Android phone just for this. Turn on Developer options (tap *Build number* 7 times in *Settings → About phone*), then turn on *USB debugging*, plug it into the Mac mini, and tap *Allow* on the phone.
  - No spare phone: install [Android Studio](https://developer.android.com/studio), open *Device Manager*, create a Pixel device and start it. Emulators run well on Apple Silicon Macs.
- **A Gemini API key** (free tier works to try it): https://aistudio.google.com/apikey. ARTEMIS's default models are all Gemini. Other providers (Claude, OpenAI) can be set in `config/artemis.jsonc`, but some steps still call Gemini, so keep the Gemini key either way.

## Set it up
In Terminal on the Mac mini, from this repo:

```bash
bash macmini/artemis/setup.sh
```

It installs the tools (adb, scrcpy, ffmpeg, uv), downloads ARTEMIS to `~/artemis` at a version checked against this kit, asks for the Gemini key, connects Claude Code, and runs ARTEMIS's own check (`artemis doctor`). You can run it again any time; it skips what's already done.

Then, with the phone or emulator connected:

```bash
cd ~/artemis
uv run artemis helper install      # once per phone: a small helper app ARTEMIS uses to read the screen
uv run artemis run "Open Settings and tell me the battery level" --profile flash
```

The helper app asks to be turned on under *Settings → Accessibility* on the phone. It shows a notification while it's on.

## Use it from Claude Code
Start `claude` on the Mac mini and ask in plain words, e.g.:

> Use ARTEMIS to open https://dragonfarmgrowth.net/epk.html?a=tcrc in Chrome on the phone, scroll the whole page, try the music player, and tell me anything that looks broken.

Claude Code uses ARTEMIS's tools (`mobile_run_task`, `mobile_get_device_state` and others) and reports back. Each step takes a few seconds (Flash) or 15–40 seconds (Pro, for long or tricky jobs).

## Web console (optional)
```bash
bash macmini/artemis/console.sh
```
Opens http://localhost:8000: run tasks, watch the phone screen, and replay past runs. The first start builds the console and takes a few minutes. It has no login, so keep it on the Mac mini (don't forward port 8000 to the internet).

## What this setup changes from the default install, and why
| | Default | Here | Why |
|---|---|---|---|
| Desktop pop-ups when a task ends | On | **Off** | On macOS the pop-up text goes into AppleScript unescaped ([issue #139](https://github.com/google/artemis/issues/139)), and that text can come from whatever is on the phone screen. |
| Helper app install | Automatic on any phone a task uses | **Only when you run `artemis helper install`** | So it never lands on a personal phone by surprise. |
| Connecting AI apps | Writes settings into every AI app it knows (Cursor, VS Code, Codex, Claude Desktop…) | **Claude Code only** | Fewer surprises in other apps' settings. |
| Testing rules in Claude Code | Added to every Claude Code session | **Off** (`WITH_RULES=1 bash macmini/artemis/setup.sh` turns it on) | They're long app-testing instructions; useful if you write Android tests, noise otherwise. |
| ARTEMIS version | Latest | **Pinned** (`ARTEMIS_REF`) | Updates can't break the setup without you choosing them. |

## Good to know
- **Screenshots go to Google.** Each step sends a picture of the phone screen to Gemini. Don't run it on screens with private info (bank apps, messages, the CRM with contacts' details).
- The key lives in `~/artemis/.env`, readable only by your Mac user. Never put it in this repo.
- Runs are recorded (screen video and step logs) in `~/artemis/traces`. Delete old ones when you like.
- ARTEMIS keeps the phone screen awake while connected. For a personal phone, set `ARTEMIS_KEEP_DEVICE_AWAKE=false` in `~/artemis/.env`.
- Known rough edges (open issues as of October 2026): system pop-ups like permission requests can stall a task (#180); the wireless pairing panel doesn't work for Android 11+ (#184), so use a USB cable; with several phones plugged in, `artemis batch` can pick the wrong one (#135), so keep one connected.
- To update ARTEMIS: `ARTEMIS_REF=main bash macmini/artemis/setup.sh` (or a specific commit).
- To remove it: `claude mcp remove artemis -s user`, `rm -rf ~/artemis`, and on the phone uninstall *Artemis Accessibility Helper*.
