# ARTEMIS on the Mac mini

[ARTEMIS](https://github.com/google/artemis) (from Google, Apache 2.0) lets Claude Code use your Android phone (the Galaxy) like a person would: it looks at the screen, taps and types. You tell it what to do in plain words, for example "Open dragonfarmgrowth.net/fans.html in Chrome, sign up as a test fan from Nashville, and tell me what the page says after."

This folder sets it up on the Mac mini, with safer settings than the default install.

## What it's good for here
- **Checking the sites on a real phone.** Most fans and bookers open the press kit, the Shows page and the fan sign-up on a phone. Ask Claude Code to have ARTEMIS open them, tap through, and report anything broken, cut off or slow.
- **Testing the merch-table QR flow end to end.** Scan-to-sign-up is hard to test from a computer. ARTEMIS can open the sign-up link, fill the form and confirm the thank-you screen.
- **Phone-only chores you'd otherwise do by hand**, like checking how a post or link preview looks in an app before sharing it.

What it is **not** for: posting, liking, following or messaging on Instagram, TikTok and similar apps. Their rules ban automated activity, and an account can be limited or banned for it. Let the 📣 Posts window draft posts, and post them yourself.

## What you need
- The Mac mini, with [Homebrew](https://brew.sh) and [Claude Code](https://claude.com/claude-code) installed.
- **The Galaxy S26 Ultra** (any Android phone works) and a USB-C cable that carries data. `phone.sh` walks you through the phone side:
  - *Settings → About phone → Software information* → tap *Build number* 7 times to unlock Developer options.
  - *Settings → Developer options* → turn on *USB debugging*.
  - *Settings → Security and privacy → Auto Blocker* → turn it off while you use ARTEMIS. It blocks commands over the USB cable.
  - Plug into the Mac mini, unlock the phone, and tap *Allow* on "Allow USB debugging?".
- **A Gemini API key** (free tier works to try it): https://aistudio.google.com/apikey. ARTEMIS's default models are all Gemini. Other providers (Claude, OpenAI) can be set in `config/artemis.jsonc`, but some steps still call Gemini, so keep the Gemini key either way.

## Set it up
In Terminal on the Mac mini, from this repo:

```bash
bash macmini/artemis/setup.sh
```

It installs the tools (adb, scrcpy, ffmpeg, uv), downloads ARTEMIS to `~/artemis` at a version checked against this kit, asks for the Gemini key, connects Claude Code, and runs ARTEMIS's own check (`artemis doctor`). You can run it again any time; it skips what's already done.

Then connect the phone:

```bash
bash macmini/artemis/phone.sh check    # finds the phone, or tells you which setting is missing
bash macmini/artemis/phone.sh helper   # once: puts the ARTEMIS helper app on the phone and turns it on
cd ~/artemis && uv run artemis run "Open Settings and tell me the battery level" --profile flash
```

The helper app is how ARTEMIS reads what's on the screen. It shows up under *Settings → Accessibility → Installed apps* and shows a notification while it's on. If its switch is greyed out ("Restricted setting"): *Settings → Apps → Artemis Accessibility Helper → ⋮ → Allow restricted settings*, then turn it on.

**No cable:** `bash macmini/artemis/phone.sh wifi` connects over Wi-Fi with *Developer options → Wireless debugging → Pair device with pairing code*. Use this script rather than the pairing panel in the web console, which doesn't work on Android 11 and newer ([issue #184](https://github.com/google/artemis/issues/184)).

**Done for now:** `bash macmini/artemis/phone.sh undo` puts the screen timeout back to normal and can remove the helper app. It also reminds you to turn Auto Blocker back on and USB debugging off.

## Use it from Claude Code
Start `claude` on the Mac mini and ask in plain words, e.g.:

> Use ARTEMIS to open https://dragonfarmgrowth.net/epk.html?a=tcrc in Chrome on the phone, scroll the whole page, try the music player, and tell me anything that looks broken.

Claude Code uses ARTEMIS's tools (`mobile_run_task`, `mobile_get_device_state` and others) and reports back. Each step takes a few seconds (Flash) or 15–40 seconds (Pro, for long or tricky jobs).

## Web console (optional)
```bash
bash macmini/artemis/console.sh
```
Opens http://localhost:8000 on the Mac mini: run tasks, watch the Galaxy's screen, and replay past runs. The first start builds the console and takes a few minutes. It has no login, so keep it on the Mac mini (don't forward port 8000 to the internet).

## What this setup changes from the default install, and why
| | Default | Here | Why |
|---|---|---|---|
| Desktop pop-ups when a task ends | On | **Off** | On macOS the pop-up text goes into AppleScript unescaped ([issue #139](https://github.com/google/artemis/issues/139)), and that text can come from whatever is on the phone screen. |
| Helper app install | Automatic on any phone a task uses | **Only when you run `phone.sh helper`** | It's your personal phone, so nothing gets installed on it by surprise. |
| Connecting AI apps | Writes settings into every AI app it knows (Cursor, VS Code, Codex, Claude Desktop…) | **Claude Code only** | Fewer surprises in other apps' settings. |
| Testing rules in Claude Code | Added to every Claude Code session | **Off** (`WITH_RULES=1 bash macmini/artemis/setup.sh` turns it on) | They're long app-testing instructions; useful if you write Android tests, noise otherwise. |
| ARTEMIS version | Latest | **Pinned** (`ARTEMIS_REF`) | Updates can't break the setup without you choosing them. |

## Your everyday phone: before each run
ARTEMIS sees whatever is on the screen, and each step sends a picture of it to Google (Gemini).
- **Turn on Do Not Disturb** (swipe down → *Do not disturb*, or a *Mode*) so texts and notifications don't pop up mid-task, end up in the pictures, or get tapped by mistake.
- **Unlock the phone first** and leave it face up. ARTEMIS can't get past your PIN or fingerprint.
- **Don't let it near private apps:** messages, email, banking, Samsung Wallet, Secure Folder, or the CRM's lead details. Banking and Wallet screens usually come out black anyway.
- **Leave the phone alone while it works.** Your taps and its taps will fight.
- ARTEMIS may paste text through the clipboard, so whatever you copied before can be replaced.

## Good to know
- The key lives in `~/artemis/.env`, readable only by your Mac user. Never put it in this repo.
- Runs are recorded (screen video and step logs) in `~/artemis/traces`. Delete old ones when you like, since they can contain whatever was on screen.
- **Screen stays on when plugged into a computer.** ARTEMIS turns on Android's "stay awake while charging over USB" so the phone doesn't lock mid-task. The setting stays on after ARTEMIS stops, but only for USB charging from a computer; a wall charger behaves normally. `phone.sh undo` turns it off. To stop ARTEMIS setting it, put `ARTEMIS_KEEP_DEVICE_AWAKE=false` in `~/artemis/.env`.
- Known rough edges (open issues as of October 2026): system pop-ups like "Allow Chrome to access your location?" can stall a task (#180), so tap those yourself first; with several phones connected, `artemis batch` can pick the wrong one (#135), so connect only the Galaxy.
- To update ARTEMIS: `ARTEMIS_REF=main bash macmini/artemis/setup.sh` (or a specific commit).
- To remove it: `bash macmini/artemis/phone.sh undo` (answer y to remove the helper), then `claude mcp remove artemis -s user` and `rm -rf ~/artemis`.
