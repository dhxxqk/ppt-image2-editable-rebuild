import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LayerRecorder } from "../src/manifest/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS = path.join(HERE, "..", "schemas");

const schema = (name) => JSON.parse(fs.readFileSync(path.join(SCHEMAS, name), "utf8"));

/**
 * Small JSON-Schema subset validator: enough for the keywords this project's
 * schemas use, with no runtime dependency.
 */
function validate(value, spec, root, pointer = "$") {
  const errors = [];
  if (spec.$ref) {
    const target = spec.$ref.replace(/^#\//, "").split("/").reduce((acc, key) => acc[key], root);
    return validate(value, target, root, pointer);
  }
  if (spec.oneOf) {
    const results = spec.oneOf.map((s) => validate(value, s, root, pointer));
    const ok = results.filter((r) => r.length === 0).length;
    if (ok !== 1) errors.push(`${pointer}: expected exactly one oneOf branch to match (${ok})`);
    return errors;
  }
  if (spec.type) {
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const ok = types.some((t) =>
      t === "integer" ? Number.isInteger(value) : t === "array" ? Array.isArray(value) : t === "null" ? value === null : typeof value === t,
    );
    if (!ok) {
      errors.push(`${pointer}: expected ${types.join("|")}, got ${actual}`);
      return errors;
    }
  }
  if (spec.const !== undefined && value !== spec.const) errors.push(`${pointer}: expected const ${spec.const}`);
  if (spec.enum && !spec.enum.includes(value)) errors.push(`${pointer}: ${value} not in enum`);
  if (typeof value === "string") {
    if (spec.minLength !== undefined && value.length < spec.minLength) errors.push(`${pointer}: shorter than ${spec.minLength}`);
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) errors.push(`${pointer}: does not match ${spec.pattern}`);
  }
  if (typeof value === "number") {
    if (spec.minimum !== undefined && value < spec.minimum) errors.push(`${pointer}: below minimum ${spec.minimum}`);
    if (spec.exclusiveMinimum !== undefined && value <= spec.exclusiveMinimum) errors.push(`${pointer}: not above ${spec.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (spec.minItems !== undefined && value.length < spec.minItems) errors.push(`${pointer}: fewer than ${spec.minItems} items`);
    if (spec.maxItems !== undefined && value.length > spec.maxItems) errors.push(`${pointer}: more than ${spec.maxItems} items`);
    if (spec.items) value.forEach((v, i) => errors.push(...validate(v, spec.items, root, `${pointer}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of spec.required || []) if (!(key in value)) errors.push(`${pointer}: missing required "${key}"`);
    for (const [key, sub] of Object.entries(spec.properties || {})) {
      if (key in value) errors.push(...validate(value[key], sub, root, `${pointer}.${key}`));
    }
  }
  return errors;
}

test("the synthetic fixture matches the config schema", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "synthetic-timeline.config.json"), "utf8"));
  const errs = validate(cfg, schema("rebuild-config.schema.json"), schema("rebuild-config.schema.json"));
  assert.deepEqual(errs, []);
});

test("a config with a manual line break violates the schema pattern", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "synthetic-timeline.config.json"), "utf8"));
  cfg.cards[0].body = "第一行\n第二行";
  const errs = validate(cfg, schema("rebuild-config.schema.json"), schema("rebuild-config.schema.json"));
  assert.ok(errs.length > 0);
});

test("a recorded manifest matches the layer manifest schema", () => {
  const recorder = new LayerRecorder();
  recorder.add({
    element_id: "card.01.body",
    semantic_role: "milestone_card",
    reference_bbox_px: [10, 20, 30, 40],
    target_bbox_in: [0.45, 1.56, 1.5, 2.8],
    editability: "editable_shape",
    notes: "synthetic",
  });
  recorder.add({
    element_id: "card.01.icon",
    semantic_role: "linear_icon",
    reference_bbox_px: null,
    target_bbox_in: [0.9, 2.14, 0.46, 0.5],
    native_or_crop: "crop",
    asset_path: "icons/demo-icon.png",
    editability: "local_image",
  });
  const manifest = {
    schema: "pvr.layer_manifest/v1",
    task: "synthetic",
    page: { title: "示例节点", chapter: "示例章节" },
    target: { file: "synthetic.pptx", slide_size_in: [13.333333, 7.5], render_px: [1920, 1080] },
    counts: recorder.counts(),
    layers: recorder.layers,
  };
  const s = schema("layer-manifest.schema.json");
  assert.deepEqual(validate(manifest, s, s), []);
});

test("a manifest layer without z_index is rejected by the schema", () => {
  const s = schema("layer-manifest.schema.json");
  const manifest = {
    schema: "pvr.layer_manifest/v1",
    task: "synthetic",
    page: { title: "t", chapter: "c" },
    target: { file: "f.pptx", slide_size_in: [1, 1], render_px: [10, 10] },
    counts: { total: 1, native: 1, crop: 0, text: 0 },
    layers: [
      {
        element_id: "a",
        semantic_role: "b",
        target_bbox_in: [0, 0, 1, 1],
        native_or_crop: "native",
        editability: "editable_text",
      },
    ],
  };
  const errs = validate(manifest, s, s);
  assert.ok(errs.some((e) => e.includes("z_index")));
});
