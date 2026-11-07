#!/usr/bin/env python3
"""Residue check for transparent icon assets.

A crop that silently keeps a divider line, a nearby glyph or part of the pale
disc looks acceptable at 100% zoom and wrong at 400%. This check makes those
failures explicit and machine-readable:

* no opaque pixels on the outer border (a frame means the crop is too tight or
  contains a card edge);
* no opaque pixels in the bottom 3% (the divider residue the alpha step clears);
* alpha coverage inside a plausible range (not blank, not a solid block);
* mean colour of opaque pixels is darker than the crop background (icon ink,
  not a pale wash).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def check(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    h, w, _ = a.shape
    alpha = a[:, :, 3].astype(np.float32) / 255.0
    solid = alpha > 0.25
    coverage = float(solid.mean() * 100)

    border = np.concatenate([solid[0, :], solid[-1, :], solid[:, 0], solid[:, -1]])
    border_px = int(border.sum())
    bottom_band = solid[int(h * 0.97):, :]
    bottom_px = int(bottom_band.sum())

    rgb = a[:, :, :3].astype(np.float32)
    if solid.any():
        mean_rgb = rgb[solid].mean(axis=0)
        lum = float(0.299 * mean_rgb[0] + 0.587 * mean_rgb[1] + 0.114 * mean_rgb[2])
    else:
        mean_rgb = np.array([0.0, 0.0, 0.0])
        lum = 0.0

    problems = []
    if border_px > 0:
        problems.append(f"{border_px} opaque border pixels")
    if bottom_px > 0:
        problems.append(f"{bottom_px} opaque pixels in bottom 3%")
    if coverage < 1.0:
        problems.append(f"coverage {coverage:.2f}% is too low")
    if coverage > 85.0:
        problems.append(f"coverage {coverage:.2f}% looks like a block, not a line icon")
    if lum > 150.0:
        problems.append(f"opaque mean luminance {lum:.1f} looks pale, not icon ink")

    return {
        "file": str(path),
        "size": [int(w), int(h)],
        "alpha_coverage_pct": round(coverage, 2),
        "border_opaque_px": border_px,
        "bottom_band_opaque_px": bottom_px,
        "opaque_mean_rgb": [round(float(v), 1) for v in mean_rgb],
        "opaque_mean_luminance": round(lum, 1),
        "status": "PASS" if not problems else "FAIL",
        "problems": problems,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--report")
    ap.add_argument("--pattern", default="*.png")
    args = ap.parse_args()

    d = Path(args.dir)
    files = sorted(d.glob(args.pattern))
    if not files:
        print(json.dumps({"status": "ERROR", "error": f"no {args.pattern} in {d}"}))
        return 1
    rows = [check(p) for p in files]
    failed = [r for r in rows if r["status"] != "PASS"]
    out = {"status": "FAIL" if failed else "PASS", "count": len(rows), "failed": [r["file"] for r in failed], "items": rows}
    if args.report:
        Path(args.report).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
