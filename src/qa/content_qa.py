#!/usr/bin/env python3
"""Content QA: does the generated deck say exactly what the source says?

Checks are driven entirely by an expectations JSON (written by the build from
the private config), so no business text is embedded in this tool.

Usage:
    python content_qa.py --pptx <file> --expect <expectations.json> --out <result.json>
Exit 0 on PASS, 1 on FAIL.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pptx import Presentation


def shape_texts(slide) -> dict[str, str]:
    texts = {}
    for sh in slide.shapes:
        if getattr(sh, "has_text_frame", False) and sh.has_text_frame:
            texts[sh.name] = sh.text_frame.text
    return texts


def shape_bold_spans(slide) -> dict[str, list]:
    """Bold substrings per shape, from run-level formatting.

    PowerPoint may leave bold unset on a run that inherits emphasis; here every
    generated run carries an explicit boolean, so `None` is treated as False.
    """
    spans = {}
    for sh in slide.shapes:
        if not (getattr(sh, "has_text_frame", False) and sh.has_text_frame):
            continue
        runs = []
        for para in sh.text_frame.paragraphs:
            for r in para.runs:
                runs.append((r.text, bool(r.font.bold)))
        spans[sh.name] = [t for t, b in runs if b and t]
    return spans


def check_text_checks(slide, checks):
    """Exact text (and optional bold-span) comparison for a named shape list."""
    texts = shape_texts(slide)
    spans = shape_bold_spans(slide)
    rows = []
    failures = 0
    for chk in checks:
        name = chk["shape"]
        expected = chk["text"]
        actual = texts.get(name)
        text_ok = actual == expected
        bold_ok = True
        if chk.get("bold_spans") is not None:
            bold_ok = spans.get(name, []) == chk["bold_spans"]
        ok = text_ok and bold_ok
        if not ok:
            failures += 1
        rows.append(
            {
                "shape": name,
                "role": chk.get("role"),
                "text_exact": text_ok,
                "bold_exact": bold_ok,
                "expected_chars": len(expected),
                "actual_chars": len(actual) if actual is not None else None,
                "status": "PASS" if ok else "FAIL",
                "actual": None if text_ok else actual,
            }
        )
    return rows, failures


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pptx", required=True)
    ap.add_argument("--expect", required=True)
    ap.add_argument("--out")
    args = ap.parse_args()

    prs = Presentation(args.pptx)
    exp = json.loads(Path(args.expect).read_text(encoding="utf-8"))
    slide_index = int(exp.get("slide_index", 0))
    if len(prs.slides) <= slide_index:
        result = {"status": "FAIL", "error": f"slide {slide_index} missing; deck has {len(prs.slides)}"}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    slide = prs.slides[slide_index]
    texts = shape_texts(slide)
    all_text = "\n".join(texts.values())

    # Named-shape mode (overview pages): every visible string is checked by name.
    if exp.get("text_checks"):
        rows, failures = check_text_checks(slide, exp["text_checks"])
        checks = {
            "slide_count_expected": len(prs.slides) == int(exp.get("expected_slide_count", 1)),
            "all_named_texts_present": all(r["actual_chars"] is not None for r in rows),
            "forbidden_texts_absent": all(t not in all_text for t in exp.get("forbidden_texts", [])),
            "status_words_absent": all(w not in all_text for w in exp.get("status_words", [])),
            "no_manual_line_breaks": all("\n" not in (texts.get(r["shape"]) or "") for r in rows),
        }
        ok = all(checks.values()) and failures == 0
        result = {
            "file": args.pptx,
            "mode": "named_text_checks",
            "status": "PASS" if ok else "FAIL",
            "checks": checks,
            "rows": rows,
            "summary": {
                "checked_shapes": len(rows),
                "failed_shapes": failures,
                "unauthorized_text_differences": failures,
            },
        }
        if args.out:
            Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if ok else 1

    authorized = {o["shape"]: o for o in exp.get("authorized_overrides", [])}
    rows = []
    unauthorized = 0
    for card in exp.get("cards", []):
        body_name = card.get("body_shape", f"card-{card['id']}-body")
        date_name = card.get("date_shape", f"date-{card['id']}")
        title_name = card.get("title_shape", f"card-{card['id']}-header")

        got_body = texts.get(body_name)
        got_title = texts.get(title_name)
        got_date = texts.get(date_name)
        body_ok = got_body == card["body"]
        title_ok = got_title == card["title"]

        override = authorized.get(date_name)
        if override is not None:
            date_ok = got_date == override["expected"]
            authorized_hit = True
        else:
            date_ok = got_date == card["date"]
            authorized_hit = False

        good = body_ok and title_ok and date_ok
        if not good:
            unauthorized += 1
        rows.append(
            {
                "node": card["id"],
                "body_shape": body_name,
                "expected_width_chars": len(card["body"]),
                "body_exact": body_ok,
                "title_exact": title_ok,
                "date_exact": date_ok,
                "authorized_override": authorized_hit,
                "expected_date": card["date"],
                "target_date": got_date,
                "status": "PASS" if good else "FAIL",
            }
        )

    header = exp.get("header", {})
    checks = {
        "slide_count_expected": len(prs.slides) == int(exp.get("expected_slide_count", 1)),
        "chapter_exact": texts.get(header.get("chapter_shape", "chapter")) == header.get("chapter"),
        "page_title_exact": texts.get(header.get("page_title_shape", "page-title")) == header.get("page_title"),
        "all_cards_present": all(
            f"card-{c['id']}-body" in texts and f"date-{c['id']}" in texts for c in exp.get("cards", [])
        ),
        "forbidden_texts_absent": all(t not in all_text for t in exp.get("forbidden_texts", [])),
        "status_words_absent": all(w not in all_text for w in exp.get("status_words", [])),
        "no_manual_line_breaks": all("\n" not in (texts.get(f"card-{c['id']}-body") or "") for c in exp.get("cards", [])),
    }

    ok = all(checks.values()) and unauthorized == 0
    result = {
        "file": args.pptx,
        "status": "PASS" if ok else "FAIL",
        "checks": checks,
        "nodes": rows,
        "summary": {
            "text_shapes": len(texts),
            "cards": len(exp.get("cards", [])),
            "unauthorized_text_differences": unauthorized,
            "authorized_text_differences": len(authorized),
        },
    }
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
