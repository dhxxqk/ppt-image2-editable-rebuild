#!/usr/bin/env python3
"""Technical QA for a generated single-slide deck.

Structural facts only: object inventory, editable-text coverage, font
configuration (latin/ea/cs plus the theme's Hans font), bounds, name
uniqueness and image-area budget. Visual overflow is *not* asserted here; that
needs the rendered PNG and is reported by visual QA.

Usage:
    python technical_qa.py --pptx <file> --expect <expectations.json> [--out <result.json>]
Exit 0 on PASS, 1 on FAIL.
"""
from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu
from lxml import etree

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"


def emu_in(v):
    return round(v / 914400, 4) if v is not None else None


def theme_fonts(pptx_path: Path) -> dict:
    out = {"major_latin": None, "minor_latin": None, "major_hans": None, "minor_hans": None}
    with zipfile.ZipFile(pptx_path) as z:
        names = [n for n in z.namelist() if n.startswith("ppt/theme/theme")]
        if not names:
            return out
        root = etree.fromstring(z.read(sorted(names)[0]))
        for tag, prefix in (("majorFont", "major"), ("minorFont", "minor")):
            node = root.find(f".//{A}{tag}")
            if node is None:
                continue
            latin = node.find(f"{A}latin")
            if latin is not None:
                out[f"{prefix}_latin"] = latin.get("typeface")
            for f in node.findall(f"{A}font"):
                if f.get("script") == "Hans":
                    out[f"{prefix}_hans"] = f.get("typeface")
    return out


def run_fonts(pptx_path: Path, slide_part: str) -> list[dict]:
    """Return per-run typeface triples from the slide XML."""
    rows = []
    with zipfile.ZipFile(pptx_path) as z:
        root = etree.fromstring(z.read(slide_part))
    for r in root.iter(f"{A}r"):
        rpr = r.find(f"{A}rPr")
        row = {"text": "".join(t.text or "" for t in r.iter(f"{A}t")), "latin": None, "ea": None, "cs": None}
        if rpr is not None:
            for key in ("latin", "ea", "cs"):
                node = rpr.find(f"{A}{key}")
                if node is not None:
                    row[key] = node.get("typeface")
        rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pptx", required=True)
    ap.add_argument("--expect", required=True)
    ap.add_argument("--out")
    args = ap.parse_args()

    path = Path(args.pptx)
    exp = json.loads(Path(args.expect).read_text(encoding="utf-8"))
    prs = Presentation(str(path))
    slide_index = int(exp.get("slide_index", 0))
    slide = prs.slides[slide_index]

    shapes = []
    counts = {
        "all": 0,
        "text_shapes": 0,
        "pictures": 0,
        "tables": 0,
        "charts": 0,
        "autoshapes": 0,
        "groups": 0,
        "text_chars": 0,
        "han_chars": 0,
        "image_area_sq_in": 0.0,
    }
    names = []
    out_of_bounds = []
    text_by_name = {}
    slide_w = emu_in(prs.slide_width)
    slide_h = emu_in(prs.slide_height)

    for sh in slide.shapes:
        counts["all"] += 1
        names.append(sh.name)
        rec = {
            "name": sh.name,
            "type": str(sh.shape_type),
            "left_in": emu_in(sh.left),
            "top_in": emu_in(sh.top),
            "width_in": emu_in(sh.width),
            "height_in": emu_in(sh.height),
            "text": None,
        }
        if getattr(sh, "has_text_frame", False) and sh.has_text_frame:
            counts["text_shapes"] += 1
            rec["text"] = sh.text_frame.text
            text_by_name[sh.name] = sh.text_frame.text
            counts["text_chars"] += len(sh.text_frame.text)
            counts["han_chars"] += sum(1 for ch in sh.text_frame.text if "\u4e00" <= ch <= "\u9fff")
        if sh.shape_type == 13:
            counts["pictures"] += 1
            counts["image_area_sq_in"] += (emu_in(sh.width) or 0) * (emu_in(sh.height) or 0)
        if sh.shape_type == 1:
            counts["autoshapes"] += 1
        if sh.shape_type == 6:
            counts["groups"] += 1
        if getattr(sh, "has_table", False) and sh.has_table:
            counts["tables"] += 1
        if getattr(sh, "has_chart", False) and sh.has_chart:
            counts["charts"] += 1

        if None not in (rec["left_in"], rec["top_in"], rec["width_in"], rec["height_in"]):
            if (
                rec["left_in"] < -0.01
                or rec["top_in"] < -0.01
                or rec["left_in"] + rec["width_in"] > slide_w + 0.01
                or rec["top_in"] + rec["height_in"] > slide_h + 0.01
            ):
                out_of_bounds.append(sh.name)
        shapes.append(rec)

    slide_area = slide_w * slide_h
    counts["image_area_sq_in"] = round(counts["image_area_sq_in"], 4)
    counts["slide_area_sq_in"] = round(slide_area, 4)
    counts["image_area_pct"] = round(100 * counts["image_area_sq_in"] / slide_area, 3)

    required = exp.get("required_text_shapes", [])
    missing_text = [n for n in required if not (text_by_name.get(n) or "").strip()]

    font_family = exp.get("font_family")
    runs = run_fonts(path, "ppt/slides/slide1.xml") if slide_index == 0 else []
    bad_fonts = [
        r
        for r in runs
        if r["text"].strip()
        and font_family
        and not (r["latin"] == font_family and r["ea"] == font_family and r["cs"] == font_family)
    ]
    theme = theme_fonts(path)
    theme_ok = True
    if font_family:
        theme_ok = all(
            theme.get(k) == font_family for k in ("major_hans", "minor_hans") if theme.get(k) is not None
        )

    big_images = [s["name"] for s in shapes if s["type"] == "PICTURE (13)" and (s["width_in"] or 0) * (s["height_in"] or 0) > 0.2 * slide_area]

    # Pictures may legitimately carry no name; only named shapes must be unique.
    named = [n for n in names if n]
    checks = {
        "slide_count": len(prs.slides) == int(exp.get("expected_slide_count", 1)),
        "slide_size": abs(slide_w - float(exp.get("slide_width_in", slide_w))) < 0.01
        and abs(slide_h - float(exp.get("slide_height_in", slide_h))) < 0.01,
        "shape_names_unique": len(named) == len(set(named)),
        "no_shape_out_of_bounds": not out_of_bounds,
        "required_text_shapes_editable": not missing_text,
        "all_runs_use_expected_font": not bad_fonts,
        "theme_hans_font_matches": theme_ok,
        "no_full_slide_image": not big_images,
        "image_area_within_budget": counts["image_area_pct"] <= float(exp.get("max_image_area_pct", 5.0)),
        "no_tables_or_charts": counts["tables"] == 0 and counts["charts"] == 0,
    }
    if exp.get("min_objects") is not None:
        checks["min_object_count"] = counts["all"] >= int(exp["min_objects"])

    ok = all(checks.values())

    # Stable structural fingerprint: independent of OOXML creation GUIDs and
    # timestamps, so two builds of the same input can be compared exactly.
    canonical = json.dumps(
        sorted(
            [
                [s["name"], s["type"], s["left_in"], s["top_in"], s["width_in"], s["height_in"], s["text"]]
                for s in shapes
            ],
            key=lambda row: (row[0], row[1]),
        ),
        ensure_ascii=False,
        sort_keys=True,
    )

    result = {
        "file": str(path),
        "status": "PASS" if ok else "FAIL",
        "checks": checks,
        "counts": counts,
        "structure_sha256": __import__("hashlib").sha256(canonical.encode("utf-8")).hexdigest(),
        "fonts": {"theme": theme, "runs": len(runs), "bad_runs": len(bad_fonts)},
        "out_of_bounds": out_of_bounds,
        "missing_text_shapes": missing_text,
        "oversized_images": big_images,
        "shapes": shapes,
    }
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "shapes"}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
