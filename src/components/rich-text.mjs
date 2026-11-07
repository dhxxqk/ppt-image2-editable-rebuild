/**
 * Rich text with explicit bold spans.
 *
 * The source deck marks emphasis at run level. Collapsing a paragraph to plain
 * text loses that emphasis, so every text block here is authored as an ordered
 * run list: `[{ text, bold }]`. The concatenation is the verbatim source string.
 */
import { px } from "./geometry.mjs";
import { ptToPx } from "../typography/units.mjs";

/**
 * Validate that a run list is well formed and preserves the source string.
 * Throws on an empty run, a missing text field, or a span that does not match.
 */
export function assertRuns(runs, expectedText, label = "text") {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error(`${label}: runs must be a non-empty array`);
  let joined = "";
  for (const [i, run] of runs.entries()) {
    if (typeof run?.text !== "string" || run.text.length === 0) throw new Error(`${label}: run ${i} has no text`);
    if (typeof run.bold !== "boolean") throw new Error(`${label}: run ${i} must declare bold true/false`);
    joined += run.text;
  }
  if (expectedText !== undefined && joined !== expectedText) {
    throw new Error(`${label}: runs concatenate to a different string than the source text`);
  }
  return joined;
}

/** Plain string of a run list. */
export function runsToText(runs) {
  return runs.map((r) => r.text).join("");
}

/** Bold substrings of a run list, in order. */
export function runsToBoldSpans(runs) {
  return runs.filter((r) => r.bold).map((r) => r.text);
}

/**
 * Add a text box whose runs carry their own bold flag.
 *
 * @param {object} ctx {slide, theme, typography, layers}
 * @param {object} spec {name, runs, box:{left,top,width,height}, style:{fontPt,color,alignment,
 *   verticalAlignment,lineSpacing,insets,wrap,typeface,bold}, layer:{...}}
 */
export function addRichText(ctx, spec) {
  const { slide, theme, typography, layers } = ctx;
  const { name, runs, box } = spec;
  if (!box) throw new Error(`${name}: box is required`);

  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });

  shape.text.set([
    runs.map((r) => ({
      run: r.text,
      style: {
        bold: r.bold,
        // Re-state the typeface per run: OOXML then carries latin/ea/cs on the
        // run itself instead of relying on inheritance.
        typeface: spec.style?.typeface || typography.fontFamily,
      },
    })),
  ]);

  shape.text.style = {
    typeface: spec.style?.typeface || typography.fontFamily,
    fontSize: ptToPx(spec.style?.fontPt ?? typography.bodyPt),
    color: spec.style?.color ?? theme.bodyTextColor,
    alignment: spec.style?.alignment ?? "left",
    verticalAlignment: spec.style?.verticalAlignment ?? "top",
    insets: spec.style?.insets ?? 0,
    autoFit: "none",
    ...(spec.style?.wrap === undefined ? {} : { wrap: spec.style.wrap }),
    ...(spec.style?.lineSpacing === undefined ? {} : { lineSpacing: spec.style.lineSpacing }),
  };

  if (spec.layer) {
    layers.add({
      ...spec.layer,
      element_id: spec.layer.element_id || name,
      target_bbox_in: [box.left, box.top, box.width, box.height],
      editability: "editable_text",
    });
  }
  return shape;
}
