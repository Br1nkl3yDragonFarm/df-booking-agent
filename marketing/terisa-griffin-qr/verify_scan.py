"""Stress-test scannability: downscale, blur, JPEG-compress, then decode with OpenCV + ZXing."""
import io
import sys
import cv2
import numpy as np
import zxingcpp
from PIL import Image, ImageFilter

EXPECT = "https://www.terisagriffin.com"


def decode(pil):
    res = []
    arr = cv2.cvtColor(np.asarray(pil.convert("RGB")), cv2.COLOR_RGB2BGR)
    res.append(cv2.QRCodeDetector().detectAndDecode(arr)[0] == EXPECT)
    res.append(any(r.text == EXPECT for r in zxingcpp.read_barcodes(pil)))
    return res


for path in sys.argv[1:]:
    base = Image.open(path).convert("RGB")
    total = ok = 0
    print(path)
    for width in (2880, 1400, 900, 600, 450):
        for blur in (0, 1.5, 3):
            for q in (95, 40):
                im = base.resize((width, int(base.height * width / base.width)), Image.LANCZOS)
                if blur:
                    im = im.filter(ImageFilter.GaussianBlur(blur))
                buf = io.BytesIO(); im.save(buf, "JPEG", quality=q); im = Image.open(buf)
                r = decode(im)
                total += 2; ok += sum(r)
                if not all(r):
                    print(f"  fail w={width} blur={blur} q={q} opencv={r[0]} zxing={r[1]}")
    print(f"  {ok}/{total} decodes succeeded")
