/**
 * Shared text-style helper.
 *
 * The engine expects CSS pixels for `fontSize`; callers pass points and this
 * module performs the conversion exactly once, in one place.
 */
import { ptToPx } from "../typography/units.mjs";

/**
 * Build an engine text style object.
 * @param {object} spec {fontPt, bold, color, alignment, verticalAlignment,
 *   lineSpacing, insets, wrap, autoFit, typeface}
 */
export function textStyle(spec) {
  const style = {
    typeface: spec.typeface,
    fontSize: ptToPx(spec.fontPt),
    color: spec.color,
    alignment: spec.alignment ?? "left",
    verticalAlignment: spec.verticalAlignment ?? "top",
    insets: spec.insets ?? 0,
    autoFit: spec.autoFit ?? "none",
  };
  // Only emit `wrap` when the caller asks for it: shapes whose text is a
  // single centered token (node numbers, date pills) keep the engine default.
  if (spec.wrap !== undefined) style.wrap = spec.wrap;
  if (spec.bold !== undefined) style.bold = spec.bold;
  if (spec.lineSpacing !== undefined) style.lineSpacing = spec.lineSpacing;
  return style;
}

/** A borderless, unfilled shape container (text box or decorative shape). */
export function noLine() {
  return { style: "solid", fill: "none", width: 0 };
}

export function noFill() {
  return "none";
}
