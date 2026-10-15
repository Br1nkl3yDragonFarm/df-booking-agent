"""Embed a scannable QR code (https://www.terisagriffin.com) into the "I Just Want To Know" artwork.

Usage: python3 make_qr_art.py <cropped-artwork.png> <output.png>
Places a tone-mapped QR in the bottom-right curtain area, clear of the artist.
For larger prints, run it on the original high-res artwork (adjust mod/x0/y0).
"""
import sys
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

URL = "https://www.terisagriffin.com"
SRC = sys.argv[1]
OUT = sys.argv[2]
SCALE = 2  # upscale for print

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def qr_matrix(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=0)
    q.add_data(url)
    q.make(fit=True)
    return np.array(q.get_matrix(), dtype=bool), q.version


def finder_mask(n):
    """True for modules belonging to the 3 finder patterns (+separator)."""
    m = np.zeros((n, n), bool)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        m[max(r - 1, 0):r + 8, max(c - 1, 0):c + 8] = True
    return m


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def blend_qr(img, x0, y0, mod, matrix, quiet=2, center=0.5):
    """Tone-map the photo itself into QR modules.

    Light modules: photo lifted into a bright silver range (texture kept).
    Dark modules: photo pushed into deep shadow (texture kept).
    A soft solid dot in each module centre guarantees a clean read, since
    scanners sample module centres.
    """
    n = matrix.shape[0]
    fm = finder_mask(n)
    size = (n + 2 * quiet) * mod
    qx0, qy0 = x0 - quiet * mod, y0 - quiet * mod
    region = img[qy0:qy0 + size, qx0:qx0 + size]
    L = lum(region)[..., None]
    lo, hi = L.min(), L.max()
    t = (L - lo) / max(hi - lo, 1)
    light = 196 + 48 * t          # 196..244 silver
    dark = 6 + 34 * t             # 6..40 shadow
    # module map at pixel resolution (quiet zone = light)
    full = np.zeros((n + 2 * quiet, n + 2 * quiet), bool)
    full[quiet:quiet + n, quiet:quiet + n] = matrix & ~fm  # finders drawn later on light ground
    pix = np.kron(full, np.ones((mod, mod), bool))[..., None]
    gray = np.where(pix, dark, light)
    # keep a hint of the original colour cast (image is B&W anyway)
    region[:] = gray * (region / np.maximum(L, 1)) ** 0.0
    p = int(round(mod * (1 - center) / 2))
    for r in range(n):
        for c in range(n):
            if fm[r, c]:
                continue
            ys, xs = y0 + r * mod + p, x0 + c * mod + p
            cell = img[ys:ys + mod - 2 * p, xs:xs + mod - 2 * p]
            cell[:] = cell * 0.5 + (6 if matrix[r, c] else 244) * 0.5
    return fm


def draw_finders(pil, x0, y0, mod, n, dark=(12, 12, 12), light=(232, 232, 232)):
    d = ImageDraw.Draw(pil)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        x, y = x0 + c * mod, y0 + r * mod
        d.rounded_rectangle([x, y, x + 7 * mod - 1, y + 7 * mod - 1], radius=int(mod * 0.35), fill=dark)
        d.rounded_rectangle([x + mod, y + mod, x + 6 * mod - 1, y + 6 * mod - 1], radius=int(mod * 0.25), fill=light)
        d.rounded_rectangle([x + 2 * mod, y + 2 * mod, x + 5 * mod - 1, y + 5 * mod - 1], radius=int(mod * 0.2), fill=dark)


def spaced(draw, xy, text, font, fill, spacing, anchor_center=True):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x, y = xy
    if anchor_center:
        x -= total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + spacing


def silver_frame(pil, box, radius, width):
    """Thin metallic silver rounded border with a soft glow, matching the TG logo."""
    glow = Image.new("L", pil.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=radius, outline=255, width=width * 3)
    glow = glow.filter(ImageFilter.GaussianBlur(width * 3))
    white = Image.new("RGB", pil.size, (255, 255, 255))
    pil.paste(white, (0, 0), glow.point(lambda v: int(v * 0.35)))
    ImageDraw.Draw(pil).rounded_rectangle(box, radius=radius, outline=(215, 218, 224), width=width)


def main():
    art = Image.open(SRC).convert("RGB")
    art = art.resize((art.width * SCALE, art.height * SCALE), Image.LANCZOS)
    img = np.asarray(art).astype(np.float32)

    matrix, version = qr_matrix(URL)
    n = matrix.shape[0]
    print(f"QR version {version}, {n}x{n} modules, EC=Q")

    # Bottom-right curtain area, clear of the dress sleeve.
    mod = 10 * SCALE
    quiet = 2
    qr_px = n * mod
    x0 = art.width - qr_px - 18 * SCALE - quiet * mod
    y0 = 925 * SCALE
    blend_qr(img, x0, y0, mod, matrix, quiet=quiet)

    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    draw_finders(pil, x0, y0, mod, n)

    # metallic frame around the frosted panel
    pad = quiet * mod
    box = [x0 - pad - 6 * SCALE, y0 - pad - 6 * SCALE, x0 + qr_px + pad + 6 * SCALE - 1, y0 + qr_px + pad + 6 * SCALE - 1]
    silver_frame(pil, box, radius=14 * SCALE, width=3 * SCALE)

    # "SCAN TO CONNECT" in the album's letter-spaced style
    d = ImageDraw.Draw(pil)
    f = ImageFont.truetype(FONT, 22 * SCALE)
    cx = (box[0] + box[2]) / 2
    spaced(d, (cx, box[3] + 14 * SCALE), "SCAN  ME", f, (225, 228, 234), 7 * SCALE)
    pil.save(OUT, quality=95)
    print("saved", OUT, pil.size)


if __name__ == "__main__":
    main()
