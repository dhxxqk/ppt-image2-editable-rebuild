import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig, assertValidConfig, loadConfig, makePathResolver } from "../src/config/index.mjs";
import { LayerRecorder } from "../src/manifest/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "synthetic-timeline.config.json");

function fixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
}

test("the public synthetic fixture validates", () => {
  const issues = validateConfig(fixture());
  assert.deepEqual(issues, []);
  assert.doesNotThrow(() => assertValidConfig(fixture()));
});

test("missing master is rejected", () => {
  const cfg = fixture();
  delete cfg.slide.master;
  const issues = validateConfig(cfg);
  assert.ok(issues.some((i) => i.field === "slide.master"));
});

test("manual line breaks in card body are rejected", () => {
  const cfg = fixture();
  cfg.cards[0].body = "第一行\n第二行";
  const issues = validateConfig(cfg);
  assert.ok(issues.some((i) => i.field === "cards[0].body"));
});

test("duplicate card ids are rejected", () => {
  const cfg = fixture();
  cfg.cards[1].id = cfg.cards[0].id;
  assert.throws(() => assertValidConfig(cfg), /invalid rebuild config/);
});

test("unknown schema version is rejected", () => {
  const cfg = fixture();
  cfg.schema = "pvr.rebuild.config/v0";
  assert.ok(validateConfig(cfg).some((i) => i.field === "schema"));
});

test("config paths resolve relative to the config file", () => {
  const resolve = makePathResolver(path.join(HERE, "fixtures"));
  const resolved = resolve("icons/demo-icon.png");
  assert.ok(path.isAbsolute(resolved));
  assert.ok(resolved.endsWith(path.join("icons", "demo-icon.png")));
  assert.ok(fs.existsSync(resolved), "fixture icon should exist");
});

test("loadConfig reports a clear error for a missing file", () => {
  assert.throws(() => loadConfig(path.join(HERE, "fixtures", "does-not-exist.json")), /config not found/);
});

test("layer recorder assigns increasing z-order and counts roles", () => {
  const recorder = new LayerRecorder();
  recorder.add({ element_id: "a", semantic_role: "x", target_bbox_in: [0, 0, 1, 1], editability: "editable_text" });
  recorder.add({ element_id: "b", semantic_role: "y", target_bbox_in: [0, 0, 1, 1], editability: "editable_shape", native_or_crop: "crop" });
  assert.deepEqual(
    recorder.layers.map((l) => l.z_index),
    [0, 1],
  );
  assert.deepEqual(recorder.counts(), { total: 2, native: 1, crop: 1, text: 1 });
});

test("layer recorder rejects an entry without element_id", () => {
  const recorder = new LayerRecorder();
  assert.throws(() => recorder.add({ semantic_role: "x" }), /element_id/);
});
