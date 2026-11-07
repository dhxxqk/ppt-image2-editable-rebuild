# 002 — Rebuild MVP: reproducible editable-slide generation

Status: READY_FOR_DEVELOPMENT
Branch: `feat/pvr-rebuild-mvp`
Scope: infrastructure and one synthetic regression example only.

## Purpose

Turn the existing image-assisted reconstruction Skill into a reusable, testable command-line project. Preserve original Skill/plugin entry points and upstream compatibility. Develop on this feature branch; do not push directly to `main`.

## Must implement

1. A documented CLI such as `node scripts/rebuild.mjs --config <config.json> --out <output-dir>`. It validates input, uses reusable component builders, exports a real editable PPTX, renders a PNG, and records QA + phase timings. Unsupported environments must fail fast and clearly.
2. A small component API covering a milestone timeline, native cards, title bands, date pills and arrows. Text and key structural elements must remain editable. Local illustration/icon crops are permitted; never use a full-slide screenshot as the output slide.
3. A runtime adapter for the installed `@oai/artifact-tool`, supplied externally via a runtime path or environment variable. **Do not vendor the package or runtime binaries.**
4. A versioned layer-manifest schema with stable element IDs, semantic roles, bounding boxes, z-order, source-text mapping and editable-vs-cropped classification.
5. Typography utilities for point-to-CSS-pixel conversion, natural CJK line breaking, overflow preflight and optional OOXML hanging punctuation postprocessing. Do not hardcode manual line breaks to hide layout errors.
6. Local-asset crop/alpha processing with a residue check; reusable machine-readable content, structure and visual QA result artifacts.
7. A synthetic, public fixture and automated tests. Real project decks, logos, images, customer materials and work directories must stay **outside this public repository**.
8. JSON run metrics: commit, engine version, input hashes, total elapsed time and phase timings, build/render attempts, cold-vs-warm run, exit status. Never claim speed improvements without same-environment measurements.

## Acceptance

- One documented command builds the configured one-slide editable PPTX and preview on a supported runtime.
- Two independent runs from unchanged private test inputs succeed and produce evidence.
- Editable business text stays editable; no entire-page bitmap substitutions.
- Structure and typography checks pass. A human-viewed render is required before visual PASS.
- Cold and warm benchmark timings are reported; failures never return a false PASS.
- Existing original plugin, command and Skill entry points are preserved.
- Public git diff contains no private presentation, reference image, customer branding, secrets, absolute local paths or private runtimes.
- Deliver changes via **draft PR to this fork's main**, without automatic merge.

## Boundaries

Do not build automatic OCR / scene detection, a generalized Scene JSON platform, a second PPT engine, or bulk-slide generation in this iteration. Avoid modifying original reference decks or unrelated deliverables.

## Deliverables

- `src/engine/`, `src/components/`, `src/assets/`, `src/typography/`, `src/qa/`
- `schemas/layer-manifest.schema.json`
- `scripts/rebuild.mjs`, `tests/` with synthetic fixtures
- `docs/ARCHITECTURE.md`, `docs/QUICKSTART.md`, `docs/PRIVACY_POLICY_FOR_FIXTURES.md`
- A draft PR summarizing implementation, tests, known limitations and benchmark methodology.

Detailed private regression inputs and acceptance evidence remain in the owner's separate, non-public project workspace.
