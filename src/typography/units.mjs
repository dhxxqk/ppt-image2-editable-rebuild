/**
 * Unit conversion between real typographic points and the engine's CSS pixels.
 *
 * The engine's `fontSize` is CSS px, not points: a 11pt body must be sent as
 * 11 * 96 / 72 = 14.667. Getting this wrong silently shrinks every run by 25%.
 */
export const CSS_PX_PER_IN = 96;
export const PT_PER_IN = 72;

/** points -> CSS px (engine fontSize units). */
export function ptToPx(pt) {
  return (pt * CSS_PX_PER_IN) / PT_PER_IN;
}

/** CSS px -> points. */
export function pxToPt(px) {
  return (px * PT_PER_IN) / CSS_PX_PER_IN;
}

/** points -> inches. */
export function ptToIn(pt) {
  return pt / PT_PER_IN;
}

/** inches -> points. */
export function inToPt(inches) {
  return inches * PT_PER_IN;
}

/**
 * Line height in inches for a font size and a line-spacing multiplier.
 * The multiplier follows the CSS/engine convention (1.0 = font size).
 */
export function lineHeightIn(pt, multiplier = 1) {
  return (pt * multiplier) / PT_PER_IN;
}

/** Keep a stable number of decimals for manifests and logs. */
export function roundPx(v, n = 3) {
  return Number(v.toFixed(n));
}
