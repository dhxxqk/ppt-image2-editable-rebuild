/**
 * Deterministic text-fit preflight.
 *
 * This is a warning tool, not a layout oracle: it estimates how many lines a
 * paragraph needs in a box of known width, and flags boxes whose estimated
 * text height exceeds their capacity. Real line breaking must always be
 * confirmed on a rendered PNG, because the shape engine and PowerPoint break
 * CJK text slightly differently.
 */
import { lineHeightIn, ptToIn } from "./units.mjs";

/**
 * Approximate advance width of a character in em units.
 * CJK ideographs and full-width punctuation occupy a full em; Latin letters and
 * digits roughly half. This is deliberately conservative (slightly wide).
 */
export function charWidthEm(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x2e80 && code <= 0x9fff) return 1.0; // CJK radicals .. unified ideographs
  if (code >= 0xf900 && code <= 0xfaff) return 1.0; // compatibility ideographs
  if (code >= 0xff00 && code <= 0xff60) return 1.0; // full-width forms
  if (code >= 0x3000 && code <= 0x303f) return 1.0; // CJK punctuation
  if (ch === " ") return 0.32;
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  if (/[a-z]/.test(ch)) return 0.52;
  return 0.55;
}

/** Sum of character advances for a string, in em. */
export function textWidthEm(text) {
  let sum = 0;
  for (const ch of text) sum += charWidthEm(ch);
  return sum;
}

/**
 * Estimate wrapped line count for `text` inside `boxWidthIn` at `fontPt`.
 * @returns {{charsPerLine:number, estimatedLines:number, estimatedHeightIn:number, capacityIn:number, ratio:number, status:string}}
 */
export function estimateTextFit({ text, boxWidthIn, boxHeightIn, fontPt, lineSpacing = 1.2 }) {
  const emIn = ptToIn(fontPt);
  const usableWidthEm = Math.max(0.1, boxWidthIn / emIn);
  // A line never breaks exactly at the em budget; keep a small safety margin.
  const usableWidthEmSafe = usableWidthEm * 0.97;

  const lines = [];
  let current = 0;
  for (const ch of text) {
    const w = charWidthEm(ch);
    if (current + w > usableWidthEmSafe && current > 0) {
      lines.push(current);
      current = w;
    } else {
      current += w;
    }
  }
  if (current > 0) lines.push(current);
  const estimatedLines = Math.max(1, lines.length);

  const lineH = lineHeightIn(fontPt, lineSpacing);
  const estimatedHeightIn = estimatedLines * lineH;
  const ratio = boxHeightIn > 0 ? estimatedHeightIn / boxHeightIn : Number.POSITIVE_INFINITY;

  let status = "ok";
  if (ratio > 1.0) status = "overflow";
  else if (ratio > 0.92) status = "tight";

  return {
    charsPerLine: Math.floor(usableWidthEmSafe),
    estimatedLines,
    estimatedHeightIn: Number(estimatedHeightIn.toFixed(4)),
    capacityIn: Number(boxHeightIn.toFixed(4)),
    ratio: Number(ratio.toFixed(3)),
    status,
  };
}

/**
 * Run the preflight over every card body and return a structured report.
 * Cards flagged `overflow` are a hard preflight failure; `tight` is a warning.
 */
export function preflightCards({ cards, layout, typography }) {
  const rows = cards.map((card) => {
    const boxWidthIn = layout.cardW_in - 2 * layout.bodyPad_in;
    const fit = estimateTextFit({
      text: card.body,
      boxWidthIn,
      boxHeightIn: layout.bodyH_in,
      fontPt: typography.bodyPt,
      lineSpacing: typography.bodyLine,
    });
    return { id: card.id, chars: [...card.body].length, boxWidthIn: Number(boxWidthIn.toFixed(4)), ...fit };
  });
  const overflow = rows.filter((r) => r.status === "overflow");
  const tight = rows.filter((r) => r.status === "tight");
  return {
    status: overflow.length ? "FAIL" : "PASS",
    overflow: overflow.map((r) => r.id),
    tight: tight.map((r) => r.id),
    rows,
  };
}
