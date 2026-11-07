/**
 * Environment diagnostics.
 *
 * The point is to answer "can this machine run a rebuild?" in one pass instead
 * of re-probing the runtime interactively. Every check returns a machine
 * readable id plus a next action, so a failure is actionable without reading
 * source code.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveEngineEntry, detectEngineVersion } from "./index.mjs";

function ok(id, detail) {
  return { id, ok: true, detail };
}

function fail(id, detail, nextAction) {
  return { id, ok: false, detail, nextAction };
}

/** artifact-tool entry exists and is a real module. */
export function checkEngine(entry) {
  try {
    const entryPath = resolveEngineEntry(entry);
    const st = fs.statSync(entryPath);
    if (!st.isFile()) return fail("engine.entry", `${entryPath} is not a file`, "Point ARTIFACT_TOOL_ENTRY at dist/artifact_tool.mjs.");
    const version = detectEngineVersion(entryPath);
    return ok("engine.entry", `${entryPath} (version ${version})`);
  } catch (error) {
    return fail("engine.entry", error.message, error.nextAction || "Set ARTIFACT_TOOL_ENTRY.");
  }
}

/** A presentation base (corporate master) is readable. */
export function checkMaster(masterPath, expectedSha256) {
  if (!masterPath) {
    return fail("slide.master", "config.slide.master is empty", "Set config.slide.master to a .pptx path.");
  }
  if (!fs.existsSync(masterPath)) {
    return fail("slide.master", `not found: ${masterPath}`, "Mount the drive that holds the master or fix the path.");
  }
  const size = fs.statSync(masterPath).size;
  if (expectedSha256) {
    return ok("slide.master", `${masterPath} (${size} bytes, hash checked by the build)`);
  }
  return ok("slide.master", `${masterPath} (${size} bytes)`);
}

/** Node.js version satisfies the engine requirement. */
export function checkNode(minMajor = 22) {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isNaN(major) || major < minMajor) {
    return fail("node.version", `Node.js ${process.versions.node}`, `Use Node.js >= ${minMajor}.19.`);
  }
  return ok("node.version", `Node.js ${process.versions.node}`);
}

/** A python interpreter with Pillow + python-pptx is available for QA/asset steps. */
export function checkPython(pythonPath, { needPillow = true, needPptx = true } = {}) {
  const exe = pythonPath || "python";
  const probe = spawnSync(exe, ["-c", "import sys,json;print(json.dumps(list(sys.version_info[:3])))"], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (probe.error || probe.status !== 0) {
    return fail("python.base", `${exe} is not runnable`, "Install Python 3.10+ or set python.path in the config / --python.");
  }
  const version = probe.stdout.trim();
  const missing = [];
  if (needPillow) {
    const r = spawnSync(exe, ["-c", "import PIL;print(PIL.__version__)"], { encoding: "utf8", timeout: 20000 });
    if (r.status !== 0) missing.push("Pillow");
  }
  if (needPptx) {
    const r = spawnSync(exe, ["-c", "import pptx;print(pptx.__version__)"], { encoding: "utf8", timeout: 20000 });
    if (r.status !== 0) missing.push("python-pptx");
  }
  if (missing.length) {
    return fail(
      "python.packages",
      `${exe} ${version} is missing: ${missing.join(", ")}`,
      `Install the missing packages into ${exe} (pip install ${missing.map((m) => (m === "Pillow" ? "Pillow" : "python-pptx")).join(" ")}).`,
    );
  }
  return ok("python.base", `${exe} ${version} with Pillow and python-pptx`);
}

/** LibreOffice render CLI (libreoffice-kit) is runnable. */
export function checkRenderer(renderer) {
  if (!renderer?.cli) {
    return fail("render.cli", "config.render.cli is empty", "Set config.render.cli to the libreoffice-kit lib/cli.js path.");
  }
  if (!fs.existsSync(renderer.cli)) {
    return fail("render.cli", `not found: ${renderer.cli}`, "Install @deepseek-ai/libreoffice-kit or set --renderer-cli.");
  }
  const node = renderer.node || process.execPath;
  const caps = spawnSync(node, [renderer.cli, "capabilities"], { encoding: "utf8", timeout: 60000 });
  if (caps.status !== 0) {
    return fail("render.cli", `capabilities check failed: ${(caps.stderr || "").slice(0, 300)}`, "Verify the LibreOffice engine package for this platform is installed.");
  }
  try {
    const info = JSON.parse(caps.stdout);
    const backends = info.imageRendering?.inputs || [];
    if (!backends.includes("pptx")) {
      return fail("render.cli", "renderer cannot rasterize pptx", "Install an engine package with Office rasterization support.");
    }
    return ok("render.cli", `${renderer.cli} (backend ${info.runtime?.backend || "unknown"})`);
  } catch {
    return fail("render.cli", "capabilities output was not JSON", "Check that the CLI path points at libreoffice-kit lib/cli.js.");
  }
}

/** Input icon assets exist and are non-empty. */
export function checkAssets(cards, resolvePath) {
  const problems = [];
  for (const card of cards) {
    if (!card.icon?.path) continue;
    const p = resolvePath(card.icon.path);
    if (!fs.existsSync(p)) problems.push(`${card.id}: missing ${p}`);
    else if (fs.statSync(p).size === 0) problems.push(`${card.id}: empty ${p}`);
  }
  if (problems.length) {
    return fail("assets.icons", problems.join("; "), "Provide the cropped icon PNGs, or enable asset derivation from a reference image.");
  }
  return ok("assets.icons", `${cards.filter((c) => c.icon?.path).length} icon file(s) present`);
}

/**
 * Run every check. `resolvePath` maps config-relative paths to absolute ones.
 */
export function runEnvironmentChecks({ config, resolvePath, pythonPath }) {
  const checks = [
    checkNode(22),
    checkEngine(config.engine?.entry),
    checkMaster(resolvePath(config.slide?.master || ""), config.slide?.master_sha256),
    checkPython(pythonPath || config.python?.path, { needPillow: true, needPptx: true }),
    checkRenderer(config.render),
    checkAssets(config.cards || [], resolvePath),
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

/** Human-readable one-line summary of a check. */
export function formatCheck(check) {
  const mark = check.ok ? "PASS" : "FAIL";
  const extra = check.ok ? "" : ` -> ${check.nextAction}`;
  return `[${mark}] ${check.id}: ${check.detail}${extra}`;
}

export { path };
