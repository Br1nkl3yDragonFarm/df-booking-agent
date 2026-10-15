"""Remove the "I Just Want To Know" title bar and the TERISA [TG] GRIFFIN lettering
from the cropped artwork, keeping its 1440x1326 size so the layout scripts still line up.

Usage: python3 clean_artwork.py <cropped-artwork.png> <clean-out.png>

The curtain folds run vertically, so masked lettering is refilled column by
column from the clean curtain just above/below it; the old title bar is then
replaced by the curtain reflected upward, with a gentle fade to stage-black.
"""
import sys
import cv2
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]

RULE_END = 132        # first row below the title bar's white rule
LETTER_TOP, LETTER_BOT = RULE_END, 425

a = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
H, W = a.shape[:2]
g = a.mean(axis=2)

# --- mask the silver lettering / monogram / sparkles -------------------------
band = g[LETTER_TOP:LETTER_BOT]
bg = cv2.medianBlur(band.astype(np.uint8), 51).astype(np.float32)
mask = (band - bg) > 9
mask = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1)
# close the gaps inside the rhinestone chains, then grow over glow halos
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (27, 27)))
mask = mask.astype(bool)
full = np.zeros((H, W), bool)
full[LETTER_TOP:LETTER_BOT] = mask
# protect the hair: large dark blobs (the buns / head) are never repainted
hair = (g < 48).astype(np.uint8)
hair[:LETTER_TOP + 150] = 0          # hair starts ~y330; above that dark = gaps in letters
hair = cv2.morphologyEx(hair, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
nh, hl, hs, _ = cv2.connectedComponentsWithStats(hair)
hair_mask = np.zeros_like(full)
for i in range(1, nh):
    if hs[i, cv2.CC_STAT_AREA] > 4000:
        hair_mask |= hl == i
full &= ~hair_mask
# where lettering crossed a bun, the bun outline is closed and repainted as hair
hair_closed = cv2.morphologyEx(hair_mask.astype(np.uint8), cv2.MORPH_CLOSE,
                               cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))).astype(bool)
hair_fill = full & hair_closed
full &= ~hair_fill
# drop specks: only keep components of real size
n, lab, stats, _ = cv2.connectedComponentsWithStats(full.astype(np.uint8))
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < 60:
        full[lab == i] = False

# --- refill column by column (vertical interpolation) ------------------------
# Anchors must be curtain, not hair: runs whose anchors are hair/rule get
# filled afterwards by horizontal interpolation from neighbouring columns.
out = a.copy()
pending = np.zeros((H, W), bool)
glum = lambda v: float(np.mean(v))
for x in range(W):
    col = full[:, x]
    if not col.any():
        continue
    y = LETTER_TOP
    while y < LETTER_BOT:
        if not col[y]:
            y += 1
            continue
        y1 = y
        while y < H and col[y]:
            y += 1
        y2 = y
        above = out[max(y1 - 4, RULE_END + 2):y1, x].mean(axis=0) if y1 - 1 >= RULE_END + 3 else None
        below = out[y2:y2 + 4, x].mean(axis=0) if y2 + 4 < H and not hair_mask[y2, x] else None
        ok = lambda v: v is not None and glum(v) > 50
        if ok(above) and ok(below):
            t = np.linspace(0, 1, y2 - y1 + 2)[1:-1, None]
            out[y1:y2, x] = above * (1 - t) + below * t
        elif ok(below) and not ok(above) and y2 - y1 < 60:
            out[y1:y2, x] = below
        elif ok(above) and not ok(below) and y2 - y1 < 60:
            out[y1:y2, x] = above
        else:
            pending[y1:y2, x] = True
# horizontal interpolation for the remaining (monogram) pixels
for yy in range(H):
    row = pending[yy]
    if not row.any():
        continue
    xs = np.where(~row)[0]
    for ch in range(3):
        out[yy, row, ch] = np.interp(np.where(row)[0], xs, out[yy, xs, ch])
# repaint the bun notches from the surrounding hair
if hair_fill.any():
    out = cv2.inpaint(np.clip(out, 0, 255).astype(np.uint8), hair_fill.astype(np.uint8) * 255,
                      9, cv2.INPAINT_TELEA).astype(np.float32)
# soften the vertical streaks slightly inside the filled areas only
blur = cv2.GaussianBlur(out, (0, 0), sigmaX=4, sigmaY=6)
m3 = cv2.GaussianBlur(full.astype(np.float32), (0, 0), 6)[..., None]
out = out * (1 - m3) + blur * m3
# film grain so the fill matches the photo texture
rng = np.random.default_rng(7)
out += rng.normal(0, 2.0, out.shape).astype(np.float32) * m3

# --- replace the title bar with reflected curtain ----------------------------
OFF = 14                                     # skip the rule's glow rows
src = out[RULE_END + OFF:RULE_END + OFF + RULE_END + OFF][::-1]   # mirror rows upward
out[:RULE_END + OFF] = src
# blend the seam and darken toward the top like a stage curtain in shadow
out[RULE_END + OFF - 7:RULE_END + OFF + 7] = cv2.GaussianBlur(out[RULE_END + OFF - 21:RULE_END + OFF + 21], (0, 0), sigmaX=0.1, sigmaY=3)[14:28]
fade = np.clip(np.linspace(0.55, 1.0, RULE_END + 60), 0, 1)[:, None, None]
out[:RULE_END + 60] *= fade

Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT)
cv2.imwrite(OUT.rsplit(".", 1)[0] + "_mask.png", full.astype(np.uint8) * 255)
print("saved", OUT)
