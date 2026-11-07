/**
 * Local asset preparation: crop -> alpha -> residue check -> hash.
 *
 * Two modes:
 *  - `prepared`: the config points at ready RGBA icons (already cropped and
 *    keyed). The step still stages, hashes and residue-checks them, so a build
 *    can never silently use a stale or contaminated icon.
 *  - `derive`: the config carries a source reference image plus a pixel box per
 *    icon. The existing Skill crop helper produces raw crops, then the alpha
 *    step keys them.
 *
 * Everything is written under the build's own `assets/` directory; nothing is
 * read from or written to a private project folder implicitly.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CROP_SCRIPT = path.join(REPO_ROOT, "skills", "ppt-image2-editable-rebuild", "scripts", "crop_reference_assets.py");

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runPython(pythonPath, args, timeout = 180000) {
  const run = spawnSync(pythonPath || "python", args, { encoding: "utf8", timeout });
  return { status: run.status, stdout: (run.stdout || "").trim(), stderr: (run.stderr || "").trim() };
}

/**
 * @param {object} params {config, resolvePath, pythonPath, outDir, mode, log}
 * @returns {{icons: Map<string,Buffer>, report: object}}
 */
export async function prepareAssets({ config, resolvePath, pythonPath, outDir, mode = "prepared", log = () => {} }) {
  const assetDir = path.join(outDir, "assets");
  const rawDir = path.join(assetDir, "raw");
  const finalDir = path.join(assetDir, "icons");
  await fsp.mkdir(finalDir, { recursive: true });

  const steps = [];
  const deriveCards = (config.cards || []).filter((c) => c.icon?.derive);

  if (mode === "derive" && deriveCards.length) {
    await fsp.mkdir(rawDir, { recursive: true });
    const spec = {
      assets: deriveCards.map((c) => ({ name: c.icon.derive.name || `${c.id}.png`, box: c.icon.derive.box })),
    };
    const specPath = path.join(assetDir, "crop-spec.json");
    await fsp.writeFile(specPath, JSON.stringify(spec, null, 2), "utf8");
    const sources = new Set(deriveCards.map((c) => resolvePath(c.icon.derive.source)));
    if (sources.size !== 1) throw new Error("derive mode supports exactly one source reference image per build");
    const source = [...sources][0];
    log(`crop ${deriveCards.length} icon(s) from ${path.basename(source)}`);
    const run = runPython(pythonPath, [CROP_SCRIPT, "--image", source, "--out-dir", rawDir, "--spec", specPath]);
    if (run.status !== 0) throw new Error(`crop step failed: ${run.stderr || run.stdout}`);
    steps.push({ step: "crop", status: "PASS", detail: `${deriveCards.length} crops` });

    log("key raw crops to transparent RGBA");
    const alphaReport = path.join(assetDir, "icon_alpha_report.json");
    const alpha = runPython(pythonPath, [
      path.join(HERE, "icon_alpha.py"),
      "--in-dir",
      rawDir,
      "--out-dir",
      finalDir,
      "--report",
      alphaReport,
    ]);
    if (alpha.status !== 0) throw new Error(`alpha step failed: ${alpha.stderr || alpha.stdout}`);
    steps.push({ step: "alpha", status: "PASS", detail: (JSON.parse(alpha.stdout).count ?? 0) + " icons" });
  } else {
    // Stage the prepared icons so hashing and residue checks see exactly the
    // files the deck will embed.
    for (const card of config.cards || []) {
      if (!card.icon?.path) continue;
      const src = resolvePath(card.icon.path);
      if (!fs.existsSync(src)) throw new Error(`icon not found for card ${card.id}: ${src}`);
      const destName = `${card.id}${path.extname(src) || ".png"}`;
      await fsp.copyFile(src, path.join(finalDir, destName));
      card.__stagedIcon = path.join(finalDir, destName);
      if (card.icon.sha256) {
        const actual = sha256File(path.join(finalDir, destName));
        if (actual !== card.icon.sha256) {
          throw new Error(`icon hash mismatch for card ${card.id}: expected ${card.icon.sha256}, got ${actual}`);
        }
      }
    }
    steps.push({ step: "stage", status: "PASS", detail: `${(config.cards || []).filter((c) => c.icon?.path).length} icons` });
  }

  // Normalize staged paths for derive mode too.
  for (const card of config.cards || []) {
    if (card.__stagedIcon) continue;
    if (card.icon?.derive) {
      const name = card.icon.derive.name || `${card.id}.png`;
      card.__stagedIcon = path.join(finalDir, name);
    }
  }

  log("residue check on icon assets");
  const residueReport = path.join(assetDir, "icon_residue_report.json");
  const residue = runPython(pythonPath, [path.join(HERE, "residue_check.py"), "--dir", finalDir, "--report", residueReport]);
  let residueJson = null;
  try {
    residueJson = JSON.parse(residue.stdout);
  } catch {
    residueJson = { status: "FAIL", error: residue.stderr || "unparseable residue report" };
  }
  steps.push({
    step: "residue_check",
    status: residueJson.status === "PASS" ? "PASS" : "FAIL",
    detail: `${residueJson.count ?? 0} icon(s), failed=${(residueJson.failed || []).length}`,
  });

  const icons = new Map();
  const hashes = {};
  for (const card of config.cards || []) {
    if (!card.__stagedIcon) continue;
    if (!fs.existsSync(card.__stagedIcon)) throw new Error(`staged icon missing for card ${card.id}: ${card.__stagedIcon}`);
    icons.set(card.id, await fsp.readFile(card.__stagedIcon));
    hashes[card.id] = sha256File(card.__stagedIcon);
  }

  return {
    icons,
    report: {
      mode,
      steps,
      residue: residueJson,
      hashes,
      asset_dir: assetDir,
      residue_report: residueReport,
    },
  };
}
