---
name: qr-code-art
description: Turn a QR code into part of an artwork (album cover, flyer, banner, poster, social post) so it reads as art but still scans on any phone. Use whenever someone wants a QR code "embedded", "blended", "integrated" or "hidden" in a picture, a scannable banner/flyer/merch design, or a fancier QR than a plain black square. Covers decoding the existing code, choosing placement and style, generating with scripts/qr_art.py, stress-testing with scripts/verify_scan.py, and print sizing.
---

# QR Code Art

The goal is a code that looks like it belongs in the artwork, not a sticker
slapped on top, and that **still scans on the first try from a phone**.
Scannability is not up for negotiation, so every design passes the stress
test before it ships.

Tools: `scripts/qr_art.py` (decode + make) and `scripts/verify_scan.py`.
They need `pip install qrcode opencv-python-headless zxing-cpp numpy pillow`.

## Workflow

1. **Get the URL.** If the user hands you an existing QR image, decode it
   (`python3 scripts/qr_art.py decode qr.jpg`) and confirm the link with them.
   Regenerate a clean code from the URL. Don't trace or paste the old
   pixels. If their code comes from a dynamic or tracking QR service, encode
   *that* short link instead, so their scan analytics keep working.
2. **Prepare the art.** Crop away screenshot bars and other junk. If the user
   wants text or logos removed, do that first (see
   `marketing/terisa-griffin-qr/clean_artwork.py` for removing lettering
   from a curtain or flat background). Work at 2x for print.
3. **Pick the placement.** Choose a calm, low-detail area such as background,
   curtain, sky, wall or a dark stage area. **Never** put it over a face, the
   artist's name or the title. `--auto` finds the calmest square and avoids
   detected faces. Always look at the result, because the rhinestone scatter
   can drift onto nearby hair or clothing.
4. **Pick a style** (below) to match the artwork's own materials. The best
   results echo something already in the picture.
5. **Generate.** For example:
   `python3 scripts/qr_art.py make art.png out.png --url URL --style rhinestone --auto`
6. **Stress-test.**
   `python3 scripts/verify_scan.py --expect URL out.png`. Aim for **47 or more
   of 60**, which matches a plain black-on-white code of the same size. If the
   score is lower, enlarge the code, add contrast or widen the quiet zone, and
   test again.
7. **Look at it.** Read the full image and a zoomed crop of the code. Check
   for overlaps, visible grid artifacts and boxes around the code.
8. **Deliver.** Hand over a print PNG and a web JPEG, plus the command used
   to make them. Tell the user to test with a real iPhone camera and with
   Android/Google Lens, on screen and on a test print, before ordering.

## Styles

| Style | Look | When | Typical score |
|---|---|---|---|
| `silver` | The photo itself tone-mapped into brushed-silver light modules and shadowed dark modules, with a thin glowing frame and an optional "SCAN ME" label | Default; works on any background | 47–48 |
| `rhinestone` | Light modules are pavé crystals with star glints on black velvet; crystals scatter outward and dissolve into the scene | Glam, jewelry, sequins, stage or night scenes; needs a darker area | 47–49 |
| `plain` | Crisp black on white | Control or fallback; maximum robustness | 47 |

You can add new styles (paint strokes, mosaic tiles, windows of a building
the way Tony Taj does in his cityscapes, beads, stars). Keep these
invariants, though.

## Hard-won rules (each came from a failed test)

- **Keep standard polarity: dark modules on a light ground.** Inverted codes
  (light on dark) look great, but some phone scanners won't read them.
- **Quiet zone of at least 2–3 modules** in a consistent light tone around
  the code. Art can fade in beyond that, but not inside it.
- **Finder eyes stay crisp and square-ish.** Heavily rounded eyes made
  OpenCV fail on every test while ZXing still read them. Phones vary, so
  don't gamble.
- **Contrast budget:** light modules should average about 165 or brighter and
  dark modules about 40 or darker (0–255). Texture is fine inside those bands.
  Rhinestones needed a bright metal setting between stones to clear this.
- **Avoid two-tone module centres.** A solid centre dot with a different edge
  tone shows up as a polka-dot grid and lowers the score.
- **Don't spread the code over the whole picture** (halftone or dot overlay).
  It covered the face and name and only scanned about half the time.
- **Projected or soft-spotlight blending** read as a glowing panel and scored
  only 43–48. Treat it as an option, not the default.
- **Error correction Q** is the sweet spot: it gives a smaller version, so
  the modules are bigger at the same print size. Use H only when the art
  covers a lot of the code.
- **Size rule:** a phone can scan from about 10 times the code's width. A
  banner seen from 10 ft needs a code about 12 in wide. On a roll-up stand,
  put it at chest height and keep the bottom 8% empty, because the stand's
  base hides it.
- **Resolution:** use about 75 dpi at the printed size as a minimum for
  banners, and ask for the original high-res artwork rather than a
  screenshot.

## Reference implementation

`marketing/terisa-griffin-qr/` holds a complete real job: the clean artwork,
the silver and rhinestone versions, a 33×80 roll-up, a 6×3 ft banner, a
square social post, the generator scripts and the scan test results.

## From the source video (pending)

The user asked for this skill to be built from
https://youtu.be/YPVKgNkXs0E. That video could not be fetched, because this
cloud environment's network policy blocks youtube.com, so nothing from it
is in this file yet. Once the host is allowed, or a transcript is supplied,
extract its method (tools, steps, settings, prompts, scannability tips)
with timestamps, and merge it here. Mark any step that conflicts with the
hard-won rules above, and test it with `verify_scan.py` before adopting it.
