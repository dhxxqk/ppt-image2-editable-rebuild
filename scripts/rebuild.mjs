#!/usr/bin/env node
/**
 * One-command rebuild: config -> assets -> native slide -> PPTX -> typography
 * -> render -> three QA gates -> manifest/metrics.
 *
 *   node scripts/rebuild.mjs --config <private-config.json> --out <dir>
 *
 * Everything the build needs is declared in the config. No path, business
 * string or credential is hardcoded here, so the same command works for a
 * synthetic fixture and for a private one-slide regression.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadConfig, makePathResolver, ConfigError } from "../src/config/index.mjs";
import { loadEngine, EngineError, detectEngineVersion, resolveEngineEntry } from "../src/engine/index.mjs";
import { runEnvironmentChecks, formatCheck } from "../src/engine/diagnostics.mjs";
import { prepareAssets, sha256File } from "../src/assets/index.mjs";
import { buildSlide } from "../src/build/slide.mjs";
import { exportPptx, exportEnginePng, exportLayoutJson } from "../src/build/export.mjs";
import { postprocessHangingPunctuation } from "../src/typography/hanging-punct.mjs";
import { preflightCards } from "../src/typography/preflight.mjs";
import { computeCards } from "../src/components/geometry.mjs";
import { renderSlide } from "../src/render/libreoffice.mjs";
import { runQa } from "../src/qa/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const cur = argv[i];
    if (!cur.startsWith("--")) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args.flags.add(key);
    }
  }
  return args;
}

function gitCommit() {
  try {
    const head = fs.readFileSync(path.join(REPO_ROOT, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const refPath = path.join(REPO_ROOT, ".git", head.slice(5));
      if (fs.existsSync(refPath)) return fs.readFileSync(refPath, "utf8").trim();
    }
    return head;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function cacheKey(config, resolvePath) {
  const parts = [];
  for (const card of config.cards || []) {
    parts.push(card.id, card.icon?.path || "", card.icon?.sha256 || "");
    if (card.icon?.path) {
      const p = resolvePath(card.icon.path);
      if (fs.existsSync(p)) parts.push(sha256File(p));
    }
  }
  parts.push(JSON.stringify(config.layout), JSON.stringify(config.theme), config.slide.width_in);
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fsp.copyFile(s, d);
  }
}

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config;
  if (!configPath) {
    console.error("usage: node scripts/rebuild.mjs --config <config.json> --out <dir> [--assets-mode prepared|derive] [--skip-render] [--skip-qa] [--label <name>] [--no-cache]");
    process.exit(2);
  }

  const { config, configPath: absConfig, baseDir } = loadConfig(configPath);
  const resolvePath = makePathResolver(baseDir);
  const outDir = path.resolve(args.out || path.join(REPO_ROOT, "out", config.id));
  const pythonPath = args.python || config.python?.path || "python";
  const label = args.label || "run";
  const skipRender = args.flags.has("skip-render");
  const skipQa = args.flags.has("skip-qa");
  const noCache = args.flags.has("no-cache");
  const assetsMode = args["assets-mode"] || config.assets?.mode || "prepared";

  const timings = {};
  const stage = (name, ms) => {
    timings[name] = ms;
  };
  const t = () => Date.now();

  await fsp.mkdir(outDir, { recursive: true });
  const metricsPath = path.join(outDir, "metrics.json");
  const metrics = {
    schema: "pvr.metrics/v1",
    run_label: label,
    started_at: nowIso(),
    repo_commit: gitCommit(),
    engine_version: null,
    config: { path: absConfig, sha256: sha256File(absConfig) },
    input_hashes: {},
    total_elapsed_ms: null,
    asset_prep_ms: null,
    layout_ms: null,
    pptx_export_ms: null,
    postprocess_ms: null,
    render_ms: null,
    content_qa_ms: null,
    technical_qa_ms: null,
    visual_review_ms: null,
    build_attempts: 1,
    render_attempts: 0,
    cache_hit: false,
    exit_status: "FAIL",
    deliverable: false,
    stages: [],
  };
  const record = (name, status, detail) => metrics.stages.push({ name, status, detail, at: nowIso() });

  const fail = async (stageName, error, extra = {}) => {
    record(stageName, "FAIL", error?.message || String(error));
    metrics.total_elapsed_ms = Date.now() - started;
    metrics.exit_status = "FAIL";
    Object.assign(metrics, extra);
    await fsp.writeFile(metricsPath, JSON.stringify(metrics, null, 2), "utf8");
    const payload = {
      status: "FAIL",
      stage: stageName,
      error: error?.message || String(error),
      code: error?.code || null,
      next_action: error?.nextAction || null,
      issues: error?.issues || undefined,
      metrics: metricsPath,
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  };

  // ---- stage 1: environment ----
  let s = t();
  let env;
  try {
    env = runEnvironmentChecks({ config, resolvePath: (p) => (p ? resolvePath(p) : p), pythonPath });
  } catch (error) {
    return fail("env_check", error);
  }
  stage("env_check_ms", t() - s);
  for (const check of env.checks) console.log(formatCheck(check));
  record("env_check", env.ok ? "PASS" : "FAIL", `${env.checks.filter((c) => c.ok).length}/${env.checks.length} checks`);
  if (!env.ok) {
    const first = env.checks.find((c) => !c.ok);
    const err = new EngineError("ENV_CHECK_FAILED", `${first.id}: ${first.detail}`, first.nextAction);
    return fail("env_check", err);
  }
  metrics.engine_version = detectEngineVersion(resolveEngineEntry(config.engine?.entry));
  metrics.input_hashes.master = sha256File(resolvePath(config.slide.master));

  // ---- stage 2: assets ----
  s = t();
  const key = cacheKey(config, resolvePath);
  const cacheDir = path.join(outDir, ".cache", `assets-${key}`);
  let assets;
  try {
    if (!noCache && fs.existsSync(cacheDir) && fs.existsSync(path.join(cacheDir, "icons"))) {
      const icons = new Map();
      const hashes = {};
      for (const card of config.cards) {
        if (!card.icon?.path) continue;
        const staged = path.join(cacheDir, "icons", `${card.id}${path.extname(card.icon.path) || ".png"}`);
        if (!fs.existsSync(staged)) throw new Error(`cache incomplete for ${card.id}`);
        icons.set(card.id, await fsp.readFile(staged));
        hashes[card.id] = sha256File(staged);
      }
      assets = {
        icons,
        report: { mode: "cache", steps: [{ step: "cache", status: "PASS", detail: key }], hashes, asset_dir: cacheDir },
      };
      metrics.cache_hit = true;
      record("asset_prep", "PASS", `cache hit ${key}`);
    } else {
      assets = await prepareAssets({
        config,
        resolvePath,
        pythonPath,
        outDir,
        mode: assetsMode,
        log: (m) => console.log(`  [assets] ${m}`),
      });
      if (!noCache) {
        await copyDir(path.join(outDir, "assets"), cacheDir);
        await fsp.writeFile(path.join(cacheDir, "report.json"), JSON.stringify(assets.report, null, 2), "utf8");
      }
      metrics.cache_hit = false;
      record("asset_prep", assets.report.steps.every((x) => x.status === "PASS") ? "PASS" : "FAIL", JSON.stringify(assets.report.hashes));
    }
  } catch (error) {
    return fail("asset_prep", error);
  }
  stage("asset_prep_ms", t() - s);
  metrics.input_hashes.icons = assets.report.hashes;

  // ---- stage 3: typography preflight (milestone cards only) ----
  const isOverview = (config.template || "milestone-timeline") === "overview-two-column";
  let preflight = { status: "SKIPPED", reason: "overview template lays text out per panel" };
  if (!isOverview) {
    const geom = computeCards(config.slide.width_in, config.layout, config.cards.length);
    preflight = preflightCards({
      cards: config.cards,
      layout: { ...config.layout, cardW_in: geom.cardW },
      typography: config.typography,
    });
    if (preflight.status === "FAIL") {
      record("preflight", preflight.status, `overflow=${preflight.overflow.join(",") || "none"} tight=${preflight.tight.join(",") || "none"}`);
      await fsp.writeFile(path.join(outDir, "preflight.json"), JSON.stringify(preflight, null, 2), "utf8");
      return fail("preflight", new Error(`text preflight overflow: ${preflight.overflow.join(", ")}`));
    }
  }
  record("preflight", preflight.status, isOverview ? "overview template" : `overflow=${preflight.overflow.join(",") || "none"} tight=${preflight.tight.join(",") || "none"}`);
  await fsp.writeFile(path.join(outDir, "preflight.json"), JSON.stringify(preflight, null, 2), "utf8");

  // ---- stage 4: layout + export ----
  let engine;
  s = t();
  try {
    engine = await loadEngine(config.engine?.entry);
  } catch (error) {
    return fail("engine_load", error);
  }
  stage("engine_load_ms", t() - s);
  s = t();
  let built;
  try {
    built = await buildSlide(engine, config, { iconBuffers: assets.icons });
  } catch (error) {
    return fail("layout", error);
  }
  stage("layout_ms", t() - s);

  s = t();
  const pptxName = config.output?.pptx_name || "PVR_P03_REBUILD_v1.pptx";
  const pptxPath = path.join(outDir, pptxName);
  try {
    await exportPptx(engine, built.pres, pptxPath);
  } catch (error) {
    return fail("pptx_export", error);
  }
  stage("pptx_export_ms", t() - s);
  record("pptx_export", "PASS", pptxPath);

  // engine preview is diagnostic evidence only; timed because it is not free
  s = t();
  try {
    await exportEnginePng(built.pres, built.slide, path.join(outDir, "engine_preview.png"));
    await exportLayoutJson(built.slide, path.join(outDir, "engine_layout.json"));
  } catch (error) {
    record("engine_preview", "WARN", error.message);
  }
  stage("engine_preview_ms", t() - s);

  // ---- stage 5: typography postprocess ----
  s = t();
  let typo = { status: "SKIPPED" };
  if (config.typography.hangingPunct !== false) {
    typo = postprocessHangingPunctuation({ pptxPath, pythonPath });
    record("postprocess", typo.status, `${typo.changedParagraphs} paragraphs`);
    if (typo.status !== "PASS" || typo.textUnchanged === false) {
      stage("postprocess_ms", t() - s);
      return fail("postprocess", new Error(typo.error || "hanging punctuation rewrite changed visible text"));
    }
  }
  stage("postprocess_ms", t() - s);
  metrics.input_hashes.output_pptx = sha256File(pptxPath);

  // ---- stage 6: render ----
  let pngPath = null;
  if (!skipRender) {
    s = t();
    metrics.render_attempts += 1;
    try {
      const rendered = renderSlide({
        node: config.render.node || process.execPath,
        cli: config.render.cli,
        pptxPath,
        outDir: path.join(outDir, "render"),
        dpi: config.render.dpi,
        pages: [1],
        widthPx: config.render.width_px,
        heightPx: config.render.height_px,
        normalize: config.render.normalize || "resample",
        pythonPath,
      });
      pngPath = rendered.pngPath;
      record("render", "PASS", `${rendered.normalize.method} ${config.render.width_px}x${config.render.height_px}`);
      metrics.input_hashes.output_png = sha256File(pngPath);
    } catch (error) {
      stage("render_ms", t() - s);
      return fail("render", error);
    }
    stage("render_ms", t() - s);
  } else {
    record("render", "SKIPPED", "--skip-render");
  }

  // ---- stage 7: QA ----
  let qa = { status: "SKIPPED" };
  if (!skipQa) {
    try {
      qa = await runQa({
        config,
        resolvePath,
        pythonPath,
        pptxPath,
        pngPath,
        outDir: path.join(outDir, "qa"),
        baselinePng: config.qa?.baseline_png ? resolvePath(config.qa.baseline_png) : null,
        detailRoi: config.qa?.detail_roi,
      });
      if (qa.timings) {
        metrics.content_qa_ms = qa.timings.content_qa_ms;
        metrics.technical_qa_ms = qa.timings.technical_qa_ms;
        metrics.visual_review_ms = qa.timings.visual_review_ms;
      }
      record("qa", qa.status, JSON.stringify(qa.gates));
    } catch (error) {
      return fail("qa", error);
    }
  } else {
    record("qa", "SKIPPED", "--skip-qa");
  }

  // ---- manifest + logs ----
  const manifest = {
    schema: "pvr.layer_manifest/v1",
    task: config.id,
    page: { title: config.header.pageTitle, chapter: config.header.chapter },
    target: { file: path.basename(pptxPath), slide_size_in: [config.slide.width_in, config.slide.height_in], render_px: [config.render.width_px, config.render.height_px] },
    counts: built.layers.counts(),
    layers: built.layers.layers,
  };
  const manifestName = config.output?.manifest_name || `${config.id}_layer_manifest.json`;
  await fsp.writeFile(path.join(outDir, manifestName), JSON.stringify(manifest, null, 2), "utf8");

  const deliverable = !skipRender && !skipQa && qa.status === "PASS" && typo.status !== "FAIL";
  metrics.total_elapsed_ms = Date.now() - started;
  metrics.exit_status = qa.status === "FAIL" ? "FAIL" : "PASS";
  metrics.deliverable = deliverable;
  metrics.counts = built.layers.counts();
  metrics.outputs = {
    pptx: pptxPath,
    png: pngPath,
    manifest: path.join(outDir, manifestName),
    qa: path.join(outDir, "qa", "qa_result.json"),
  };
  metrics.timings = timings;
  // Gate 4 requires the phase timings as first-class fields, not only nested.
  for (const key of [
    "asset_prep_ms",
    "layout_ms",
    "pptx_export_ms",
    "postprocess_ms",
    "render_ms",
    "content_qa_ms",
    "technical_qa_ms",
    "visual_review_ms",
  ]) {
    metrics[key] = metrics[key] ?? timings[key] ?? null;
  }
  metrics.output_structure_sha256 = qa.technical?.structure_sha256 || null;
  metrics.qa_status = qa.status;
  metrics.typography = typo;
  await fsp.writeFile(metricsPath, JSON.stringify(metrics, null, 2), "utf8");

  const summary = {
    status: metrics.exit_status,
    deliverable,
    pptx: pptxPath,
    png: pngPath,
    layers: metrics.counts,
    total_ms: metrics.total_elapsed_ms,
    cache_hit: metrics.cache_hit,
    qa: qa.gates || null,
    metrics: metricsPath,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(metrics.exit_status === "PASS" && qa.status !== "FAIL" ? 0 : 1);
}

main().catch(async (error) => {
  if (error instanceof ConfigError) {
    console.error(JSON.stringify({ status: "FAIL", stage: "config", error: error.message, issues: error.issues }, null, 2));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
