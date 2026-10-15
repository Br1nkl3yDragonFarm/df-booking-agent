#!/usr/bin/env python3
"""Stress-test QR art scannability: downscale, blur, JPEG-compress, decode with OpenCV + ZXing.

Usage: python3 verify_scan.py --expect https://example.com art1.png [art2.jpg ...]

Score guide (60 decode attempts per file):
  >= 47  as good as a plain black-on-white code of the same size -- ship it
  40-46  usable but fragile; enlarge the code, raise contrast or quiet zone
  < 40   redesign before printing
Always finish with a real-phone test (iPhone camera + Android/Google Lens).
"""
import argparse
import io

import cv2
import numpy as np
import zxingcpp
from PIL import Image, ImageFilter


def decode(pil, expect):
    arr = cv2.cvtColor(np.asarray(pil.convert("RGB")), cv2.COLOR_RGB2BGR)
    ocv = cv2.QRCodeDetector().detectAndDecode(arr)[0] == expect
    zx = any(r.text == expect for r in zxingcpp.read_barcodes(pil))
    return ocv, zx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect", required=True)
    ap.add_argument("files", nargs="+")
    ap.add_argument("-v", action="store_true", help="list each failing condition")
    a = ap.parse_args()
    for path in a.files:
        base = Image.open(path).convert("RGB")
        full = decode(base, a.expect)
        ok = total = 0
        fails = []
        for frac in (1.0, 0.5, 0.31, 0.21, 0.16):
            for blur in (0, 1.5, 3):
                for q in (95, 40):
                    w = max(64, int(base.width * frac))
                    im = base.resize((w, int(base.height * w / base.width)), Image.LANCZOS)
                    if blur:
                        im = im.filter(ImageFilter.GaussianBlur(blur))
                    buf = io.BytesIO(); im.save(buf, "JPEG", quality=q); im = Image.open(buf)
                    r = decode(im, a.expect)
                    total += 2; ok += sum(r)
                    if not all(r):
                        fails.append(f"w={w} blur={blur} q={q} opencv={r[0]} zxing={r[1]}")
        verdict = "SHIP" if ok >= 47 else "FRAGILE" if ok >= 40 else "REDESIGN"
        print(f"{path}: full-size opencv={full[0]} zxing={full[1]} | stress {ok}/{total} -> {verdict}")
        if a.v:
            print("  " + "\n  ".join(fails))


if __name__ == "__main__":
    main()
