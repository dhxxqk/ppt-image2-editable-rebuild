import test from "node:test";
import assert from "node:assert/strict";
import { estimateTextFit, preflightCards, textWidthEm } from "../src/typography/preflight.mjs";

const base = { boxWidthIn: 1.38, boxHeightIn: 1.36, fontPt: 11, lineSpacing: 1.35 };

test("CJK characters are wider than Latin ones", () => {
  assert.ok(textWidthEm("中文") > textWidthEm("ab"));
  assert.equal(textWidthEm("中"), 1);
});

test("short text fits comfortably", () => {
  const fit = estimateTextFit({ ...base, text: "简短说明。" });
  assert.equal(fit.status, "ok");
  assert.equal(fit.estimatedLines, 1);
});

test("long text is reported as overflow before rendering", () => {
  const long = "这是一段刻意写得很长的说明文字，用来验证预检会在构建前报告溢出风险，而不是等到渲染之后才发现问题。";
  const fit = estimateTextFit({ ...base, text: long });
  assert.equal(fit.status, "overflow");
  assert.ok(fit.ratio > 1);
  assert.ok(fit.estimatedLines > 4);
});

test("a wider box needs fewer lines", () => {
  const long = "这是一段用于比较宽度影响的说明文字，内容长度保持不变。";
  const narrow = estimateTextFit({ ...base, text: long, boxWidthIn: 1.0 });
  const wide = estimateTextFit({ ...base, text: long, boxWidthIn: 2.0 });
  assert.ok(wide.estimatedLines <= narrow.estimatedLines);
});

test("preflight aggregates failures by card id", () => {
  const cards = [
    { id: "01", body: "短文本。" },
    { id: "02", body: "很长的一段文字".repeat(12) },
  ];
  const report = preflightCards({
    cards,
    layout: { cardW_in: 1.5, bodyPad_in: 0.07, bodyH_in: 1.36 },
    typography: { bodyPt: 11, bodyLine: 1.35 },
  });
  assert.equal(report.status, "FAIL");
  assert.deepEqual(report.overflow, ["02"]);
  assert.equal(report.rows.length, 2);
});
