/**
 * Rasterization adapter for the LibreOffice Kit CLI (libreoffice-kit).
 *
 * The kit renders the *saved* PPTX, which is the only trustworthy source for
 * final visual QA. Output is normalized to an exact pixel size and the
 * normalization method is recorded.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export class RenderError extends Error {
  constructor(message) {
    super(message);
    this.name = "RenderError";
    this.code = "RENDER_FAILED";
  }
}

/**
 * @param {object} spec {node, cli, pptxPath, outDir, dpi, pages, widthPx, heightPx, pythonPath}
 * @returns {{pngPath:string, manifest:object, normalize:object, elapsedHint:string}}
 */
export function renderSlide(spec) {
  const { node, cli, pptxPath, outDir, dpi, widthPx, heightPx, pythonPath } = spec;
  const pages = Array.isArray(spec.pages) && spec.pages.length ? spec.pages : [1];
  if (!fs.existsSync(cli)) throw new RenderError(`render CLI not found: ${cli}`);
  if (!fs.existsSync(pptxPath)) throw new RenderError(`pptx not found: ${pptxPath}`);
  if (fs.existsSync(outDir)) {
    // The CLI refuses an existing output directory. Remove our own render
    // directory entirely (it is regenerable) so a warm rerun behaves like a
    // cold one instead of failing with EEXIST.
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(outDir), { recursive: true });

  const run = spawnSync(
    node || process.execPath,
    [cli, "render", "--input", pptxPath, "--output-dir", outDir, "--pages", pages.join(","), "--dpi", String(dpi)],
    { encoding: "utf8", timeout: 300000 },
  );
  if (run.error || run.status !== 0) {
    throw new RenderError(`render failed (exit ${run.status}): ${(run.stderr || run.stdout || run.error?.message || "").slice(0, 800)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(run.stdout.trim().split("\n").pop());
  } catch {
    throw new RenderError(`render CLI returned non-JSON output: ${run.stdout.slice(0, 400)}`);
  }
  const image = parsed.images?.find((i) => i.page === pages[0]) || parsed.images?.[0];
  if (!image?.path) throw new RenderError("render CLI produced no image");

  const rawPath = image.path;
  const finalPath = path.join(outDir, "render.png");
  const norm = normalize({
    pythonPath,
    src: rawPath,
    dst: finalPath,
    width: widthPx,
    height: heightPx,
    mode: spec.normalize || "resample",
  });

  return {
    pngPath: finalPath,
    rawPath,
    manifest: parsed,
    normalize: norm,
    size: { width: image.width, height: image.height },
  };
}

function normalize({ pythonPath, src, dst, width, height, mode }) {
  const script = path.join(HERE, "normalize_png.py");
  const run = spawnSync(pythonPath || "python", [script, src, dst, String(width), String(height), mode || "resample"], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (run.status !== 0) {
    throw new RenderError(`PNG normalization failed: ${(run.stderr || run.stdout || "").slice(0, 500)}`);
  }
  try {
    return JSON.parse(run.stdout.trim());
  } catch {
    return { method: "unknown" };
  }
}
