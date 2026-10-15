"""6 ft x 3 ft horizontal banner (5400x2700 px, 75 dpi) with a scannable QR (no name/title lettering).

Usage: python3 make_banner_6x3.py <cropped-artwork.png> <output.png>

Layout: album artwork as the hero on the left at full banner height (title bar
stretched slightly so the title clears the hem/grommet safe zone), its curtain
blending into a near-black extended curtain on the right. The right column
carries a letter-spaced header, a large tone-mapped QR on a brushed-silver
plaque (same look as make_qr_art.py), "SCAN ME" and the site URL.
"""
import sys
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

URL = "https://www.terisagriffin.com"
SRC = sys.argv[1]
OUT = sys.argv[2]

W, H = 5400, 2700
SAFE_X, SAFE_Y = int(W * 0.03), int(H * 0.03)  # 162 / 81 px
BG = np.array([13, 14, 11], np.float32)  # #0d0e0b
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# QR geometry
MOD = 44          # px per module -> 29 * 44 = 1276 px (23.6% of width)
QUIET = 2         # modules of light quiet zone inside the plaque
PLAQUE_PAD = 22   # extra light margin between quiet zone and silver frame


def qr_matrix(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=0)
    q.add_data(url)
    q.make(fit=True)
    return np.array(q.get_matrix(), dtype=bool), q.version


def finder_mask(n):
    m = np.zeros((n, n), bool)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        m[max(r - 1, 0):r + 8, max(c - 1, 0):c + 8] = True
    return m


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- artwork
def prepare_art(path):
    """Drop the 7px remnant strip above the title bar and pad the bar evenly
    above/below the title so the lettering sits inside the safe margin."""
    a = np.asarray(Image.open(path).convert("RGB"))
    a = a[7:]                       # artwork is lettering-free (clean_artwork.py)
    img = Image.fromarray(a)
    s = H / img.height
    return img.resize((round(img.width * s), H), Image.LANCZOS), s


def curtain_field(rng):
    """Near-black extended curtain: soft vertical folds + vignette."""
    x = np.arange(W, dtype=np.float32)
    folds = np.zeros(W, np.float32)
    for period, amp, ph in [(260, 3.2, 0.3), (170, 2.0, 1.7), (430, 2.6, 2.9), (95, 0.9, 0.8)]:
        folds += amp * np.sin(2 * np.pi * x / period + ph + 0.4 * np.sin(x / 700))
    noise = np.convolve(rng.normal(0, 1, W + 400), np.ones(60) / 60, "same")[200:200 + W] * 9
    folds += noise
    y = np.arange(H, dtype=np.float32)[:, None]
    vig = 1 - 0.35 * ((y - H * 0.45) / (H * 0.6)) ** 2
    L = (BG.mean() + folds[None, :]) * vig
    return np.clip(L, 0, 255)


def compose_background(art, bar_end):
    rng = np.random.default_rng(7)
    aw = art.width
    a = np.asarray(art).astype(np.float32)
    curtain = curtain_field(rng)

    # row-wise tone of the art's right edge, extended rightwards and fading out:
    # the title bar + silver rule continue a little, the curtain sinks into black
    strip = a[:, aw - 60:aw - 10].mean(1)                       # (H,3)
    # below the title bar, smooth the edge tone vertically so per-row texture
    # does not smear into horizontal streaks
    k = np.exp(-0.5 * (np.arange(-150, 151) / 50.0) ** 2); k /= k.sum()
    padded = np.pad(strip, ((150, 150), (0, 0)), mode="edge")
    smooth = np.stack([np.convolve(padded[:, c], k, "valid") for c in range(3)], 1)
    w = smoothstep(bar_end + 4, bar_end + 40, np.arange(H, dtype=np.float32))[:, None]
    strip = strip * (1 - w) + smooth * w
    xs = np.arange(W, dtype=np.float32)
    # title bar + silver rule fade out quickly (they must clear the right-hand
    # header); the curtain below sinks slowly into near-black
    reach = np.where(np.arange(H) < bar_end, 520, 1500)[:, None]
    fade = (1 - np.clip((xs[None, :] - (aw - 40)) / reach, 0, 1)) ** 2
    fade = fade * fade * (3 - 2 * fade)                         # (H,W) smooth
    ext = BG + (strip[:, None, :] - BG) * fade[..., None]
    ext += (curtain - BG.mean())[..., None]                     # soft folds
    canvas = ext

    # art with a soft crossfade into the extension over its right edge
    blend = 1 - smoothstep(aw - 190, aw - 5, xs[:aw])           # 1 inside art
    canvas[:, :aw] = a * blend[None, :, None] + canvas[:, :aw] * (1 - blend[None, :, None])
    return canvas


# ---------------------------------------------------------------- QR plaque
def brushed_silver(h, w, rng):
    """Luminance texture for the plaque: diagonal sheen + fine brushing."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = (xx / w + yy / h) / 2
    sheen = 0.55 + 0.25 * np.cos((d - 0.32) * 2 * np.pi) + 0.15 * (1 - yy / h)
    brush = rng.normal(0, 1, (h, 1)) * 0.6 + rng.normal(0, 1, (h, w)) * 0.25
    brush = np.asarray(Image.fromarray(((brush + 3) * 40).clip(0, 255).astype(np.uint8))
                       .filter(ImageFilter.BoxBlur(1))).astype(np.float32) / 40 - 3
    return sheen + 0.05 * brush


def draw_qr(img, x0, y0, mod, matrix, rng, center=1.0):
    """Tone-map the plaque texture into QR modules (as in make_qr_art.py)."""
    n = matrix.shape[0]
    fm = finder_mask(n)
    pad = QUIET * mod + PLAQUE_PAD
    size = n * mod + 2 * pad
    px0, py0 = x0 - pad, y0 - pad
    L = brushed_silver(size, size, rng)
    t = ((L - L.min()) / (L.max() - L.min()))[..., None]
    light = 196 + 48 * t      # 196..244 silver
    dark = 6 + 22 * t         # 6..28 shadow (stays within the 6-40 range)
    full = np.zeros((size, size), bool)
    mods = np.kron(matrix & ~fm, np.ones((mod, mod), bool))
    full[pad:pad + n * mod, pad:pad + n * mod] = mods
    gray = np.where(full[..., None], dark, light)
    region = img[py0:py0 + size, px0:px0 + size]
    # rounded plaque corners: keep background outside the radius
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(mod * 0.9), fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)[..., None] / 255
    region[:] = gray * m + region * (1 - m)
    # solid dot in each dark module centre (scanners sample centres); light
    # modules are already >= 196 so they are left as clean brushed silver
    p = int(round(mod * (1 - center) / 2))
    for r in range(n):
        for c in range(n):
            if fm[r, c] or not matrix[r, c]:
                continue
            ys, xs = y0 + r * mod + p, x0 + c * mod + p
            cell = img[ys:ys + mod - 2 * p, xs:xs + mod - 2 * p]
            cell[:] = cell * 0.5 + 6 * 0.5
    return (px0, py0, px0 + size - 1, py0 + size - 1)


def draw_finders(pil, x0, y0, mod, n, dark=(12, 12, 12), light=(232, 232, 232)):
    d = ImageDraw.Draw(pil)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        x, y = x0 + c * mod, y0 + r * mod
        d.rounded_rectangle([x, y, x + 7 * mod - 1, y + 7 * mod - 1], radius=int(mod * 0.35), fill=dark)
        d.rounded_rectangle([x + mod, y + mod, x + 6 * mod - 1, y + 6 * mod - 1], radius=int(mod * 0.25), fill=light)
        d.rounded_rectangle([x + 2 * mod, y + 2 * mod, x + 5 * mod - 1, y + 5 * mod - 1], radius=int(mod * 0.2), fill=dark)


def silver_frame(pil, box, radius, width):
    glow = Image.new("L", pil.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=radius, outline=255, width=width * 3)
    glow = glow.filter(ImageFilter.GaussianBlur(width * 3))
    white = Image.new("RGB", pil.size, (255, 255, 255))
    pil.paste(white, (0, 0), glow.point(lambda v: int(v * 0.35)))
    ImageDraw.Draw(pil).rounded_rectangle(box, radius=radius, outline=(215, 218, 224), width=width)


# ---------------------------------------------------------------- text
def spaced_width(draw, text, font, spacing):
    return sum(draw.textlength(ch, font=font) for ch in text) + spacing * (len(text) - 1)


def silver_text(pil, cx, top, text, size, spacing, glow=0.25, hi=(240, 242, 246), lo=(168, 171, 178)):
    """Letter-spaced caps, centred on cx, filled with a vertical silver gradient."""
    font = ImageFont.truetype(FONT, size)
    mask = Image.new("L", pil.size, 0)
    d = ImageDraw.Draw(mask)
    total = spaced_width(d, text, font, spacing)
    x = cx - total / 2
    for ch in text:
        d.text((x, top), ch, font=font, fill=255)
        x += d.textlength(ch, font=font) + spacing
    bbox = mask.getbbox()
    if glow:
        g = mask.filter(ImageFilter.GaussianBlur(size * 0.18)).point(lambda v: int(v * glow))
        pil.paste(Image.new("RGB", pil.size, (255, 255, 255)), (0, 0), g)
    y0, y1 = bbox[1], bbox[3]
    grad = np.zeros((pil.height, pil.width, 3), np.uint8)
    t = np.clip((np.arange(pil.height) - y0) / max(y1 - y0, 1), 0, 1)[:, None]
    col = np.array(hi) * (1 - t) + np.array(lo) * t
    grad[y0:y1 + 1] = col[y0:y1 + 1, None, :].astype(np.uint8)
    pil.paste(Image.fromarray(grad), (0, 0), mask)
    return bbox


def rule(pil, cx, y, half, gap=0, alpha=170):
    """Thin silver hairline that fades out at both ends (optionally split at the centre)."""
    ov = Image.new("L", pil.size, 0)
    arr = np.zeros((3, 2 * half), np.float32)
    x = np.linspace(-1, 1, 2 * half)
    a = (1 - np.abs(x) ** 2) * alpha
    if gap:
        a[np.abs(x) < gap / half] = 0
    arr[:] = a
    arr[0] *= 0.35; arr[2] *= 0.35
    ov.paste(Image.fromarray(arr.astype(np.uint8)), (int(cx - half), int(y - 1)))
    pil.paste(Image.new("RGB", pil.size, (222, 225, 231)), (0, 0), ov)


def main():
    art, s = prepare_art(SRC)
    bar_end = 0                                 # no title bar in the clean artwork
    canvas = compose_background(art, bar_end)
    aw = art.width

    matrix, version = qr_matrix(URL)
    n = matrix.shape[0]
    qr_px = n * MOD
    plaque = qr_px + 2 * (QUIET * MOD + PLAQUE_PAD)
    print(f"art {art.size} (scale {s:.3f}); QR v{version} {n}x{n} EC=Q, {qr_px}px "
          f"({qr_px / W:.1%} of width), plaque {plaque}px ({plaque / W:.1%})")

    # right column centre: midway between the art edge and the right banner edge
    cx = int(round((aw + W) / 2))
    # vertical stack (header / plaque / SCAN ME / rule / URL), centred on the banner
    # no header text: centre the plaque + SCAN ME group vertically
    py0 = (H - (plaque + 58 + 150)) // 2
    x0 = cx - qr_px // 2
    y0 = py0 + QUIET * MOD + PLAQUE_PAD

    # soft spotlight behind the plaque
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((xx - cx) / 1.0, (yy - (py0 + plaque / 2)) / 1.0) / (plaque * 0.95)
    canvas += (np.exp(-r ** 2 * 1.6) * 26)[..., None]

    rng = np.random.default_rng(11)
    canvas = np.clip(canvas, 0, 255)
    box = draw_qr(canvas, x0, y0, MOD, matrix, rng)
    pil = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    draw_finders(pil, x0, y0, MOD, n)
    fb = [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4]
    silver_frame(pil, fb, radius=int(MOD * 0.9) + 4, width=7)

    # SCAN ME under the plaque (no name/title lettering)
    sb = silver_text(pil, cx, fb[3] + 58, "SCAN  ME", 124, 46, glow=0.3)
    rule(pil, cx, sb[3] + 52, 520)
    print("plaque", fb, "scan", sb)

    for name, b in [("plaque", fb), ("scan", sb)]:
        assert b[0] >= SAFE_X and b[2] <= W - SAFE_X and b[1] >= SAFE_Y and b[3] <= H - SAFE_Y, name

    pil.save(OUT, dpi=(75, 75), optimize=True)
    print("saved", OUT, pil.size)


if __name__ == "__main__":
    main()
