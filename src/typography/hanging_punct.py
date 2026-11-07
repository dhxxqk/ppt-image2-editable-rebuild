#!/usr/bin/env python3
"""Set ``a:pPr/@hangingPunct="1"`` on slide paragraphs.

This is a native OOXML East-Asian typography attribute. It asks the renderer to
hang trailing CJK punctuation instead of pushing it to a new line. It is not a
hard line break and it must not change any visible character, so this tool
verifies the concatenated text of every run before and after the rewrite.

Usage:
    python hanging_punct.py <pptx> [--slides 1,2]
Output: JSON on stdout, exit 0 when applied (or already applied) and text is
unchanged; exit 1 otherwise.
"""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def slide_parts(names, slides):
    wanted = None if not slides else {f"ppt/slides/slide{s}.xml" for s in slides}
    for name in names:
        if not name.startswith("ppt/slides/slide") or not name.endswith(".xml"):
            continue
        if wanted is None or name in wanted:
            yield name


def texts(root):
    return "".join(t.text or "" for t in root.iter(A + "t"))


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"status": "ERROR", "error": "usage: hanging_punct.py <pptx> [--slides 1,2]"}))
        return 2
    src = Path(sys.argv[1])
    slides = None
    if "--slides" in sys.argv:
        raw = sys.argv[sys.argv.index("--slides") + 1]
        slides = [int(x) for x in raw.split(",") if x.strip()]

    if not src.exists():
        print(json.dumps({"status": "ERROR", "error": f"not found: {src}"}))
        return 1

    tmp = src.with_name(src.stem + ".hanging.tmp.pptx")
    report = {"status": "PASS", "file": str(src), "slides": [], "changed_paragraphs": 0, "text_unchanged": True}

    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        targets = set(slide_parts(names, slides))
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename in targets:
                    root = ET.fromstring(data)
                    before = texts(root)
                    changed = 0
                    total = 0
                    for p in root.iter(A + "p"):
                        total += 1
                        ppr = p.find(A + "pPr")
                        if ppr is None:
                            ppr = ET.Element(A + "pPr")
                            p.insert(0, ppr)
                        if ppr.get("hangingPunct") != "1":
                            ppr.set("hangingPunct", "1")
                            changed += 1
                    after = texts(root)
                    if before != after:
                        report["status"] = "FAIL"
                        report["text_unchanged"] = False
                    report["slides"].append(
                        {"part": info.filename, "paragraphs": total, "changed": changed, "text_unchanged": before == after}
                    )
                    report["changed_paragraphs"] += changed
                    data = ET.tostring(root, encoding="UTF-8", xml_declaration=True)
                zout.writestr(info, data)
    tmp.replace(src)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
