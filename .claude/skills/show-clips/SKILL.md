---
name: show-clips
description: Turn live show footage into short vertical clips for Reels, TikTok and Shorts, with burned-in captions and a show/ticket title card, using the free Concat video editor through its MCP server. Use when the owner has video from a show, rehearsal or studio session and wants social clips, a recap, or a promo for an upcoming date.
---

# Show clips with Concat

[Concat](https://github.com/jub0t/Concat) is a free, open-source (AGPL-3.0) video editor that runs on the owner's computer. It has a built-in MCP server, so Claude can cut, caption and export video with it. Footage never leaves the computer.

## Check it's connected
Look for Concat tools (`project_create`, `media_import`, `export_start`, …). If they're missing, tell the owner how to connect it and stop:

1. Install Concat from https://github.com/jub0t/Concat/releases (it's in beta: expect rough edges).
2. In Concat, Settings: download the captions model once (it then works offline).
3. In a terminal on that computer (macOS path shown; Windows: `%LOCALAPPDATA%\Programs\Concat\concat.exe`, Linux: `/usr/bin/concat`):
   `claude mcp add concat -- /Applications/Concat.app/Contents/MacOS/concat --mcp`
4. Restart Claude Code.

This works only in Claude Code on the owner's own computer, not in a cloud session.

## Before cutting
Ask for (or find in the booking hub):
- The video files, and which act, venue, town and date they're from.
- What the clip is for: a **recap** of a played show, or a **promo** for an upcoming one (then get the date, town and ticket link from the booked show).
- Permission: only footage the label shot or has the rights to. A crowd clip from a fan needs their OK.

## Make the clips
1. `project_create` at 1080×1920 (9:16), 30 fps. Name it `<act>-<town>-<yyyy-mm-dd>`.
2. `media_import` the footage, then `timeline_read` and `preview_frame` to find the strongest moments: the hook of a song, a crowd singalong, a big ending. Pick **3 clips of 15-30 seconds**, plus one 45-60 second recap if there's enough.
3. Cut with `clip_add` / `clip_trim`. Open on the most energetic second; nothing slow in the first 2 seconds.
4. Reframe landscape footage with `clip_transform` so the singer stays in frame.
5. `captions_add` for the lyrics or what's said, large and in the lower middle, clear of the app buttons.
6. `title_add` for the last 2-3 seconds: act name, then either "Live at <venue>, <town>" (recap) or "<date> · <venue> · Tickets in bio" (promo).
7. `preview_frame` on the first frame and the title card of each clip, and look at them before exporting.
8. `project_save`, then `export_start` / `export_wait` to MP4 under `~/Videos/DragonFarm/<project name>/`.

## Hand off
Give the owner the file paths and, for each clip, a caption and hashtags in the act's voice (load `dragon-farm-tupac:caption-writing` and `dragon-farm-tupac:short-form-script` if available, or ask the `promoter` agent). Don't post anything; the owner posts.
