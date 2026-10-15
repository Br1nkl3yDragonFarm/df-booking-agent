"""A scannable QR made of rhinestones, set into the stage curtain of the artwork.

Usage: python3 make_rhinestone.py <art_clean.png> <out.png> [right|left]

Echoes the crystal TG monogram, the earrings and the beaded gown: the light
modules of the code are pave-set silver crystals, the dark modules are the
black velvet of the curtain. Around the code, crystals scatter and thin out
into the folds so the code reads as part of the scene, not a sticker.
Standard (dark-on-light) polarity is kept so every phone camera reads it.
"""
import sys
import cv2
import numpy as np
import qrcode
from PIL import Image

URL = "https://www.terisagriffin.com"
SRC, OUT = sys.argv[1], sys.argv[2]
CORNER = sys.argv[3] if len(sys.argv) > 3 else "right"
SCALE = 2
MOD = 12 * SCALE          # 29 modules -> 696 px code at 2x (24% of width)
SUB = 2                   # crystals per module edge (2x2 pave)
QUIET = 3                 # crystal-paved quiet zone (modules)
SCATTER = 6               # modules over which crystals thin out into the curtain
VELVET = 14               # dark-module tone


def qr_matrix(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=0)
    q.add_data(url)
    q.make(fit=True)
    return np.array(q.get_matrix(), dtype=bool)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def crystal(d, rng, ss=4):
    """Return (intensity, alpha) for a faceted round crystal of diameter d px."""
    D = d * ss
    yy, xx = (np.mgrid[0:D, 0:D].astype(np.float32) + 0.5) / D * 2 - 1
    r = np.hypot(xx, yy)
    th = np.arctan2(yy, xx) + rng.uniform(0, np.pi)
    dome = np.sqrt(np.clip(1 - r * r, 0, 1))
    facets = 0.5 + 0.5 * np.cos(8 * th) * (r > 0.38)        # brilliant-cut facets
    table = (r < 0.38).astype(np.float32)                   # flat top
    inten = 150 + 85 * dome + 30 * facets * (1 - table) + 20 * table
    hx, hy = -0.32, -0.36                                   # key light upper-left
    inten += 110 * np.exp(-((xx - hx) ** 2 + (yy - hy) ** 2) / 0.05)
    inten -= 35 * smoothstep(0.8, 1.0, r)                  # dark girdle / setting rim
    alpha = 1 - smoothstep(0.96, 1.0, r)
    inten = cv2.resize(inten, (d, d), interpolation=cv2.INTER_AREA)
    alpha = cv2.resize(alpha, (d, d), interpolation=cv2.INTER_AREA)
    return np.clip(inten, 0, 255), alpha


def paste(img, cx, cy, sprite):
    inten, alpha = sprite
    d = inten.shape[0]
    x, y = int(round(cx - d / 2)), int(round(cy - d / 2))
    H, W = img.shape[:2]
    if x < 0 or y < 0 or x + d > W or y + d > H:
        return
    reg = img[y:y + d, x:x + d]
    reg[:] = reg * (1 - alpha[..., None]) + inten[..., None] * alpha[..., None]


def glint(img, cx, cy, length, strength=1.0):
    """Four-point star flare like the sparkles on the original monogram."""
    H, W = img.shape[:2]
    L = int(length)
    for dx, dy in [(1, 0), (0, 1)]:
        for t in range(-L, L + 1):
            x, y = int(cx + dx * t), int(cy + dy * t)
            if 0 <= x < W and 0 <= y < H:
                a = strength * (1 - abs(t) / (L + 1)) ** 2
                img[y, x] = img[y, x] * (1 - a) + 255 * a
    g = np.zeros((9, 9), np.float32)
    g[4, 4] = 1
    g = cv2.GaussianBlur(g, (0, 0), 1.6); g /= g.max()
    x0, y0 = int(cx) - 4, int(cy) - 4
    if 0 <= x0 and 0 <= y0 and x0 + 9 <= W and y0 + 9 <= H:
        reg = img[y0:y0 + 9, x0:x0 + 9]
        reg[:] = reg * (1 - g[..., None] * strength) + 255 * g[..., None] * strength


def main():
    rng = np.random.default_rng(11)
    art = Image.open(SRC).convert("RGB")
    art = art.resize((art.width * SCALE, art.height * SCALE), Image.LANCZOS)
    img = np.asarray(art).astype(np.float32)
    H, W = img.shape[:2]

    M = qr_matrix(URL)
    n = M.shape[0]
    k = QUIET + SCATTER
    side = (n + 2 * k) * MOD
    qx0 = W - side + 2 * MOD if CORNER == "right" else -2 * MOD
    qy0 = -2 * MOD
    x0, y0 = qx0 + k * MOD, qy0 + k * MOD          # top-left of the code itself

    # field: 1 = dark module (velvet), 0 = light (crystals), quiet zone light
    N = n + 2 * k
    dark = np.zeros((N, N), bool)
    dark[k:k + n, k:k + n] = M

    # rounded-square distance of each module from the code edge (in modules)
    ii, jj = np.mgrid[0:N, 0:N]
    ci = (N - 1) / 2
    half = n / 2
    p = 5.0
    dist = (np.abs((ii - ci) / half) ** p + np.abs((jj - ci) / half) ** p) ** (1 / p)
    dist_mod = (dist - 1) * half                     # modules outside the code edge

    # 1) velvet: deepen the curtain under the code + quiet zone so crystals pop
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cxp, cyp = x0 + n * MOD / 2, y0 + n * MOD / 2
    dp = (np.abs((xx - cxp) / (n * MOD / 2)) ** p + np.abs((yy - cyp) / (n * MOD / 2)) ** p) ** (1 / p)
    dpm = (dp - 1) * n / 2
    deep = (1 - smoothstep(QUIET - 0.5, QUIET + 3.5, dpm))[..., None]
    lum = img.mean(axis=2, keepdims=True)
    folds = lum - cv2.GaussianBlur(lum, (0, 0), MOD * 3)[..., None]
    velvet = VELVET + 0.35 * folds
    img = img * (1 - deep) + velvet * deep

    # 2) metal setting under light modules (keeps their average bright between stones)
    sub = MOD // SUB
    d_stone = sub - 1
    settings = np.zeros((H, W), np.float32)
    for i in range(N):
        for j in range(N):
            if dark[i, j] or dist_mod[i, j] > QUIET:
                continue
            ys, xs = qy0 + i * MOD, qx0 + j * MOD
            if ys < 0 or xs < 0 or ys + MOD > H or xs + MOD > W:
                continue
            settings[ys:ys + MOD, xs:xs + MOD] = 1
    settings = cv2.GaussianBlur(settings, (0, 0), 0.8)[..., None]
    img = img * (1 - settings) + 168 * settings

    # 3) crystals: full pave inside code + quiet zone, scattering outward
    sprites = [crystal(d_stone, rng) for _ in range(12)]
    small = [crystal(max(5, d_stone - 4), rng) for _ in range(8)]
    for i in range(N):
        for j in range(N):
            if dark[i, j]:
                continue
            dm = dist_mod[i, j]
            if dm <= QUIET:
                prob = 1.0
            else:
                prob = (1 - smoothstep(QUIET, QUIET + SCATTER, dm)) ** 1.6 * 0.85
            for a in range(SUB):
                for b in range(SUB):
                    if prob < 1 and rng.random() > prob:
                        continue
                    cx = qx0 + j * MOD + b * sub + sub / 2
                    cy = qy0 + i * MOD + a * sub + sub / 2
                    if prob < 1:   # scattered crystals wander off the grid
                        cx += rng.normal(0, sub * 0.6)
                        cy += rng.normal(0, sub * 0.6)
                        sp = small[rng.integers(len(small))] if rng.random() < 0.5 else sprites[rng.integers(len(sprites))]
                    else:
                        sp = sprites[rng.integers(len(sprites))]
                    paste(img, cx, cy, sp)

    # 4) a few star glints on light modules / scatter, never across dark modules
    light_cells = [(i, j) for i in range(N) for j in range(N)
                   if not dark[i, j] and dist_mod[i, j] <= QUIET + 2]
    for idx in rng.choice(len(light_cells), 16, replace=False):
        i, j = light_cells[idx]
        cx = qx0 + j * MOD + MOD / 2
        cy = qy0 + i * MOD + MOD / 2
        # keep the flare short enough to stay inside light neighbours
        L = MOD * 0.45 if dist_mod[i, j] < 0 else MOD * 1.2
        glint(img, cx, cy, L, strength=0.85)

    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(OUT)
    print(f"saved {OUT} {W}x{H}; code {n * MOD}px ({n * MOD / W:.1%} of width) at ({x0},{y0})")


if __name__ == "__main__":
    main()
