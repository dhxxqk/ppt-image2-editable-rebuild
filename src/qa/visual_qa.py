#!/usr/bin/env python3
"""Visual QA for a rendered slide.

Hard checks are objective: exact pixel size, non-blank content, opaque output.
When a baseline PNG is supplied, the tool also reports pixel differences and
writes a side-by-side comparison plus a diff heat map. Those numbers are
diagnostics, not a substitute for human review: a visually correct slide can
differ from the baseline by several points of mean absolute error.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def load_rgb(path: Path, size: tuple[int, int]) -> Image.Image:
    im = Image.open(path)
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    if im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return im


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", required=True)
    ap.add_argument("--expect", required=True)
    ap.add_argument("--out")
    ap.add_argument("--out-full")
    ap.add_argument("--out-detail")
    ap.add_argument("--out-heatmap")
    args = ap.parse_args()

    exp = json.loads(Path(args.expect).read_text(encoding="utf-8"))
    png = Path(args.png)
    im = Image.open(png)
    width, height = exp.get("width_px", 1920), exp.get("height_px", 1080)

    result = {"file": str(png), "size": list(im.size), "expected_size": [width, height], "checks": {}}
    checks = {"exact_size": im.size == (width, height)}

    rgb = load_rgb(png, (width, height))
    arr = np.asarray(rgb).astype(np.float32)
    gray = arr.mean(axis=2)
    std = float(gray.std())
    unique = int(len(np.unique((gray // 4).astype(np.uint8))))
    checks["not_blank"] = std >= float(exp.get("min_std", 6.0))
    checks["has_content_variety"] = unique >= int(exp.get("min_color_buckets", 40))
    if im.mode == "RGBA":
        alpha = np.asarray(im)[:, :, 3]
        checks["opaque_output"] = bool(alpha.min() == 255)

    result["stats"] = {"std": round(std, 3), "color_buckets": unique}

    baseline = exp.get("baseline_png")
    if baseline and Path(baseline).exists():
        base = load_rgb(Path(baseline), (width, height))
        b = np.asarray(base).astype(np.float32)
        diff = np.abs(arr - b)
        per_px = diff.max(axis=2)
        stats = {
            "mean_abs_diff": round(float(diff.mean()), 4),
            "p95_abs_diff": round(float(np.percentile(per_px, 95)), 3),
            "max_abs_diff": round(float(per_px.max()), 3),
            "pixels_over_16_pct": round(float((per_px > 16).mean() * 100), 4),
            "baseline": str(baseline),
        }
        result["baseline_diff"] = stats
        # Pixel equality is diagnostic evidence, never a pass criterion: a
        # deliberately improved slide must still be able to pass visual QA.
        stats["pixel_identical_to_baseline"] = stats["max_abs_diff"] == 0.0

        if args.out_full:
            canvas = Image.new("RGB", (width, height * 2 + 8), (255, 255, 255))
            canvas.paste(base, (0, 0))
            canvas.paste(rgb, (0, height + 8))
            d = ImageDraw.Draw(canvas)
            d.text((8, 8), "baseline (PoC v2)", fill=(200, 30, 30))
            d.text((8, height + 16), "candidate", fill=(200, 30, 30))
            canvas.save(args.out_full)

        if args.out_heatmap:
            heat = np.clip(per_px * 4.0, 0, 255).astype(np.uint8)
            Image.fromarray(heat, "L").convert("RGB").save(args.out_heatmap)

        if args.out_detail:
            roi = exp.get("detail_roi") or [0.03, 0.22, 0.94, 0.63]
            rx, ry, rw, rh = roi
            box = (int(rx * width), int(ry * height), int((rx + rw) * width), int((ry + rh) * height))
            cb = base.crop(box)
            cn = rgb.crop(box)
            # PIL crop size is (width, height) - do not swap these.
            cw, ch = cb.size
            canvas = Image.new("RGB", (cw, ch * 2 + 8), (255, 255, 255))
            canvas.paste(cb, (0, 0))
            canvas.paste(cn, (0, ch + 8))
            d = ImageDraw.Draw(canvas)
            d.text((6, 6), "baseline detail", fill=(200, 30, 30))
            d.text((6, ch + 14), "candidate detail", fill=(200, 30, 30))
            canvas.save(args.out_detail)

        masked = exp.get("roi_mask")
        if masked:
            result["baseline_diff"]["roi_mask"] = masked
            result["baseline_diff"]["note"] = "roi_mask records regions excluded from diagnosis; it is never a visual pass score"

    result["checks"] = checks
    result["status"] = "PASS" if all(checks.values()) else "FAIL"
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
