/**
 * OOXML typography postprocessing (East-Asian hanging punctuation).
 *
 * The rewrite itself is a small Python zip/XML tool so that the exact bytes of
 * every other PPTX part are preserved. This wrapper only spawns it and turns
 * its JSON report into a structured result.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "hanging_punct.py");

/**
 * @returns {{status:"PASS"|"FAIL"|"SKIPPED", changedParagraphs:number, textUnchanged:boolean, slides:Array, error?:string}}
 */
export function postprocessHangingPunctuation({ pptxPath, pythonPath, slides }) {
  if (!pptxPath) throw new Error("pptxPath is required");
  const exe = pythonPath || "python";
  const args = [SCRIPT, pptxPath];
  if (Array.isArray(slides) && slides.length) args.push("--slides", slides.join(","));
  const run = spawnSync(exe, args, { encoding: "utf8", timeout: 120000 });
  const stdout = (run.stdout || "").trim();
  const stderr = (run.stderr || "").trim();
  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout.split("\n").pop()) : null;
  } catch {
    parsed = null;
  }
  if (run.error || run.status !== 0 || !parsed) {
    return {
      status: "FAIL",
      changedParagraphs: 0,
      textUnchanged: false,
      slides: [],
      error: `hanging punctuation postprocess failed (exit ${run.status}): ${stderr || stdout || run.error?.message || "unknown"}`,
    };
  }
  return {
    status: parsed.status === "PASS" ? "PASS" : "FAIL",
    changedParagraphs: parsed.changed_paragraphs ?? 0,
    textUnchanged: parsed.text_unchanged !== false,
    slides: parsed.slides || [],
  };
}
