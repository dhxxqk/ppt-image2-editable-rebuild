#!/usr/bin/env python3
"""Normalize a rendered PNG to an exact pixel size.

LibreOffice can emit 1920x1081 for a 16:9 deck at 172.8 dpi because the page
height rounds up by one pixel. Two normalization modes are supported:

* ``resample`` (default): LANCZOS resize to the exact target. This is the
  convention the accepted PoC baseline PNG used, so a rebuild can be compared
  to it pixel for pixel.
* ``crop``: drop the extra transparent edge without interpolation. Lossless for
  the retained pixels, but it does not match a baseline that was resampled.

Usage:
    python normalize_png.py <in.png> <out.png> <width> <height> [resample|crop]
Output: JSON {method, source_size, target_size}
"""
import json
import sys
from PIL import Image


def main() -> int:
    if len(sys.argv) < 5:
        print(json.dumps({"error": "usage: normalize_png.py <in> <out> <width> <height> [resample|crop]"}))
        return 2
    src, dst, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    mode = sys.argv[5] if len(sys.argv) > 5 else "resample"

    im = Image.open(src)
    sw, sh = im.size
    if (sw, sh) == (width, height):
        method = "none"
    elif mode == "crop" and abs(sw - width) <= 2 and abs(sh - height) <= 2:
        im = im.crop((0, 0, min(sw, width), min(sh, height)))
        method = "crop_edge"
    else:
        im = im.resize((width, height), Image.LANCZOS)
        method = "resample_lanczos"

    if im.mode == "RGBA":
        # Flatten any residual alpha onto white so downstream pixel comparison
        # is stable and the deliverable is a plain RGB image.
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")

    im.save(dst)
    print(json.dumps({"method": method, "source_size": [sw, sh], "target_size": [width, height], "mode": mode}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
