#!/usr/bin/env python3
"""Turn a QR code into part of an artwork -- scannable, not a sticker.

Examples
  # decode an existing QR image to get its URL
  python3 qr_art.py decode qr.jpg

  # rhinestone code in the emptiest corner, away from faces
  python3 qr_art.py make art.png out.png --url https://example.com --style rhinestone --auto

  # silver tone-mapped plaque at an exact spot (top-left of the code, output px)
  python3 qr_art.py make art.png out.png --url https://example.com --style silver --x 2100 --y 1850 --module 20 --label "SCAN ME"

Styles
  silver      the photo itself tone-mapped into brushed-silver light modules and
              shadow dark modules, thin glowing silver frame (most robust)
  rhinestone  light modules are pave-set crystals on black velvet; crystals
              scatter outward and dissolve into the scene (most "integrated";
              needs a dark-ish area)
  plain       crisp black-on-white with rounded frame (fallback / control)
"""
import argparse
import sys

import cv2
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
EC = {"L": qrcode.constants.ERROR_CORRECT_L, "M": qrcode.constants.ERROR_CORRECT_M,
      "Q": qrcode.constants.ERROR_CORRECT_Q, "H": qrcode.constants.ERROR_CORRECT_H}


# ----------------------------------------------------------------- helpers
def qr_matrix(url, ec="Q"):
    q = qrcode.QRCode(error_correction=EC[ec], border=0)
    q.add_data(url)
    q.make(fit=True)
    return np.array(q.get_matrix(), dtype=bool), q.version


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def finder_mask(n):
    m = np.zeros((n, n), bool)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        m[max(r - 1, 0):r + 8, max(c - 1, 0):c + 8] = True
    return m


def draw_finders(pil, x0, y0, mod, n, dark=(12, 12, 12), light=(232, 232, 232)):
    """Square-ish finder eyes. Heavily rounded eyes broke OpenCV detection in testing."""
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
    pil.paste(Image.new("RGB", pil.size, (255, 255, 255)), (0, 0), glow.point(lambda v: int(v * 0.35)))
    ImageDraw.Draw(pil).rounded_rectangle(box, radius=radius, outline=(215, 218, 224), width=width)


def spaced_text(pil, cx, y, text, size, spacing, fill=(225, 228, 234)):
    d = ImageDraw.Draw(pil)
    f = ImageFont.truetype(FONT, size)
    widths = [d.textlength(ch, font=f) for ch in text]
    x = cx - (sum(widths) + spacing * (len(text) - 1)) / 2
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=f, fill=fill)
        x += w + spacing


# ------------------------------------------------------------- placement
def auto_place(img, side, margin):
    """Pick the calmest square (low texture), steering clear of faces."""
    H, W = img.shape[:2]
    g = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    grad = cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    faces = []
    try:
        casc = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = casc.detectMultiScale(g, 1.1, 5, minSize=(W // 12, W // 12))
    except Exception:
        pass
    best, pos = None, None
    step = max(side // 8, 8)
    for y in range(margin, H - side - margin + 1, step):
        for x in range(margin, W - side - margin + 1, step):
            score = float(grad[y:y + side, x:x + side].mean())
            for (fx, fy, fw, fh) in faces:            # padded face box is off limits
                px, py = fw // 2, fh // 2
                if x < fx + fw + px and x + side > fx - px and y < fy + fh + py and y + side > fy - py:
                    score += 1e6
            if best is None or score < best:
                best, pos = score, (x, y)
    if pos is None:
        sys.exit("artwork too small for a code this size; lower --module")
    return pos


# ---------------------------------------------------------------- styles
def style_silver(img, x0, y0, mod, M, quiet, label):
    """Tone-map the photo itself into the code: texture kept, contrast guaranteed."""
    n = M.shape[0]
    fm = finder_mask(n)
    size = (n + 2 * quiet) * mod
    qx0, qy0 = x0 - quiet * mod, y0 - quiet * mod
    reg = img[qy0:qy0 + size, qx0:qx0 + size]
    L = reg.mean(axis=2, keepdims=True)
    t = (L - L.min()) / max(float(L.max() - L.min()), 1)
    light, dark = 196 + 48 * t, 6 + 34 * t
    full = np.zeros((n + 2 * quiet, n + 2 * quiet), bool)
    full[quiet:quiet + n, quiet:quiet + n] = M & ~fm
    pix = np.kron(full, np.ones((mod, mod), bool))[..., None]
    reg[:] = np.where(pix, dark, light)
    # soft reinforced centres (scanners sample module centres)
    p = int(round(mod * 0.25))
    for r in range(n):
        for c in range(n):
            if fm[r, c]:
                continue
            cell = img[y0 + r * mod + p:y0 + (r + 1) * mod - p, x0 + c * mod + p:x0 + (c + 1) * mod - p]
            cell[:] = cell * 0.5 + (6 if M[r, c] else 244) * 0.5
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    draw_finders(pil, x0, y0, mod, n)
    pad = quiet * mod + max(mod // 4, 4)
    box = [x0 - pad, y0 - pad, x0 + n * mod + pad - 1, y0 + n * mod + pad - 1]
    silver_frame(pil, box, radius=max(mod * 2 // 3, 8), width=max(mod // 6, 2))
    if label:
        spaced_text(pil, (box[0] + box[2]) / 2, box[3] + mod, label, int(mod * 1.7), int(mod * 0.5))
    return pil


def _crystal(d, rng, ss=4):
    D = d * ss
    yy, xx = (np.mgrid[0:D, 0:D].astype(np.float32) + 0.5) / D * 2 - 1
    r = np.hypot(xx, yy)
    th = np.arctan2(yy, xx) + rng.uniform(0, np.pi)
    dome = np.sqrt(np.clip(1 - r * r, 0, 1))
    facets = 0.5 + 0.5 * np.cos(8 * th) * (r > 0.38)
    table = (r < 0.38).astype(np.float32)
    inten = 150 + 85 * dome + 30 * facets * (1 - table) + 20 * table
    inten += 110 * np.exp(-((xx + 0.32) ** 2 + (yy + 0.36) ** 2) / 0.05)
    inten -= 35 * smoothstep(0.8, 1.0, r)
    alpha = 1 - smoothstep(0.96, 1.0, r)
    return (np.clip(cv2.resize(inten, (d, d), interpolation=cv2.INTER_AREA), 0, 255),
            cv2.resize(alpha, (d, d), interpolation=cv2.INTER_AREA))


def _paste(img, cx, cy, sprite):
    inten, alpha = sprite
    d = inten.shape[0]
    x, y = int(round(cx - d / 2)), int(round(cy - d / 2))
    H, W = img.shape[:2]
    if x < 0 or y < 0 or x + d > W or y + d > H:
        return
    reg = img[y:y + d, x:x + d]
    reg[:] = reg * (1 - alpha[..., None]) + inten[..., None] * alpha[..., None]


def _glint(img, cx, cy, L, s=0.85):
    H, W = img.shape[:2]
    for dx, dy in [(1, 0), (0, 1)]:
        for t in range(-int(L), int(L) + 1):
            x, y = int(cx + dx * t), int(cy + dy * t)
            if 0 <= x < W and 0 <= y < H:
                a = s * (1 - abs(t) / (L + 1)) ** 2
                img[y, x] = img[y, x] * (1 - a) + 255 * a


def style_rhinestone(img, x0, y0, mod, M, quiet, scatter=6, seed=11):
    """Light modules = pave crystals on a bright setting; dark modules = black velvet."""
    rng = np.random.default_rng(seed)
    H, W = img.shape[:2]
    n = M.shape[0]
    k = quiet + scatter
    N = n + 2 * k
    qx0, qy0 = x0 - k * mod, y0 - k * mod
    dark = np.zeros((N, N), bool)
    dark[k:k + n, k:k + n] = M
    ii, jj = np.mgrid[0:N, 0:N]
    p, half, ci = 5.0, n / 2, (N - 1) / 2
    dist_mod = ((np.abs((ii - ci) / half) ** p + np.abs((jj - ci) / half) ** p) ** (1 / p) - 1) * half

    # velvet under the code + quiet zone
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = x0 + n * mod / 2, y0 + n * mod / 2
    dpm = ((np.abs((xx - cx) / (n * mod / 2)) ** p + np.abs((yy - cy) / (n * mod / 2)) ** p) ** (1 / p) - 1) * n / 2
    deep = (1 - smoothstep(quiet - 0.5, quiet + 3.5, dpm))[..., None]
    lum = img.mean(axis=2, keepdims=True)
    folds = lum - cv2.GaussianBlur(lum, (0, 0), mod * 3)[..., None]
    img[:] = img * (1 - deep) + (14 + 0.35 * folds) * deep

    # bright metal setting under light modules keeps their average high
    settings = np.zeros((H, W), np.float32)
    for i in range(N):
        for j in range(N):
            if dark[i, j] or dist_mod[i, j] > quiet:
                continue
            ys, xs = qy0 + i * mod, qx0 + j * mod
            if 0 <= ys and 0 <= xs and ys + mod <= H and xs + mod <= W:
                settings[ys:ys + mod, xs:xs + mod] = 1
    settings = cv2.GaussianBlur(settings, (0, 0), 0.8)[..., None]
    img[:] = img * (1 - settings) + 168 * settings

    sub = mod // 2
    big = [_crystal(sub - 1, rng) for _ in range(12)]
    small = [_crystal(max(5, sub - 5), rng) for _ in range(8)]
    for i in range(N):
        for j in range(N):
            if dark[i, j]:
                continue
            dm = dist_mod[i, j]
            prob = 1.0 if dm <= quiet else (1 - smoothstep(quiet, quiet + scatter, dm)) ** 1.6 * 0.85
            for a in range(2):
                for b in range(2):
                    if prob < 1 and rng.random() > prob:
                        continue
                    sx = qx0 + j * mod + b * sub + sub / 2
                    sy = qy0 + i * mod + a * sub + sub / 2
                    if prob < 1:
                        sx += rng.normal(0, sub * 0.6)
                        sy += rng.normal(0, sub * 0.6)
                        sp = (small if rng.random() < 0.5 else big)[rng.integers(8)]
                    else:
                        sp = big[rng.integers(len(big))]
                    _paste(img, sx, sy, sp)
    cells = [(i, j) for i in range(N) for j in range(N) if not dark[i, j] and dist_mod[i, j] <= quiet + 2]
    for idx in rng.choice(len(cells), min(16, len(cells)), replace=False):
        i, j = cells[idx]
        _glint(img, qx0 + j * mod + mod / 2, qy0 + i * mod + mod / 2,
               mod * (0.45 if dist_mod[i, j] < 0 else 1.2))
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def style_plain(img, x0, y0, mod, M, quiet, label):
    n = M.shape[0]
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(pil)
    pad = quiet * mod
    box = [x0 - pad, y0 - pad, x0 + n * mod + pad - 1, y0 + n * mod + pad - 1]
    d.rounded_rectangle(box, radius=mod, fill=(250, 250, 250))
    for r in range(n):
        for c in range(n):
            if M[r, c]:
                d.rectangle([x0 + c * mod, y0 + r * mod, x0 + (c + 1) * mod - 1, y0 + (r + 1) * mod - 1], fill=(10, 10, 10))
    if label:
        spaced_text(pil, (box[0] + box[2]) / 2, box[3] + mod, label, int(mod * 1.7), int(mod * 0.5))
    return pil


# ------------------------------------------------------------------- CLI
def cmd_decode(a):
    import zxingcpp
    im = Image.open(a.image).convert("RGB")
    res = [r.text for r in zxingcpp.read_barcodes(im)]
    if not res:
        res = [cv2.QRCodeDetector().detectAndDecode(cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR))[0]]
    print("\n".join(t for t in res if t) or "no QR code found")


def cmd_make(a):
    art = Image.open(a.src).convert("RGB")
    if a.scale != 1:
        art = art.resize((round(art.width * a.scale), round(art.height * a.scale)), Image.LANCZOS)
    img = np.asarray(art).astype(np.float32).copy()
    H, W = img.shape[:2]
    M, version = qr_matrix(a.url, a.ec)
    n = M.shape[0]
    mod = a.module or max(8, int(W * a.width_frac / n))
    quiet = a.quiet
    outer = quiet + (6 if a.style == "rhinestone" else 1)
    if a.auto or a.x is None:
        bx, by = auto_place(img, (n + 2 * outer) * mod, margin=mod)
        x0, y0 = bx + outer * mod, by + outer * mod
    else:
        x0, y0 = a.x, a.y
    if x0 - quiet * mod < 0 or y0 - quiet * mod < 0 or x0 + (n + quiet) * mod > W or y0 + (n + quiet) * mod > H:
        sys.exit("code + quiet zone does not fit inside the image at that position")
    if a.style == "silver":
        pil = style_silver(img, x0, y0, mod, M, quiet, a.label)
    elif a.style == "rhinestone":
        pil = style_rhinestone(img, x0, y0, mod, M, quiet)
    else:
        pil = style_plain(img, x0, y0, mod, M, quiet, a.label)
    pil.save(a.out)
    print(f"saved {a.out} {W}x{H}; QR v{version} {n}x{n} EC={a.ec}; module {mod}px; "
          f"code {n * mod}px ({n * mod / W:.1%} of width) at x={x0} y={y0}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    d = sp.add_parser("decode", help="read the URL out of an existing QR image")
    d.add_argument("image")
    d.set_defaults(func=cmd_decode)
    m = sp.add_parser("make", help="embed a QR code into an artwork")
    m.add_argument("src"); m.add_argument("out")
    m.add_argument("--url", required=True)
    m.add_argument("--style", choices=["silver", "rhinestone", "plain"], default="silver")
    m.add_argument("--ec", choices=list(EC), default="Q", help="error correction (Q default; H for heavy art)")
    m.add_argument("--scale", type=float, default=2.0, help="upscale the artwork first (print)")
    m.add_argument("--module", type=int, help="px per module in the output")
    m.add_argument("--width-frac", type=float, default=0.24, help="code width as fraction of image width if --module unset")
    m.add_argument("--quiet", type=int, default=3, help="quiet zone in modules (>=2)")
    m.add_argument("--x", type=int); m.add_argument("--y", type=int)
    m.add_argument("--auto", action="store_true", help="find the calmest area away from faces")
    m.add_argument("--label", default="", help='text under the code, e.g. "SCAN ME" (silver/plain)')
    m.set_defaults(func=cmd_make)
    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
