/**
 * QA orchestration: three gates, one machine-readable result.
 *
 * Content   - the deck says exactly what the config says (no silent rewrites).
 * Technical - the deck is editable and structurally sound (no picture-of-a-slide).
 * Visual    - the rendered PNG is real, correctly sized and compared to the
 *             accepted baseline. A human must still look at it.
 *
 * The three Python tools are independent so each can be run and audited alone.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { overviewTextMap } from "../components/overview/text-map.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function runPython(pythonPath, args) {
  const run = spawnSync(pythonPath || "python", args, { encoding: "utf8", timeout: 300000 });
  return { status: run.status, stdout: (run.stdout || "").trim(), stderr: (run.stderr || "").trim() };
}

function parseJson(text, fallback) {
  const trimmed = (text || "").trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the last JSON object the tool printed.
    const lines = trimmed.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim() !== "{") continue;
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        /* keep scanning */
      }
    }
    return fallback;
  }
}

/** Read the tool's --out file when present; the file is never truncated. */
function readResult(outFile, stdout, fallback) {
  try {
    if (fs.existsSync(outFile)) return JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch {
    /* fall through to stdout */
  }
  return parseJson(stdout, fallback);
}

/** Build the content-QA expectations file from the private config. */
export function buildContentExpectations(config) {
  const base = {
    slide_index: 0,
    expected_slide_count: config.qa?.expected_slide_count ?? 1,
    header: { chapter: config.header.chapter, page_title: config.header.pageTitle },
    forbidden_texts: config.qa?.forbidden_texts ?? [],
    status_words: config.qa?.status_words ?? [],
  };

  if ((config.template || "milestone-timeline") === "overview-two-column") {
    const map = overviewTextMap(config);
    return {
      ...base,
      text_checks: map.map((m) => ({ shape: m.shape, role: m.role, text: m.text, bold_spans: m.bold_spans })),
    };
  }

  return {
    ...base,
    cards: config.cards.map((c) => ({ id: c.id, title: c.title, date: c.date, body: c.body })),
    authorized_overrides: config.cards
      .filter((c) => c.date_override)
      .map((c) => ({ shape: `date-${c.id}`, expected: c.date_override.value, reason: c.date_override.reason })),
  };
}

export function buildTechnicalExpectations(config) {
  let required;
  if ((config.template || "milestone-timeline") === "overview-two-column") {
    required = overviewTextMap(config).map((m) => m.shape);
  } else {
    required = ["chapter", "page-title"];
    for (const c of config.cards) required.push(`card-${c.id}-body`, `card-${c.id}-header`, `date-${c.id}`, `node-${c.id}`);
  }
  return {
    slide_index: 0,
    expected_slide_count: config.qa?.expected_slide_count ?? 1,
    slide_width_in: config.slide.width_in,
    slide_height_in: config.slide.height_in,
    font_family: config.typography.fontFamily,
    required_text_shapes: required,
    max_image_area_pct: config.qa?.max_image_area_pct ?? 5.0,
    min_objects: config.qa?.min_objects,
  };
}

/**
 * @returns {{status:string, content:object, technical:object, visual:object, files:object}}
 */
export async function runQa({ config, resolvePath, pythonPath, pptxPath, pngPath, outDir, baselinePng, detailRoi }) {
  await fsp.mkdir(outDir, { recursive: true });
  const contentExpect = path.join(outDir, "expectations.content.json");
  const technicalExpect = path.join(outDir, "expectations.technical.json");
  const visualExpect = path.join(outDir, "expectations.visual.json");
  await fsp.writeFile(contentExpect, JSON.stringify(buildContentExpectations(config), null, 2), "utf8");
  await fsp.writeFile(technicalExpect, JSON.stringify(buildTechnicalExpectations(config), null, 2), "utf8");

  const contentOut = path.join(outDir, "content_qa.json");
  const technicalOut = path.join(outDir, "technical_qa.json");
  const visualOut = path.join(outDir, "visual_qa.json");

  const contentStart = Date.now();
  const contentRun = runPython(pythonPath, [
    path.join(HERE, "content_qa.py"),
    "--pptx",
    pptxPath,
    "--expect",
    contentExpect,
    "--out",
    contentOut,
  ]);
  const content = readResult(contentOut, contentRun.stdout, { status: "FAIL", error: contentRun.stderr });
  const contentMs = Date.now() - contentStart;

  const techStart = Date.now();
  const techRun = runPython(pythonPath, [
    path.join(HERE, "technical_qa.py"),
    "--pptx",
    pptxPath,
    "--expect",
    technicalExpect,
    "--out",
    technicalOut,
  ]);
  const technical = readResult(technicalOut, techRun.stdout, { status: "FAIL", error: techRun.stderr });
  const technicalMs = Date.now() - techStart;

  let visual = { status: "SKIPPED", reason: "no render was produced" };
  let visualMs = null;
  if (pngPath && fs.existsSync(pngPath)) {
    const visualSpec = {
      width_px: config.render.width_px,
      height_px: config.render.height_px,
      min_std: config.qa?.min_std ?? 6.0,
      min_color_buckets: config.qa?.min_color_buckets ?? 40,
      baseline_png: baselinePng || null,
      detail_roi: detailRoi || null,
      roi_mask: config.qa?.roi_mask || null,
    };
    await fsp.writeFile(visualExpect, JSON.stringify(visualSpec, null, 2), "utf8");
    const visualStart = Date.now();
    const visualRun = runPython(pythonPath, [
      path.join(HERE, "visual_qa.py"),
      "--png",
      pngPath,
      "--expect",
      visualExpect,
      "--out",
      visualOut,
      "--out-full",
      path.join(outDir, "P03_001v2_vs_002_full.png"),
      "--out-detail",
      path.join(outDir, "P03_001v2_vs_002_detail.png"),
      "--out-heatmap",
      path.join(outDir, "P03_001v2_vs_002_heatmap.png"),
    ]);
    visual = readResult(visualOut, visualRun.stdout, { status: "FAIL", error: visualRun.stderr });
    visualMs = Date.now() - visualStart;
    visual.human_review_required = true;
    visual.human_review_note = "Pixel metrics are diagnostics; a person must view the PNG before claiming visual PASS.";
  }

  const statuses = [content.status, technical.status, visual.status];
  const overall = statuses.includes("FAIL") ? "FAIL" : statuses.includes("SKIPPED") ? "PARTIAL" : "PASS";

  const result = {
    schema: "pvr.qa_result/v1",
    generated_at: new Date().toISOString(),
    status: overall,
    gates: { content: content.status, technical: technical.status, visual: visual.status },
    content,
    technical,
    visual,
    artifacts: { content: contentOut, technical: technicalOut, visual: visualOut },
    timings: { content_qa_ms: contentMs, technical_qa_ms: technicalMs, visual_review_ms: visualMs },
  };
  const resultPath = path.join(outDir, "qa_result.json");
  await fsp.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  return { ...result, resultPath };
}
