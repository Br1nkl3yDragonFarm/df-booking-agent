"""Paint a scannable QR into the stage curtain of the (lettering-free) artwork.

Usage: python3 make_integrated.py <art_clean.png> <out.png> [corner]

In the spirit of QR codes blended into paintings: no plaque, no frame, no
hard edges. The code lives in the curtain itself -- light modules are the
curtain caught in a soft spotlight (its folds still visible), dark modules
are the curtain in deep shadow -- and the quiet zone dissolves back into the
unlit curtain. corner: "right" (default) or "left" upper curtain.
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
QUIET = 3          # light quiet zone (modules); the glow then fades over FADE more
FADE = 4


def qr_matrix(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=0)
    q.add_data(url)
    q.make(fit=True)
    return np.array(q.get_matrix(), dtype=bool)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    art = Image.open(SRC).convert("RGB")
    art = art.resize((art.width * SCALE, art.height * SCALE), Image.LANCZOS)
    img = np.asarray(art).astype(np.float32)
    H, W = img.shape[:2]
    lum = img.mean(axis=2)

    M = qr_matrix(URL)
    n = M.shape[0]
    side = (n + 2 * (QUIET + FADE)) * MOD
    margin = 4 * SCALE
    qx0 = W - side - margin if CORNER == "right" else margin
    qy0 = 0
    x0, y0 = qx0 + (QUIET + FADE) * MOD, qy0 + (QUIET + FADE) * MOD

    # ---- module field at pixel resolution, with painterly soft edges ----------
    k = QUIET + FADE
    full = np.zeros((n + 2 * k, n + 2 * k), np.float32)
    full[k:k + n, k:k + n] = M
    dark = np.kron(full, np.ones((MOD, MOD), np.float32))
    # brush-like rounding: blur then re-threshold softly, so module clusters
    # merge into organic shapes instead of a hard pixel grid
    dark = cv2.GaussianBlur(dark, (0, 0), MOD * 0.22)
    dark = smoothstep(0.32, 0.68, dark)

    # ---- curtain texture (folds) from the region itself, normalised ----------
    reg = img[qy0:qy0 + side, qx0:qx0 + side]
    L = lum[qy0:qy0 + side, qx0:qx0 + side]
    folds = L - cv2.GaussianBlur(L, (0, 0), MOD * 3)          # fold detail only
    folds = cv2.GaussianBlur(folds, (0, 0), 1.2)

    # spotlight tone for light modules and shadow tone for dark modules
    # the code is "projected" onto the fabric: fold shading multiplies both
    # the lit and the unlit modules, so the folds run straight through it
    shade = 1 + np.clip(folds / (folds.std() * 4 + 1e-3), -0.5, 0.5) * 0.30
    light_tone = 208 * shade                # curtain caught in the beam
    dark_tone = 20 * shade                  # curtain left unlit
    painted = light_tone * (1 - dark) + dark_tone * dark
    # fine grain so the paint matches the photo
    rng = np.random.default_rng(5)
    painted = painted + rng.normal(0, 2.2, painted.shape)

    # ---- soft spotlight mask: solid over the code, dissolving in the quiet zone
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32)
    c = side / 2
    # rounded-square distance from the centre (superellipse)
    p = 6.0
    d = (np.abs((xx - c) / (n * MOD / 2)) ** p + np.abs((yy - c) / (n * MOD / 2)) ** p) ** (1 / p)
    half = n * MOD / 2
    q_end = 1 + (QUIET * MOD) / half                       # solid light quiet zone
    f_end = 1 + ((QUIET + FADE) * MOD - 2) / half          # then dissolve into curtain
    alpha = 1 - smoothstep(q_end, f_end, d)
    # dark modules are only inside the code, so alpha only fades the light glow
    alpha = alpha[..., None]

    rgb_painted = painted[..., None] * (reg / np.maximum(L[..., None], 1)) ** 0  # B&W art
    out = reg * (1 - alpha) + rgb_painted * alpha
    # beam spill: a soft round halo of light on the surrounding curtain
    rr = np.hypot(xx - c, yy - c) / (side / 2)
    halo = np.exp(-(rr / 0.78) ** 4)[..., None] * (1 - alpha)
    out = out + (reg * shade[..., None] * 1.25 - reg) * halo + 14 * halo
    img[qy0:qy0 + side, qx0:qx0 + side] = out

    # ---- finder eyes: solid and crisp so phones lock on instantly --------------
    for r, cc in [(0, 0), (0, n - 7), (n - 7, 0)]:
        fx, fy = x0 + cc * MOD, y0 + r * MOD
        sub = img[fy:fy + 7 * MOD, fx:fx + 7 * MOD]
        eye = np.zeros((7 * MOD, 7 * MOD), np.float32)
        eye[:, :] = 1
        eye[MOD:6 * MOD, MOD:6 * MOD] = 0
        eye[2 * MOD:5 * MOD, 2 * MOD:5 * MOD] = 1
        eye = cv2.GaussianBlur(eye, (0, 0), MOD * 0.12)
        t = 214 * (1 - eye) + 14 * eye
        sub[:] = t[..., None]

    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(OUT)
    print(f"saved {OUT} {W}x{H}; code {n * MOD}px ({n * MOD / W:.1%} of width) at ({x0},{y0})")


if __name__ == "__main__":
    main()
