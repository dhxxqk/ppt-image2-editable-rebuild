/**
 * Private rebuild configuration: load, validate, and resolve paths.
 *
 * A config describes one slide: the presentation base, the geometry and theme
 * of the component set, the six (or N) milestone cards, typography and QA
 * expectations. Real business text lives only in the private config; this
 * repository ships only synthetic fixtures.
 */
import fs from "node:fs";
import path from "node:path";

const REQUIRED_CARD_FIELDS = ["id", "title", "date", "body"];
export const TEMPLATES = ["milestone-timeline", "overview-two-column"];

/** Validate an ordered run list: non-empty, boolean bold, concatenation intact. */
function validateRuns(runs, field, expectedText) {
  const issues = [];
  if (!Array.isArray(runs) || runs.length === 0) {
    issues.push({ field, message: "non-empty run array required" });
    return issues;
  }
  let joined = "";
  runs.forEach((run, i) => {
    if (typeof run?.text !== "string" || run.text.length === 0) {
      issues.push({ field: `${field}[${i}].text`, message: "non-empty string required" });
    } else {
      joined += run.text;
    }
    if (typeof run?.bold !== "boolean") {
      issues.push({ field: `${field}[${i}].bold`, message: "bold must be true or false" });
    }
  });
  if (expectedText !== undefined && joined !== expectedText) {
    issues.push({ field, message: "runs do not concatenate to the source text" });
  }
  return issues;
}

class ConfigError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = "ConfigError";
    this.code = "CONFIG_INVALID";
    this.issues = issues || [];
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Structural validation. Returns a list of issues instead of throwing, so the
 * CLI can print every problem at once.
 */
export function validateConfig(config) {
  const issues = [];
  const need = (cond, field, msg) => {
    if (!cond) issues.push({ field, message: msg });
  };

  need(isPlainObject(config), "config", "config must be a JSON object");
  if (!isPlainObject(config)) return issues;

  need(config.schema === "pvr.rebuild.config/v1", "schema", "schema must be pvr.rebuild.config/v1");

  const template = config.template || "milestone-timeline";
  if (!TEMPLATES.includes(template)) {
    issues.push({ field: "template", message: `must be one of ${TEMPLATES.join(", ")}` });
  }

  need(isPlainObject(config.slide), "slide", "slide block is required");
  if (isPlainObject(config.slide)) {
    need(typeof config.slide.master === "string" && config.slide.master.length > 0, "slide.master", "path to the presentation base is required");
    need(Number.isFinite(config.slide.width_in) && config.slide.width_in > 0, "slide.width_in", "positive slide width required");
    need(Number.isFinite(config.slide.height_in) && config.slide.height_in > 0, "slide.height_in", "positive slide height required");
    need(typeof config.slide.layout === "string" && config.slide.layout.length > 0, "slide.layout", "layout name is required");
  }

  need(isPlainObject(config.typography), "typography", "typography block is required");
  if (isPlainObject(config.typography)) {
    for (const key of ["bodyPt", "cardTitlePt", "pageTitlePt", "chapterPt"]) {
      need(Number.isFinite(config.typography[key]) && config.typography[key] > 0, `typography.${key}`, "positive font size required");
    }
  }

  if (template === "overview-two-column") {
    issues.push(...validateOverview(config.overview));
    return issues;
  }

  need(isPlainObject(config.layout), "layout", "layout block is required");
  if (isPlainObject(config.layout)) {
    for (const key of ["cardTop_in", "cardH_in", "headerH_in", "bodyTop_in", "bodyH_in", "trackTop_in", "trackH_in", "nodeTop_in", "nodeD_in", "dateTop_in", "dateH_in"]) {
      need(Number.isFinite(config.layout[key]), `layout.${key}`, "numeric value required");
    }
  }

  need(Array.isArray(config.cards) && config.cards.length > 0, "cards", "at least one card is required");
  if (Array.isArray(config.cards)) {
    config.cards.forEach((card, i) => {
      for (const field of REQUIRED_CARD_FIELDS) {
        need(typeof card?.[field] === "string" && card[field].length > 0, `cards[${i}].${field}`, "non-empty string required");
      }
      const body = card?.body;
      if (typeof body === "string" && /\n/.test(body)) {
        issues.push({ field: `cards[${i}].body`, message: "body must not contain manual line breaks; let the text box wrap" });
      }
    });
    const ids = config.cards.map((c) => c?.id);
    if (new Set(ids).size !== ids.length) issues.push({ field: "cards", message: "card ids must be unique" });
  }

  return issues;
}

/**
 * Structural validation for the overview template: lead paragraph, research
 * cards and a diagram made of blocks, arrows and labels.
 */
function validateOverview(ov) {
  const issues = [];
  const need = (cond, field, msg) => {
    if (!cond) issues.push({ field, message: msg });
  };

  need(ov !== null && typeof ov === "object", "overview", "overview block is required for this template");
  if (!ov || typeof ov !== "object") return issues;

  need(ov.lead && typeof ov.lead === "object", "overview.lead", "lead paragraph block is required");
  if (ov.lead) {
    issues.push(...validateRuns(ov.lead.runs, "overview.lead.runs", ov.lead.text));
    need(Number.isFinite(ov.lead.fontPt), "overview.lead.fontPt", "numeric font size required");
    need(!!ov.lead.box && !!ov.lead.textBox, "overview.lead.box", "box and textBox geometry required");
  }

  need(Array.isArray(ov.cards) && ov.cards.length > 0, "overview.cards", "at least one research card is required");
  if (Array.isArray(ov.cards)) {
    ov.cards.forEach((card, i) => {
      issues.push(...validateRuns(card?.runs, `overview.cards[${i}].runs`, card?.text));
      need(!!card?.box && !!card?.textBox, `overview.cards[${i}].box`, "box and textBox geometry required");
    });
  }

  const dg = ov.diagram;
  need(dg && typeof dg === "object", "overview.diagram", "diagram block is required");
  if (dg) {
    need(Array.isArray(dg.blocks) && dg.blocks.length > 0, "overview.diagram.blocks", "at least one diagram block is required");
    const ids = new Set((dg.blocks || []).map((b) => b?.id));
    if (ids.size !== (dg.blocks || []).length) issues.push({ field: "overview.diagram.blocks", message: "block ids must be unique" });
    for (const block of dg.blocks || []) {
      need(typeof block?.id === "string" && block.id.length > 0, "overview.diagram.blocks[].id", "id required");
      need(!!block?.box, `overview.diagram.blocks[${block?.id}].box`, "geometry required");
      need(typeof block?.title === "string" && block.title.length > 0, `overview.diagram.blocks[${block?.id}].title`, "title required");
      if (block?.kind === "managementGrid") {
        need(Array.isArray(block.columns) && block.columns.length > 0, `overview.diagram.blocks[${block?.id}].columns`, "columns required");
      } else {
        need(Array.isArray(block?.items) && block.items.length > 0, `overview.diagram.blocks[${block?.id}].items`, "items required");
      }
    }
    for (const arrow of dg.arrows || []) {
      need(ids.has(arrow?.from) && ids.has(arrow?.to), "overview.diagram.arrows", "arrow endpoints must reference known blocks");
    }
  }

  return issues;
}

export function assertValidConfig(config) {
  const issues = validateConfig(config);
  if (issues.length) {
    throw new ConfigError(`invalid rebuild config: ${issues.length} issue(s)`, issues);
  }
  return config;
}

/** Load JSON from disk with a clear error for missing/corrupt files. */
export function loadConfig(configPath) {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    throw new ConfigError(`config not found: ${abs}`, [{ field: "config", message: "file does not exist" }]);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (error) {
    throw new ConfigError(`config is not valid JSON: ${abs}: ${error.message}`);
  }
  return { config: assertValidConfig(parsed), configPath: abs, baseDir: path.dirname(abs) };
}

/**
 * Return a resolver for paths inside the config. Relative paths are resolved
 * against the config directory, so the repo never needs machine-specific paths.
 */
export function makePathResolver(baseDir) {
  return (p) => {
    if (!p) return p;
    return path.isAbsolute(p) ? p : path.resolve(baseDir, p);
  };
}

export { ConfigError };
