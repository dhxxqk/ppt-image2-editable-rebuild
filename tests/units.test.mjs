import test from "node:test";
import assert from "node:assert/strict";
import { ptToPx, pxToPt, ptToIn, inToPt, lineHeightIn } from "../src/typography/units.mjs";

test("points convert to CSS pixels at 96/72", () => {
  assert.equal(ptToPx(11), (11 * 96) / 72);
  assert.equal(ptToPx(12), 16);
  assert.equal(ptToPx(0), 0);
});

test("pixel and point conversion round-trips", () => {
  for (const pt of [8, 10.5, 11, 13.5, 20, 21, 72]) {
    assert.ok(Math.abs(pxToPt(ptToPx(pt)) - pt) < 1e-9, `round trip ${pt}`);
  }
});

test("inches convert from points", () => {
  assert.equal(inToPt(1), 72);
  assert.equal(ptToIn(72), 1);
  assert.ok(Math.abs(ptToIn(11) - 11 / 72) < 1e-12);
});

test("line height uses the font size and multiplier", () => {
  assert.equal(lineHeightIn(11, 1.35), (11 * 1.35) / 72);
  assert.equal(lineHeightIn(12, 1), 12 / 72);
});
