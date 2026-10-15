"""Square social post (1080 + 2160 px) for "I Just Want To Know" with a scannable QR.

Usage: python3 make_social_square.py <cropped-artwork.png> <output-dir>

Input is the 1440x1326 B&W cropped artwork. The thin photo sliver above the
title bar is trimmed, the art is scaled 1.5x (no distortion) to 2160 wide and
the canvas is squared by extending the stage at the bottom: the dress fades
into the dark curtain tone and a slim band carries the web address. The QR
(EC level Q, tone-mapped silver plaque, same look as make_qr_art.py) sits in
the bottom-right curtain, clear of the face and lettering. All QR geometry is
on an even-pixel grid so the 1080 copy (exact /2 downscale) keeps whole
9-px modules.
"""
import os
import sys

import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

URL = "https://www.terisagriffin.com"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG = np.array([13, 14, 11], np.float32)  # #0d0e0b stage black

S = 2160           # hi-res canvas
SCALE = 1.5        # 1440 -> 2160
TOP_TRIM = 8       # photo sliver above the title bar (art px)
MOD = 18           # QR module size at 2160 (9 px at 1080)
QUIET = 2          # quiet-zone modules (silver)
MARGIN = 34        # plaque frame to canvas edge


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


def blend_qr(img, x0, y0, mod, matrix, quiet=2, center=0.5):
    """Tone-map the photo into QR modules (light 196..244 silver, dark 6..40)
    with a solid half-blend dot at each module centre for a clean read."""
    n = matrix.shape[0]
    fm = finder_mask(n)
    size = (n + 2 * quiet) * mod
    qx0, qy0 = x0 - quiet * mod, y0 - quiet * mod
    region = img[qy0:qy0 + size, qx0:qx0 + size]
    L = lum(region)[..., None]
    lo, hi = L.min(), L.max()
    t = (L - lo) / max(hi - lo, 1)
    light = 196 + 48 * t
    dark = 6 + 34 * t
    full = np.zeros((n + 2 * quiet, n + 2 * quiet), bool)
    full[quiet:quiet + n, quiet:quiet + n] = matrix & ~fm
    pix = np.kron(full, np.ones((mod, mod), bool))[..., None]
    region[:] = np.where(pix, dark, light)
    p = int(round(mod * (1 - center) / 2))
    for r in range(n):
        for c in range(n):
            if fm[r, c]:
                continue
            ys, xs = y0 + r * mod + p, x0 + c * mod + p
            cell = img[ys:ys + mod - 2 * p, xs:xs + mod - 2 * p]
            cell[:] = cell * 0.5 + (6 if matrix[r, c] else 244) * 0.5


def draw_finders(pil, x0, y0, mod, n, dark=(12, 12, 12), light=(232, 232, 232)):
    d = ImageDraw.Draw(pil)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        x, y = x0 + c * mod, y0 + r * mod
        d.rounded_rectangle([x, y, x + 7 * mod - 1, y + 7 * mod - 1], radius=int(mod * 0.35), fill=dark)
        d.rounded_rectangle([x + mod, y + mod, x + 6 * mod - 1, y + 6 * mod - 1], radius=int(mod * 0.25), fill=light)
        d.rounded_rectangle([x + 2 * mod, y + 2 * mod, x + 5 * mod - 1, y + 5 * mod - 1], radius=int(mod * 0.2), fill=dark)


def spaced(draw, xy, text, font, fill, spacing, align="center"):
    """Letter-spaced caps; xy is (x, top). align: left / center / right."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x, y = xy
    if align == "center":
        x -= total / 2
    elif align == "right":
        x -= total
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + spacing
    return total


def soft_shadow(pil, box, radius, spread, strength):
    sh = Image.new("L", pil.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle(box, radius=radius, fill=255)
    sh = sh.filter(ImageFilter.GaussianBlur(spread))
    black = Image.new("RGB", pil.size, (4, 4, 4))
    pil.paste(black, (0, 0), sh.point(lambda v: int(v * strength)))


def silver_frame(pil, box, radius, width):
    glow = Image.new("L", pil.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=radius, outline=255, width=width * 3)
    glow = glow.filter(ImageFilter.GaussianBlur(width * 3))
    white = Image.new("RGB", pil.size, (255, 255, 255))
    pil.paste(white, (0, 0), glow.point(lambda v: int(v * 0.35)))
    ImageDraw.Draw(pil).rounded_rectangle(box, radius=radius, outline=(215, 218, 224), width=width)


def build_canvas(src):
    art = Image.open(src).convert("RGB")
    art = art.crop((0, TOP_TRIM, art.width, art.height))
    w, h = S, int(round(art.height * SCALE))
    art = art.resize((w, h), Image.LANCZOS)
    a = np.asarray(art).astype(np.float32)

    canvas = np.empty((S, S, 3), np.float32)
    canvas[:] = BG
    # fade the bottom of the photo (dress) into the stage black
    fade0 = h - 300
    ramp = np.clip((np.arange(h) - fade0) / (h - fade0), 0, 1)
    ramp = (ramp * ramp * (3 - 2 * ramp))[:, None, None]  # smoothstep
    canvas[:h] = a * (1 - ramp) + BG * ramp
    # gentle corner vignette in the lower third so the band blends into the curtain
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    v = np.clip((yy - S * 0.62) / (S * 0.38), 0, 1) * 0.25
    canvas = canvas * (1 - v[..., None]) + BG * v[..., None]
    return canvas, h


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    img, art_h = build_canvas(src)

    matrix, version = qr_matrix(URL)
    n = matrix.shape[0]
    qr_px = n * MOD
    pad = QUIET * MOD
    inset = 8  # frame sits just outside the silver quiet zone
    label_h = 92
    # bottom-right, everything on an even grid for an exact 1080 downscale
    box_r = S - MARGIN
    box_b = S - MARGIN - label_h
    x0 = box_r - inset - pad - qr_px
    y0 = box_b - inset - pad - qr_px
    x0 -= x0 % 2
    y0 -= y0 % 2
    print(f"QR version {version}, {n}x{n} modules, EC=Q, module {MOD}px, "
          f"code {qr_px}px ({qr_px / S:.1%} of width), with quiet zone {qr_px + 2 * pad}px")

    box = [x0 - pad - inset, y0 - pad - inset, x0 + qr_px + pad + inset - 1, y0 + qr_px + pad + inset - 1]
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    soft_shadow(pil, [box[0] - 6, box[1] - 4, box[2] + 6, box[3] + 14], 30, 26, 0.75)
    img = np.asarray(pil).astype(np.float32).copy()
    photo = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

    blend_qr(img, x0, y0, MOD, matrix, quiet=QUIET)
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    draw_finders(pil, x0, y0, MOD, n)
    # plaque fill between quiet zone and frame (silver, same tone as quiet zone)
    d = ImageDraw.Draw(pil)
    q0, q1 = x0 - pad, x0 + qr_px + pad - 1
    r0, r1 = y0 - pad, y0 + qr_px + pad - 1
    for k in range(inset):
        d.rectangle([q0 - k - 1, r0 - k - 1, q1 + k + 1, r1 + k + 1], outline=(214, 216, 220))
    # round the outer corners of the plaque back into the photo
    mask = Image.new("L", pil.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=30, fill=255)
    outer = Image.new("L", pil.size, 0)
    ImageDraw.Draw(outer).rectangle(box, fill=255)
    corners = np.asarray(outer) & ~np.asarray(mask)
    pil.paste(photo, (0, 0), Image.fromarray(corners))
    silver_frame(pil, box, radius=30, width=4)

    d = ImageDraw.Draw(pil)
    cx = (box[0] + box[2]) / 2
    f_scan = ImageFont.truetype(FONT, 38)
    spaced(d, (cx, box[3] + 30), "SCAN  ME", f_scan, (228, 230, 236), 13)


    os.makedirs(outdir, exist_ok=True)
    hi = os.path.join(outdir, "social-square-2160.png")
    lo = os.path.join(outdir, "social-square-1080.jpg")
    pil.save(hi, optimize=True)
    pil.resize((S // 2, S // 2), Image.LANCZOS).save(lo, quality=92, subsampling=0)
    print("saved", hi, pil.size)
    print("saved", lo, (S // 2, S // 2))


if __name__ == "__main__":
    main()
