import test from "node:test";
import assert from "node:assert/strict";
import { computeCards, computeCardStack, computeTimeline, px } from "../src/components/geometry.mjs";

const layout = {
  margin_in: 0.45,
  gap_in: 0.22,
  cardTop_in: 1.56,
  cardH_in: 2.8,
  headerH_in: 0.4,
  iconDiscTop_in: 2.06,
  iconDiscD_in: 0.66,
  iconTop_in: 2.14,
  iconW_in: 0.46,
  iconH_in: 0.5,
  bodyTop_in: 2.9,
  bodyH_in: 1.36,
  bodyPad_in: 0.07,
  tailTop_in: 4.32,
  tailH_in: 0.16,
  tailW_in: 0.18,
  trackTop_in: 4.53,
  trackH_in: 0.26,
  trackLeft_in: 0.55,
  trackW_in: 10.11,
  shaftTop_in: 4.59,
  shaftH_in: 0.14,
  shaftLeft_in: 0.75,
  shaftW_in: 9.65,
  arrowW_in: 0.24,
  arrowH_in: 0.32,
  arrowLeft_in: 10.34,
  nodeTop_in: 4.48,
  nodeD_in: 0.36,
  dateTop_in: 4.93,
  dateH_in: 0.34,
  dateW_in: 1.52,
};

test("six cards share the width left by margins and gaps", () => {
  const { cards, cardW, gap, margin } = computeCards(11.111111, layout, 6);
  assert.equal(cards.length, 6);
  const total = cardW * 6 + gap * 5;
  assert.ok(Math.abs(total - (11.111111 - 2 * margin)) < 1e-9);
});

test("card vertical centres are evenly spaced", () => {
  const { cards } = computeCards(11.111111, layout, 6);
  const deltas = cards.slice(1).map((c, i) => c.center_in - cards[i].center_in);
  for (const d of deltas) {
    assert.ok(Math.abs(d - deltas[0]) < 1e-9);
  }
  assert.ok(deltas[0] > 0);
});

test("cards never overlap", () => {
  const { cards } = computeCards(11.111111, layout, 6);
  for (let i = 1; i < cards.length; i += 1) {
    const previousRight = cards[i - 1].left_in + cards[i - 1].width_in;
    assert.ok(cards[i].left_in >= previousRight, `card ${i} overlaps card ${i - 1}`);
  }
});

test("card stack derives body and tail anchors from layout", () => {
  const stack = computeCardStack(layout);
  assert.equal(stack.cardH, 2.8);
  assert.equal(stack.cardBottom, 4.36);
  assert.equal(stack.tailW, 0.18);
  assert.ok(stack.bodyTop > stack.iconDiscTop + stack.iconDiscD);
});

test("timeline head is vertically centred on the track", () => {
  const t = computeTimeline(layout);
  const trackCenter = t.track.top_in + t.track.height_in / 2;
  const headCenter = t.head.top_in + t.head.height_in / 2;
  assert.ok(Math.abs(trackCenter - headCenter) < 1e-9);
  // The shaft must start before the head so no seam appears between them.
  assert.ok(t.shaft.left_in + t.shaft.width_in >= t.head.left_in);
});

test("px converts inches to the engine's 96 dpi geometry units", () => {
  assert.equal(px(1), 96);
  assert.equal(px(0.5), 48);
});
