"""Vertical roll-up banner (33 x 80 in) with a scannable QR (no name/title lettering).

Usage: python3 make_rollup.py <cropped-artwork.png> <output.png>

Layout (2475 x 6000 px, ~75 dpi at 33x80in):
  * album artwork full-width at the top, fading into the near-black ground
  * "NEW SINGLE" / title line with silver hairline ornaments
  * "SCAN ME", then a large brushed-silver QR plaque (https://www.terisagriffin.com)
  * "TERISAGRIFFIN.COM" below; bottom ~8% left free for the roll-up base.
The QR reuses the approach of make_qr_art.py: qrcode lib, EC=Q, silver light
modules (196..244), deep dark modules (6..40), solid module centres, square
finder eyes, quiet zone >= 2 modules, thin silver rounded frame with soft glow.
"""
import sys
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

URL = "https://www.terisagriffin.com"
SRC = sys.argv[1]
OUT = sys.argv[2]

W, H = 2475, 6000
BG = np.array([13, 14, 11], np.float32)          # #0d0e0b
SAFE_BOTTOM = int(H * 0.92)                      # nothing critical below this
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SILVER = (222, 225, 231)

MOD = 46            # px per QR module -> 29*46 = 1334 px (~54% of width)
QUIET = 2           # quiet-zone modules (light silver)
SRC_TOP_CROP = 8    # rows of unrelated screenshot imagery above the title bar


# ---------------------------------------------------------------- QR helpers
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


def brushed_silver(h, w, seed=7):
    """0..1 brushed-metal texture: horizontal streaks + a soft diagonal sheen."""
    rng = np.random.default_rng(seed)
    noise = Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8))
    streak = np.asarray(noise.resize((max(w // 40, 1), h), Image.BILINEAR)
                        .resize((w, h), Image.BICUBIC)
                        .filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = (xx / w + yy / h) / 2                                   # 0..1 diagonal
    sheen = 0.55 + 0.45 * np.cos((d - 0.38) * np.pi * 2.2)     # soft highlight band
    t = 0.65 * sheen + 0.35 * streak
    return (t - t.min()) / (t.max() - t.min())


def render_qr_panel(matrix, mod, quiet):
    """Return an RGB PIL image of the silver QR panel (quiet zone included)."""
    n = matrix.shape[0]
    fm = finder_mask(n)
    size = (n + 2 * quiet) * mod
    t = brushed_silver(size, size)
    light = 196 + 48 * t            # 196..244 silver
    dark = 6 + 34 * (1 - t) * 0.5   # 6..23 deep shadow, faint counter-sheen
    full = np.zeros((n + 2 * quiet, n + 2 * quiet), bool)
    full[quiet:quiet + n, quiet:quiet + n] = matrix & ~fm
    pix = np.kron(full, np.ones((mod, mod), bool))
    gray = np.where(pix, dark, light)
    # reinforce dark-module centres (what scanners sample) with a feathered disc
    # pulled toward 6; light modules are left as clean brushed silver (no dimples)
    yy, xx = np.mgrid[0:mod, 0:mod].astype(np.float32) - (mod - 1) / 2
    disc = np.clip(1 - np.sqrt(xx ** 2 + yy ** 2) / (mod * 0.42), 0, 1) ** 0.6
    inner = np.zeros((n + 2 * quiet, n + 2 * quiet), bool)
    inner[quiet:quiet + n, quiet:quiet + n] = matrix & ~fm
    k = np.kron(inner.astype(np.float32), disc) * 0.5
    target = np.where(pix, 6.0, 244.0)
    gray = gray * (1 - k) + target * k
    rgb = np.repeat(gray[..., None], 3, -1)   # strictly neutral grey
    pil = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(pil)
    for r, c in [(0, 0), (0, n - 7), (n - 7, 0)]:
        x, y = (quiet + c) * mod, (quiet + r) * mod
        d.rounded_rectangle([x, y, x + 7 * mod - 1, y + 7 * mod - 1], radius=int(mod * 0.35), fill=(12, 12, 12))
        d.rounded_rectangle([x + mod, y + mod, x + 6 * mod - 1, y + 6 * mod - 1], radius=int(mod * 0.25), fill=(232, 232, 234))
        d.rounded_rectangle([x + 2 * mod, y + 2 * mod, x + 5 * mod - 1, y + 5 * mod - 1], radius=int(mod * 0.2), fill=(12, 12, 12))
    return pil


# ---------------------------------------------------------------- drawing helpers
def text_width(font, text, spacing):
    return sum(font.getlength(ch) for ch in text) + spacing * (len(text) - 1)


def metallic_text(canvas, cx, y, text, font, spacing, top=(246, 247, 250), bottom=(150, 154, 162), glow=0.0):
    """Letter-spaced caps, centred on cx, filled with a vertical silver gradient."""
    tw = text_width(font, text, spacing)
    asc, desc = font.getmetrics()
    h = asc + desc
    mask = Image.new("L", (int(tw) + 4, h + 4), 0)
    d = ImageDraw.Draw(mask)
    x = 2
    for ch in text:
        d.text((x, 2), ch, font=font, fill=255)
        x += font.getlength(ch) + spacing
    bbox = mask.getbbox()
    grad = np.linspace(0, 1, mask.height)[:, None]
    if bbox:  # gradient spans the actual glyph height
        g0, g1 = bbox[1], bbox[3]
        grad = np.clip((np.arange(mask.height) - g0) / max(g1 - g0, 1), 0, 1)[:, None]
    col = np.array(top)[None, None] * (1 - grad[..., None]) + np.array(bottom)[None, None] * grad[..., None]
    fill = Image.fromarray(np.broadcast_to(col, (mask.height, mask.width, 3)).astype(np.uint8))
    ox, oy = int(round(cx - mask.width / 2)), int(y) - 2
    if glow:
        g = Image.new("L", canvas.size, 0)
        g.paste(mask, (ox, oy))
        g = g.filter(ImageFilter.GaussianBlur(font.size * 0.18))
        canvas.paste(Image.new("RGB", canvas.size, (255, 255, 255)), (0, 0), g.point(lambda v: int(v * glow)))
    canvas.paste(fill, (ox, oy), mask)
    return bbox[3] - bbox[1] if bbox else h, (bbox[1] - 2 if bbox else 0)


def glyph_box(font, text, spacing):
    """(top offset, height) of the inked area for a spaced string drawn at y=0."""
    tw = text_width(font, text, spacing)
    asc, desc = font.getmetrics()
    m = Image.new("L", (int(tw) + 4, asc + desc + 4), 0)
    d = ImageDraw.Draw(m)
    x = 2
    for ch in text:
        d.text((x, 2), ch, font=font, fill=255)
        x += font.getlength(ch) + spacing
    b = m.getbbox()
    return b[1] - 2, b[3] - b[1]


def hairline(canvas, x0, x1, y, fade_to_left, width=3, color=(205, 208, 215)):
    """Thin silver line that fades out toward its outer end."""
    L = int(abs(x1 - x0))
    a = np.linspace(0, 1, L) if fade_to_left else np.linspace(1, 0, L)
    a = (a ** 1.6 * 255).astype(np.uint8)
    mask = Image.fromarray(np.repeat(a[None, :], width, 0))
    canvas.paste(Image.new("RGB", (L, width), color), (int(min(x0, x1)), int(y - width / 2)), mask)


def diamond(canvas, cx, cy, r, color=(230, 232, 238)):
    ImageDraw.Draw(canvas).polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=color)


def silver_frame(canvas, box, radius, width):
    glow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=radius, outline=255, width=width * 3)
    glow = glow.filter(ImageFilter.GaussianBlur(width * 4))
    canvas.paste(Image.new("RGB", canvas.size, (255, 255, 255)), (0, 0), glow.point(lambda v: int(v * 0.32)))
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, outline=(215, 218, 224), width=width)


# ---------------------------------------------------------------- composition
def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (xx - W / 2) / (W / 2)
    # very soft pewter glow centred behind the QR plaque, dark falloff to edges/base
    cy = H * 0.58
    r = np.sqrt(nx ** 2 * 1.0 + ((yy - cy) / (H * 0.30)) ** 2)
    lift = np.clip(1 - r, 0, 1) ** 2 * 13
    base_dark = np.clip((yy - H * 0.80) / (H * 0.20), 0, 1) * 5     # darker toward the foot
    side = np.abs(nx) ** 3 * 4                                        # gentle side vignette
    v = lift - base_dark - side
    img = BG[None, None] + v[..., None] * np.array([1.0, 1.0, 0.95])[None, None]
    # a touch of grain so the gradient doesn't band in print
    img += np.random.default_rng(3).normal(0, 0.9, (H, W, 1))
    return img


def main():
    canvas_np = background()

    # --- artwork: full width, top, bottom edge dissolving into the ground
    art = Image.open(SRC).convert("RGB")
    art = art.crop((0, SRC_TOP_CROP, art.width, art.height))
    ah = int(round(art.height * W / art.width))
    art = art.resize((W, ah), Image.LANCZOS)
    a = np.asarray(art).astype(np.float32)
    art_top = 150                       # clear of the roll-up top rail
    fade = 560
    alpha = np.ones(ah, np.float32)
    ramp = np.linspace(0, 1, fade)
    alpha[-fade:] = 1 - ramp * ramp * (3 - 2 * ramp)  # smoothstep ease to 0
    alpha = np.clip(alpha, 0, 1)[:, None, None]
    region = canvas_np[art_top:art_top + ah]
    canvas_np[art_top:art_top + ah] = a * alpha + region * (1 - alpha)
    canvas = Image.fromarray(np.clip(canvas_np, 0, 255).astype(np.uint8))

    # --- QR panel
    matrix, version = qr_matrix(URL)
    n = matrix.shape[0]
    panel = render_qr_panel(matrix, MOD, QUIET)
    ps = panel.width
    frame_gap, frame_w = 20, 5
    plaque = ps + 2 * (frame_gap + frame_w)

    # --- typography
    f_kicker = ImageFont.truetype(FONT, 58)
    f_title = ImageFont.truetype(FONT, 92)
    f_scan = ImageFont.truetype(FONT, 132)
    f_url = ImageFont.truetype(FONT, 84)
    kick, title, scan, url = "NEW  SINGLE", "I JUST WANT TO KNOW", "SCAN  ME", "TERISAGRIFFIN.COM"
    sp_k, sp_t, sp_s, sp_u = 26, 22, 44, 22
    kk = glyph_box(f_kicker, kick, sp_k)
    tt = glyph_box(f_title, title, sp_t)
    ss = glyph_box(f_scan, scan, sp_s)
    uu = glyph_box(f_url, url, sp_u)

    # vertical rhythm: no name/title lettering, just SCAN ME + plaque + ornament
    art_end = art_top + ah - 140             # just past the art's faded tail
    y_floor = SAFE_BOTTOM - 200
    # QR group centred between the art and the hidden base, biased toward eye level
    g_scan, g_plq = 96, 90
    group_h = ss[1] + g_scan + plaque + g_plq + 20
    free = y_floor - art_end - group_h
    y_scan = int(art_end + free * 0.45)
    y_plaque = y_scan + ss[1] + g_scan
    y_orn = y_plaque + plaque + g_plq
    cx = W / 2

    metallic_text(canvas, cx, y_scan - ss[0], scan, f_scan, sp_s, glow=0.22)

    px = int(round(cx - ps / 2))
    py = y_plaque + frame_gap + frame_w
    # soft drop shadow under the plaque for depth
    sh = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle([px - 10, py + 30, px + ps + 10, py + ps + 60], radius=40, fill=255)
    sh = sh.filter(ImageFilter.GaussianBlur(45))
    canvas.paste(Image.new("RGB", canvas.size, (0, 0, 0)), (0, 0), sh.point(lambda v: int(v * 0.6)))
    # rounded panel corners
    pm = Image.new("L", (ps, ps), 0)
    ImageDraw.Draw(pm).rounded_rectangle([0, 0, ps - 1, ps - 1], radius=26, fill=255)
    canvas.paste(panel, (px, py), pm)
    o = frame_gap + frame_w
    silver_frame(canvas, [px - o, py - o, px + ps + o - 1, py + ps + o - 1], radius=44, width=frame_w)

    # closing ornament: diamond with fading hairlines
    tw_u = text_width(f_url, url, sp_u)
    yo = y_orn + 10
    hairline(canvas, cx - 40, cx - 40 - tw_u * 0.32, yo, fade_to_left=True, width=2)
    hairline(canvas, cx + 40, cx + 40 + tw_u * 0.32, yo, fade_to_left=False, width=2)
    diamond(canvas, cx, yo, 10)

    canvas.save(OUT, dpi=(75, 75))
    qr_px = n * MOD
    print(f"QR v{version} {n}x{n} EC=Q, module {MOD}px, code {qr_px}px ({qr_px / W:.1%} of width), "
          f"panel {ps}px; plaque y={y_plaque}..{y_plaque + plaque}; ornament y={yo}; "
          f"safe line y={SAFE_BOTTOM}; saved {OUT} {canvas.size}")


if __name__ == "__main__":
    main()
