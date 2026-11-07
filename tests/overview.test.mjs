import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../src/config/index.mjs";
import { assertRuns, runsToText, runsToBoldSpans } from "../src/components/rich-text.mjs";
import { overviewTextMap } from "../src/components/overview/text-map.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "synthetic-overview.config.json");
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

test("the synthetic overview fixture validates", () => {
  assert.deepEqual(validateConfig(fixture()), []);
});

test("overview requires a lead block", () => {
  const cfg = fixture();
  delete cfg.overview.lead;
  const issues = validateConfig(cfg);
  assert.ok(issues.some((i) => i.field === "overview.lead"));
});

test("overview rejects a run list that does not rebuild the source string", () => {
  const cfg = fixture();
  cfg.overview.lead.runs[0].text += "多余";
  const issues = validateConfig(cfg);
  assert.ok(issues.some((i) => i.field === "overview.lead.runs" && /concatenate/.test(i.message)));
});

test("overview rejects a run without an explicit bold flag", () => {
  const cfg = fixture();
  delete cfg.overview.cards[0].runs[0].bold;
  const issues = validateConfig(cfg);
  assert.ok(issues.some((i) => i.field.startsWith("overview.cards[0].runs[0].bold")));
});

test("overview rejects an arrow that references an unknown block", () => {
  const cfg = fixture();
  cfg.overview.diagram.arrows[0].to = "missing-block";
  const issues = validateConfig(cfg);
  assert.ok(issues.some((i) => i.field === "overview.diagram.arrows"));
});

test("an unknown template is rejected", () => {
  const cfg = fixture();
  cfg.template = "freeform";
  assert.ok(validateConfig(cfg).some((i) => i.field === "template"));
});

test("assertRuns rebuilds the source string and lists bold spans", () => {
  const runs = [
    { text: "普通", bold: false },
    { text: "重点", bold: true },
  ];
  assert.equal(assertRuns(runs, "普通重点"), "普通重点");
  assert.equal(runsToText(runs), "普通重点");
  assert.deepEqual(runsToBoldSpans(runs), ["重点"]);
  assert.throws(() => assertRuns(runs, "别的"), /different string/);
  assert.throws(() => assertRuns([], ""), /non-empty/);
});

test("the overview text map covers header, lead, cards, blocks, labels and caption", () => {
  const cfg = fixture();
  const map = overviewTextMap(cfg);
  const names = map.map((m) => m.shape);
  for (const required of [
    "chapter",
    "page-title",
    "lead-text",
    "research-text-1",
    "research-text-2",
    "research-text-3",
    "block-top-header-text",
    "block-top-item-6",
    "block-bottom-col-3-item-2",
    "diagram-label-flow",
    "diagram-caption",
  ]) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
  const lead = map.find((m) => m.shape === "lead-text");
  assert.deepEqual(lead.bold_spans, ["示例强调片段"]);
});

test("diagram text carries no bold expectation because the source is an image", () => {
  const map = overviewTextMap(fixture());
  const block = map.find((m) => m.shape === "block-top-header-text");
  assert.equal(block.bold_spans, null);
});
