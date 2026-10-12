"""Turn the flat Dragon Forge master emblem into the textures the 3D medallion uses.

Run from the project folder:  python3 tools/make-textures.py [--debug DIR]

Input : brand/dragon-forge-master.jpg  (the authoritative master artwork)
Output: site/assets/img/
  emblem-1024.webp      transparent circular emblem: static fallback / LCP image AND the coin face texture
  emblem-normal.webp    tangent-space normal map (relief derived from the artwork)
  emblem-masks.webp     R = gold (metal, smooth), G = dragon scales (semi-gloss), B = glow (lava, flame, eyes)
  emblem-640.webp       smaller transparent emblem for phones
  mark-96.webp          header / footer mark
  favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png   (+ site/favicon.ico)
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'brand', 'dragon-forge-master.jpg')
OUT = os.path.join(ROOT, 'site', 'assets', 'img')
DEBUG = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None

# Circle measured from the artwork: centre (766, 762), outer ring radius ~743 px.
CX, CY, R = 766, 762, 745
SIZE = 1024

os.makedirs(OUT, exist_ok=True)
src = Image.open(SRC).convert('RGB')
face = src.crop((CX - R, CY - R, CX + R, CY + R)).resize((SIZE, SIZE), Image.LANCZOS)
rgb = np.asarray(face).astype(np.float32) / 255.0

# --- colour analysis -------------------------------------------------------
mx, mn = rgb.max(2), rgb.min(2)
val = mx
sat = np.where(mx > 1e-5, (mx - mn) / np.maximum(mx, 1e-5), 0)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
d = np.maximum(mx - mn, 1e-5)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def blur(a, radius):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255.0

yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
rad = np.hypot(xx - SIZE / 2 + 0.5, yy - SIZE / 2 + 0.5) / (SIZE / 2)  # 0 centre .. 1 rim

# Masks (0..1)
hot = smooth(0.45, 0.9, val) * smooth(0.78, 0.95, sat) * (1 - smooth(28, 40, hue)) * (hue < 300)  # red/orange glow
white_hot = smooth(0.82, 0.98, val) * (1 - smooth(0.45, 0.8, sat))                                 # flame core
gold = smooth(22, 30, hue) * (1 - smooth(50, 60, hue)) * smooth(0.35, 0.55, sat) * smooth(0.28, 0.55, val)
gold = gold * (1 - 0.6 * hot)
green = smooth(62, 75, hue) * (1 - smooth(150, 170, hue)) * smooth(0.18, 0.35, sat) * smooth(0.06, 0.2, val)
emit = np.clip(hot + white_hot * 0.9, 0, 1)

# --- height / relief ------------------------------------------------------
# Structural profile: raised outer band with the lettering, recessed field, bevelled edge.
band = smooth(0.735, 0.775, rad)
bevel = 1 - smooth(0.965, 1.0, rad)
structure = (0.32 + 0.26 * band) * (0.55 + 0.45 * bevel)
detail = blur(lum, 1.1)
local = blur(lum, 9)
height = structure + 0.55 * (detail - local) + 0.18 * detail + 0.10 * gold - 0.08 * hot
height = blur(np.clip(height, 0, 1), 0.6)

# Sobel normals. three.js loads textures with flipY, so +v points to the top of the image.
k = 6.0
pad = np.pad(height, 1, mode='edge')
dx = (pad[1:-1, 2:] - pad[1:-1, :-2]) * 0.5
dy = (pad[2:, 1:-1] - pad[:-2, 1:-1]) * 0.5
nx, ny, nz = -dx * k * SIZE / 256, dy * k * SIZE / 256, np.ones_like(dx)
n = np.sqrt(nx * nx + ny * ny + nz * nz)
normal = np.stack([nx / n, ny / n, nz / n], 2) * 0.5 + 0.5

# --- material masks --------------------------------------------------------
# The medallion shader turns these into roughness, metalness and emission.
masks = np.stack([gold, green, emit], 2)

def save(arr, name, **kw):
    im = Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8))
    im.save(os.path.join(OUT, name), **kw)
    return im

save(normal, 'emblem-normal.webp', quality=86, method=6)
Image.fromarray(np.clip(masks * 255 + 0.5, 0, 255).astype(np.uint8)).resize((SIZE // 2, SIZE // 2), Image.LANCZOS) \
    .save(os.path.join(OUT, 'emblem-masks.webp'), quality=80, method=6)  # half resolution is plenty for masks

# --- transparent emblem for fallback image, header mark and icons ----------
def circle_alpha(size, radius_frac=0.995, feather=1.5):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    dist = np.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5)
    rr = size / 2 * radius_frac
    return np.clip((rr - dist) / feather + 0.5, 0, 1)

def emblem_rgba(size):
    im = src.crop((CX - R, CY - R, CX + R, CY + R)).resize((size, size), Image.LANCZOS).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    a[..., 3] = circle_alpha(size) * 255
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

emblem_rgba(1024).save(os.path.join(OUT, 'emblem-1024.webp'), quality=84, method=6, exact=True)
emblem_rgba(640).save(os.path.join(OUT, 'emblem-640.webp'), quality=82, method=6)

def small_mark(size):
    # Small sizes lose the detail, so boost contrast and sharpen before masking.
    big = emblem_rgba(size * 4).resize((size, size), Image.LANCZOS)
    rgbch = big.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1, percent=90, threshold=1))
    out = rgbch.convert('RGBA'); out.putalpha(big.getchannel('A'))
    return out

small_mark(96).save(os.path.join(OUT, 'mark-96.webp'), quality=90, method=6)
small_mark(32).save(os.path.join(OUT, 'favicon-32.png'))
ico = small_mark(64)
ico.save(os.path.join(ROOT, 'site', 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
for s, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    bg = Image.new('RGBA', (s, s), (11, 9, 7, 255))
    m = small_mark(int(s * 0.86))
    bg.alpha_composite(m, ((s - m.width) // 2, (s - m.height) // 2))
    bg = bg.convert('RGB')
    if s > 200:
        bg = bg.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    bg.save(os.path.join(OUT, name), optimize=True)

if DEBUG:
    os.makedirs(DEBUG, exist_ok=True)
    for nm, arr in [('gold', gold), ('hot', hot), ('green', green), ('emit', emit), ('height', height)]:
        Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8)).resize((384, 384)).save(os.path.join(DEBUG, f'mask-{nm}.png'))
    Image.fromarray((normal * 255).astype(np.uint8)).resize((384, 384)).save(os.path.join(DEBUG, 'mask-normal.png'))

for f in sorted(os.listdir(OUT)):
    print(f'{os.path.getsize(os.path.join(OUT, f)) / 1024:8.1f} KB  {f}')
