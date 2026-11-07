# Quickstart

Rebuild one reference-image page as an editable PowerPoint slide, in one
command, with three QA gates and real phase timings.

## Requirements

| Requirement | Notes |
|---|---|
| Node.js >= 22.19 | ESM, `node:test` |
| `@oai/artifact-tool` >= 2.8 | private Codex/Presentations runtime package; **not** vendored here |
| Python 3.10+ | Pillow and python-pptx (QA, PNG normalization, icon keying) |
| LibreOffice Kit CLI | `libreoffice-kit` `lib/cli.js`, used for final rasterization |
| A presentation base | a `.pptx` whose master carries the real logo/rules/theme |

Nothing is installed by this repository: there is no runtime dependency list to
`npm install`. The heavy packages are supplied by the environment.

## 1. Point at the runtime

```bash
export ARTIFACT_TOOL_ENTRY=/path/to/@oai/artifact-tool/dist/artifact_tool.mjs
# Windows PowerShell:
# $env:ARTIFACT_TOOL_ENTRY = "C:/path/to/@oai/artifact-tool/dist/artifact_tool.mjs"
```

The config can also carry `engine.entry`. The environment variable wins when
both are present.

## 2. Write a private config

Keep it **outside this repository**. A minimal config:

```json
{
  "schema": "pvr.rebuild.config/v1",
  "id": "p03",
  "slide": {
    "master": "/path/to/master.pptx",
    "master_sha256": "…64 hex chars…",
    "width_in": 11.111111,
    "height_in": 6.25,
    "layout": "2_标题幻灯片"
  },
  "render": {
    "node": "/path/to/node",
    "cli": "/path/to/libreoffice-kit/lib/cli.js",
    "dpi": 172.8,
    "width_px": 1920,
    "height_px": 1080
  },
  "header": { "chapter": "…", "pageTitle": "…" },
  "layout": { "margin_in": 0.45, "gap_in": 0.22, "cardTop_in": 1.56, "…": "see docs/ARCHITECTURE.md" },
  "theme": { "…": "colours, radii, shadows" },
  "typography": { "fontFamily": "微软雅黑", "bodyPt": 11, "bodyLine": 1.35 },
  "cards": [
    {
      "id": "01",
      "title": "…",
      "date": "2026.03",
      "body": "…one natural paragraph, no manual line breaks…",
      "icon": { "path": "icons/01.png", "sha256": "…optional…" }
    }
  ]
}
```

`tests/fixtures/synthetic-timeline.config.json` is a complete, sanitized
example: copy it and replace the content. Every geometry value is in inches and
is read from `layout`; no coordinate is hardcoded in the builders.

For a two-column overview page instead of a timeline, set
`"template": "overview-two-column"` and provide an `overview` block (lead
paragraph, research cards, route-diagram blocks). See
`tests/fixtures/synthetic-overview.config.json`. Both templates share the same
CLI, manifest, QA gates and metrics; only the page structure differs.

Paths inside the config may be absolute or relative to the config file.

## 3. Check the environment once

```bash
node scripts/build-env-check.mjs --config /path/to/config.json
```

```text
[PASS] node.version: Node.js 24.21.0
[PASS] engine.entry: …/artifact_tool.mjs (version 2.8.134)
[PASS] slide.master: …/master.pptx (297405 bytes, hash checked by the build)
[PASS] python.base: … [3, 12, 14] with Pillow and python-pptx
[PASS] render.cli: …/liboffice-kit/lib/cli.js (backend native)
[PASS] assets.icons: 6 icon file(s) present
ENV_READY
```

Any `FAIL` line carries the next action. Use `--json` for machine consumption.

## 4. Build

```bash
node scripts/rebuild.mjs --config /path/to/config.json --out ./out/p03
```

Outputs:

| File | Meaning |
|---|---|
| `PVR_P03_REBUILD_v1.pptx` | the editable deliverable |
| `render/render.png` | final 1920×1080 LibreOffice render |
| `engine_preview.png` | engine's own rasterizer — diagnostic only |
| `P03_layer_manifest.json` | every layer: role, bbox, z-order, native/crop, editability |
| `qa/qa_result.json` | content / technical / visual gates |
| `qa/P03_001v2_vs_002_full.png` | baseline above, candidate below |
| `qa/P03_001v2_vs_002_detail.png` | main-area crop of both |
| `metrics.json` | per-stage wall-clock timings, hashes, attempts, exit status |
| `preflight.json` | estimated line counts and overflow risk per card |

The command exits `0` only when the build succeeds **and** QA is not `FAIL`.
`--skip-render` / `--skip-qa` exist for development only; those runs report
`deliverable: false` and never claim visual verification.

Other flags: `--assets-mode derive`, `--python <exe>`, `--no-cache`, `--label`.

## 5. Deriving icons instead of preparing them

If the config carries a source reference image and boxes:

```json
"icon": {
  "derive": { "source": "reference.png", "box": [950, 310, 1090, 426], "name": "01.png" }
}
```

then run with `--assets-mode derive`. The crop helper produces raw crops, the
alpha step keys them, and the residue check runs before anything is embedded.

## 6. Tests and the public-repo safety scan

```bash
node --test                       # geometry, units, preflight, config, schema
node scripts/sensitivity-scan.mjs # fails on private paths, Drive links, binaries
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ENGINE_ENTRY_NOT_FOUND` | runtime path wrong or package missing | set `ARTIFACT_TOOL_ENTRY` to `dist/artifact_tool.mjs` |
| `MASTER_NOT_FOUND` | the drive holding the master is not mounted | mount it or fix `slide.master` |
| `ENV_CHECK_FAILED` on `python.packages` | no Pillow / python-pptx | `pip install Pillow python-pptx` into that interpreter |
| text spills out of a card | body too long for the box | enlarge the box, raise `cardH_in`, or lower `bodyPt` — never insert `\n` |
| `preflight` fails with `overflow` | the estimator says the paragraph cannot fit | same as above; the gate exists to stop you rendering a broken page |
| render is 1920×1081 | LibreOffice rounds the page height up | expected; normalization resamples to 1920×1080 and records the method |
| visual QA differs from a baseline | different normalization convention | `render.normalize: "crop"` for lossless, `"resample"` to match a resampled baseline |

## What the timings mean

`metrics.json` records every stage with `Date.now()` around the actual call:
config, env check, asset prep, layout, PPTX export, typography postprocess,
render, and each QA gate. `cache_hit` is true only when the staged icons were
restored from a hash-matched cache. `build_attempts` and `render_attempts` are
counters, not wall-clock. No percentage improvement is ever claimed here: that
requires the same machine, same inputs and a measured old baseline.
