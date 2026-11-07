# Architecture

This project turns one reference image into **one editable slide**. It is a
rebuild engine, not an image-to-PPT converter: a human (or an agent) still
decides what is text, what is a native shape and what must be a local crop.
What this repository adds is a repeatable, measurable path from that decision
to a deck, a render and a QA result.

## Why the layout is split this way

The original Skill is instruction-only: an operator reads `SKILL.md`, studies a
reference PNG, and writes a one-off build script. That works once and cannot be
measured. The refactor separates three things that were previously entangled:

| Concern | Where it lives now | Why |
|---|---|---|
| What the slide says | private `config.json` | business text never enters the public repo |
| How a milestone timeline looks | `src/components/` | reusable, testable, no business knowledge |
| How the runtime is driven | `src/engine/` | the private `@oai/artifact-tool` stays external |

## Layers

```text
scripts/rebuild.mjs        orchestrator: stages, timings, exit codes
  ├─ src/config/           load + validate the private config
  ├─ src/engine/           locate, load and diagnose @oai/artifact-tool
  ├─ src/assets/           crop -> alpha -> residue check -> hash
  ├─ src/components/       title band, timeline, milestone card, geometry
  ├─ src/build/            compose the slide, export PPTX / engine preview
  ├─ src/typography/       pt<->px, overflow preflight, hanging punctuation
  ├─ src/render/           LibreOffice Kit rasterization + size normalization
  ├─ src/manifest/         layer recorder (the audit trail)
  └─ src/qa/               content / technical / visual gates
```

### Engine adapter

`@oai/artifact-tool` is a private Codex runtime package. It is **not vendored**
and cannot be installed from the public npm registry. The adapter resolves it
from `config.engine.entry` or `ARTIFACT_TOOL_ENTRY`, reports its version, and
uses the call path validated in the PoC:

```js
const blob = await FileBlob.load(masterPath);
const pres = await PresentationFile.importPptx(blob);
```

`Presentation.load(path)` is deliberately not used: it needs an optional native
adapter (`@oai/granola/node`) that trimmed runtimes usually lack.

Two engine behaviours are encoded as invariants because they cost hours to
rediscover:

1. `fontSize` is **CSS pixels**, not points. All callers pass points and
   `src/typography/units.mjs` converts once (`pt * 96 / 72`).
2. Rotated triangles failed to export (`invalid int32`). The timeline arrow head
   is a custom path instead, which is still a native shape.

### Components

Components read geometry and content from arguments only. They never read the
filesystem, never know a card is "P3", and never contain a coordinate that the
config could own.

- `geometry.mjs` — distributes N cards across the slide width and derives the
  timeline head position from the track. Pure functions, unit-tested.
- `title-band.mjs` — chapter, page title, accent marker.
- `timeline.mjs` — track, shaft, arrow head, sequence nodes, date pills.
- `card.mjs` — card body, gradient title band, icon disc, icon crop, body text,
  V-shaped pointer.
- `text-style.mjs` — the single place that converts points to engine pixels and
  decides which text properties are emitted.

`wrap` is emitted only when a caller asks for it. The engine writes a `wrap`
attribute onto the shape's `bodyPr`; adding it to single-token shapes (node
numbers, date pills) changes their text layout subtly enough to shift the
render by a pixel. Matching the accepted baseline byte-for-byte depended on
this detail.

### Layers and the manifest

`LayerRecorder` assigns z-order in insertion order and records the same fields
the private manifest uses: `element_id`, `semantic_role`, `reference_bbox_px`,
`target_bbox_in`, `z_index`, `native_or_crop`, `asset_path`,
`source_text_span`, `editability`, `confidence`, `notes`.

The manifest is the audit trail: it proves which objects are native, which are
local crops, and which source span each text came from. `schemas/layer-manifest.schema.json`
is the public contract; `schemas/rebuild-config.schema.json` describes the
private config shape (without any real content).

### Assets

Two modes, both ending in the same staged `assets/icons/` directory:

- `prepared` — the config points at RGBA icons that were keyed earlier. The
  step still stages, hashes (when `sha256` is present) and residue-checks them.
- `derive` — the config carries a source image and a pixel box per icon. The
  Skill's `crop_reference_assets.py` produces raw crops, then `icon_alpha.py`
  keys them (drop the pale disc and the divider band, trim to the ink box).

`residue_check.py` is the part that matters in practice: a crop that keeps a
neighbouring divider line looks fine at 100% and wrong at 400%. It fails on
opaque border pixels, opaque pixels in the bottom band, implausible coverage,
or an ink colour that is too pale.

### Typography

- `units.mjs` — pt/px/inch conversions, one implementation.
- `preflight.mjs` — deterministic estimate of wrapped line count and text
  height for a box. It is a **warning** gate: `overflow` stops the build before
  rendering, but the real line breaking is only ever confirmed on a PNG.
- `hanging_punct.py` — sets `a:pPr/@hangingPunct="1"` on slide paragraphs so
  trailing CJK punctuation hangs instead of orphaning. It verifies the
  concatenated run text is unchanged before and after the rewrite.

### Render

Final visual QA uses the saved PPTX, never the engine's own preview. The engine
preview is kept as `engine_preview.png` for diagnostic comparison only, because
its CJK wrapping differs from LibreOffice and PowerPoint.

`libreoffice.mjs` calls `libreoffice-kit`'s CLI (`render --input … --dpi …`) and
normalizes the result to the exact target pixels. LibreOffice can emit 1081 rows
for a 6.25 in tall slide at 172.8 dpi; the default `resample` mode applies a
LANCZOS resize, which is the same convention the accepted baseline PNG used, so
a rebuild can be compared to it pixel for pixel. `crop` mode is available when a
lossless edge crop is preferred; the method is always recorded in the metrics.

### QA

Three gates, three independent Python tools driven by an expectations JSON
generated from the private config:

| Gate | Tool | Fails on |
|---|---|---|
| Content | `content_qa.py` | a body, title or date that differs from the source, a forbidden string, a status word, a manual line break |
| Technical | `technical_qa.py` | missing editable text shapes, non-YaHei `latin`/`ea`/`cs` runs, a theme Hans font mismatch, out-of-bounds shapes, a full-slide image, an image-area budget breach |
| Visual | `visual_qa.py` | wrong pixel size, blank or near-blank render; baseline pixel deltas are reported as diagnostics, never as a pass score |

`qa_result.json` merges the three. `SKIPPED` is never reported as `PASS`: a run
with `--skip-render` or `--skip-qa` is marked `deliverable: false`.

## Failure behaviour

Every stage is timed and recorded. On failure the CLI exits non-zero and writes
`metrics.json` with `exit_status`, the failing stage, the error and whatever was
already produced. A failed run never emits a PASS-shaped result.

Environment problems fail once, with an actionable next step, instead of
producing several rounds of ad-hoc probing:

```text
$ node scripts/build-env-check.mjs --config private/p03.config.json
[PASS] engine.entry: …/@oai/artifact-tool/dist/artifact_tool.mjs (version 2.8.134)
[FAIL] render.cli: not found: …/libreoffice-kit/lib/cli.js -> Install @deepseek-ai/libreoffice-kit …
```

## What is deliberately absent

No OCR, no automatic layout analysis, no scene-graph platform, no second PPT
engine, no bulk-slide mode. Those are separate problems; this layer is the one
that makes a single rebuilt page reproducible and measurable.
