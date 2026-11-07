/**
 * Runtime adapter for the externally installed `@oai/artifact-tool`.
 *
 * The package is a private Codex runtime dependency. It is never vendored in
 * this repository: callers point at an installed entry file via the
 * `ARTIFACT_TOOL_ENTRY` environment variable or the config field
 * `engine.entry`. Everything here is about locating, validating and loading
 * that external module, and turning failures into actionable diagnostics.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Minimum engine major that the adapter's API usage was validated against. */
export const VALIDATED_ENGINE = "2.8.134";

export class EngineError extends Error {
  constructor(code, message, nextAction) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.nextAction = nextAction;
  }
  toJSON() {
    return { code: this.code, message: this.message, nextAction: this.nextAction };
  }
}

/**
 * Turn a path or file:// URL into an absolute filesystem path.
 * Throws EngineError when the target does not exist.
 */
export function resolveEngineEntry(entry) {
  const raw = entry || process.env.ARTIFACT_TOOL_ENTRY;
  if (!raw) {
    throw new EngineError(
      "ENGINE_ENTRY_MISSING",
      "No artifact-tool entry was provided (config.engine.entry or ARTIFACT_TOOL_ENTRY).",
      "Set ARTIFACT_TOOL_ENTRY to the absolute path of @oai/artifact-tool/dist/artifact_tool.mjs.",
    );
  }
  let filePath = raw;
  if (raw.startsWith("file://")) filePath = new URL(raw).pathname;
  if (process.platform === "win32") {
    // URL pathname yields "/C:/..." which the filesystem layer does not accept.
    filePath = filePath.replace(/^\/([A-Za-z]:)/, "$1");
  }
  filePath = path.resolve(filePath);
  if (!fs.existsSync(filePath)) {
    throw new EngineError(
      "ENGINE_ENTRY_NOT_FOUND",
      `artifact-tool entry does not exist: ${filePath}`,
      "Install or locate a Codex/Presentations runtime that ships @oai/artifact-tool, then point at its dist/artifact_tool.mjs.",
    );
  }
  return filePath;
}

/** Read the engine version from the package.json next to the entry, if present. */
export function detectEngineVersion(entryPath) {
  let dir = path.dirname(entryPath);
  for (let i = 0; i < 4; i += 1) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.name === "@oai/artifact-tool") return pkg.version || "unknown";
      } catch {
        // fall through to the parent directory
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
}

/**
 * Load the engine module and return the two constructors this project uses.
 * The PoC-validated path is FileBlob.load + PresentationFile.importPptx,
 * because Presentation.load() needs an optional native adapter that is often
 * missing from trimmed runtimes.
 */
export async function loadEngine(entry) {
  const entryPath = resolveEngineEntry(entry);
  const version = detectEngineVersion(entryPath);
  let mod;
  try {
    mod = await import(pathToFileURL(entryPath).href);
  } catch (error) {
    throw new EngineError(
      "ENGINE_IMPORT_FAILED",
      `artifact-tool failed to import: ${error.message}`,
      "Check that the runtime's node_modules is complete and that the Node.js version matches the runtime requirement.",
    );
  }
  const { FileBlob, PresentationFile } = mod;
  if (!FileBlob?.load || !PresentationFile?.importPptx) {
    throw new EngineError(
      "ENGINE_API_UNSUPPORTED",
      `artifact-tool at ${entryPath} does not expose FileBlob.load / PresentationFile.importPptx.`,
      "Use a runtime built from @oai/artifact-tool >= 2.8, or update src/engine/index.mjs to the new API.",
    );
  }
  return { mod, entryPath, version, FileBlob, PresentationFile };
}

/**
 * Open a PPTX as a presentation object and import it as the slide base
 * (the master keeps its real logo, rules and theme).
 */
export async function importPresentation({ FileBlob, PresentationFile }, pptxPath) {
  if (!fs.existsSync(pptxPath)) {
    throw new EngineError(
      "MASTER_NOT_FOUND",
      `Presentation base file not found: ${pptxPath}`,
      "Check config.slide.master and that the drive holding the corporate master is mounted.",
    );
  }
  const blob = await FileBlob.load(pptxPath);
  return PresentationFile.importPptx(blob);
}
