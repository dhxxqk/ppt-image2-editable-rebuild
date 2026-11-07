#!/usr/bin/env python3
"""Turn pale-background icon crops into transparent RGBA icon assets.

The pale disc and the card divider are not part of the line icon: the disc is
rebuilt natively in the deck and the divider is crop residue. This tool keeps
only pixels that are clearly darker than the crop's own background, clears the
bottom band where the divider sits, and trims to the icon's bounding box.

Usage:
    python icon_alpha.py --in-dir <raw crops> --out-dir <rgba icons> --report <json> [--pattern "*.png"]
Output: JSON array report on stdout; exit 1 when an image has no foreground.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def process(path: Path, out_dir: Path) -> dict:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    bg = a[:8, :8].reshape(-1, 3).mean(axis=0)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    bg_lum = float(0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2])
    # Only significantly darker pixels survive; the pale disc (~bg-12) is removed.
    alpha = np.clip((bg_lum - lum - 22.0) / 55.0, 0.0, 1.0)
    alpha[alpha < 0.06] = 0.0
    # Drop the card divider residue captured at the bottom edge of the crop.
    alpha[int(h * 0.92):, :] = 0.0
    ys, xs = np.where(alpha > 0.12)
    if len(xs) == 0:
        raise RuntimeError(f"no foreground in {path}")
    x1, x2 = max(0, xs.min() - 2), min(w, xs.max() + 3)
    y1, y2 = max(0, ys.min() - 2), min(h, ys.max() + 3)
    rgba = np.dstack([a[:, :, :3], alpha * 255.0]).astype(np.uint8)
    rgba = rgba[y1:y2, x1:x2]
    out = out_dir / path.name
    Image.fromarray(rgba, "RGBA").save(out)
    return {
        "source": str(path),
        "output": str(out),
        "source_size": [int(w), int(h)],
        "trim_box_xyxy": [int(x1), int(y1), int(x2), int(y2)],
        "output_size": [int(x2 - x1), int(y2 - y1)],
        "bg_rgb": [round(float(v), 1) for v in bg],
        "alpha_pixels_gt_12pct": int((alpha > 0.12).sum()),
        "alpha_coverage_pct": round(float((alpha > 0.12).mean() * 100), 2),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--pattern", default="*.png")
    args = ap.parse_args()

    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(in_dir.glob(args.pattern))
    if not files:
        print(json.dumps({"status": "ERROR", "error": f"no files matching {args.pattern} in {in_dir}"}))
        return 1

    report = []
    for p in files:
        try:
            report.append(process(p, out_dir))
        except Exception as exc:  # noqa: BLE001 - report per-file failure
            report.append({"source": str(p), "error": str(exc)})

    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    failed = [r for r in report if "error" in r]
    print(json.dumps({"status": "FAIL" if failed else "PASS", "count": len(report), "report": args.report}, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
