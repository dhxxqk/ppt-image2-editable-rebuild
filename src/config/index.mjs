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

  need(isPlainObject(config.slide), "slide", "slide block is required");
  if (isPlainObject(config.slide)) {
    need(typeof config.slide.master === "string" && config.slide.master.length > 0, "slide.master", "path to the presentation base is required");
    need(Number.isFinite(config.slide.width_in) && config.slide.width_in > 0, "slide.width_in", "positive slide width required");
    need(Number.isFinite(config.slide.height_in) && config.slide.height_in > 0, "slide.height_in", "positive slide height required");
    need(typeof config.slide.layout === "string" && config.slide.layout.length > 0, "slide.layout", "layout name is required");
  }

  need(isPlainObject(config.layout), "layout", "layout block is required");
  if (isPlainObject(config.layout)) {
    for (const key of ["cardTop_in", "cardH_in", "headerH_in", "bodyTop_in", "bodyH_in", "trackTop_in", "trackH_in", "nodeTop_in", "nodeD_in", "dateTop_in", "dateH_in"]) {
      need(Number.isFinite(config.layout[key]), `layout.${key}`, "numeric value required");
    }
  }

  need(isPlainObject(config.typography), "typography", "typography block is required");
  if (isPlainObject(config.typography)) {
    for (const key of ["bodyPt", "cardTitlePt", "pageTitlePt", "chapterPt", "datePt"]) {
      need(Number.isFinite(config.typography[key]) && config.typography[key] > 0, `typography.${key}`, "positive font size required");
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
