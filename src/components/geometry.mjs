/**
 * Geometry for the milestone-timeline component set.
 *
 * Every number comes from the config `layout` block; this module only turns
 * the six-card distribution into concrete rectangles. Nothing here knows what
 * the slide says.
 */
export const IN_PER_PX96 = 1 / 96;

/** inches -> engine coordinates (the engine's geometry units are 96 dpi px). */
export function px(inches) {
  return inches * 96;
}

export function round(v, n = 4) {
  return Number(v.toFixed(n));
}

/**
 * Compute the horizontal rhythm of N cards from slide width, margins and gaps.
 * Cards share the remaining width equally.
 */
export function computeCards(slideWidthIn, layout, count) {
  const margin = layout.margin_in;
  const gap = layout.gap_in;
  const totalGap = gap * (count - 1);
  const cardW = (slideWidthIn - 2 * margin - totalGap) / count;
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const left = margin + i * (cardW + gap);
    cards.push({
      index: i,
      left_in: left,
      width_in: cardW,
      center_in: left + cardW / 2,
    });
  }
  return { margin, gap, cardW, cards };
}

/**
 * Derived vertical anchors for the card column: icon disc, body, tail.
 * Kept separate from the card builder so a different page type can reuse the
 * arithmetic without inheriting the milestone card visuals.
 */
export function computeCardStack(layout) {
  const cardBottom = layout.cardTop_in + layout.cardH_in;
  return {
    cardTop: layout.cardTop_in,
    cardH: layout.cardH_in,
    cardBottom: round(cardBottom),
    headerH: layout.headerH_in,
    iconDiscTop: layout.iconDiscTop_in,
    iconDiscD: layout.iconDiscD_in,
    iconTop: layout.iconTop_in,
    iconW: layout.iconW_in,
    iconH: layout.iconH_in,
    bodyTop: layout.bodyTop_in,
    bodyH: layout.bodyH_in,
    bodyPad: layout.bodyPad_in,
    tailTop: layout.tailTop_in,
    tailH: layout.tailH_in,
    tailW: layout.tailW_in,
  };
}

/**
 * Timeline band: a pale track, a solid shaft and a custom triangular head.
 * The head overlaps the shaft by `arrowOverlap_in` so no seam appears.
 */
export function computeTimeline(layout) {
  const trackTop = layout.trackTop_in;
  const trackH = layout.trackH_in;
  const headH = layout.arrowH_in;
  const headTop = trackTop + trackH / 2 - headH / 2;
  return {
    track: { left_in: layout.trackLeft_in, top_in: trackTop, width_in: layout.trackW_in, height_in: trackH, radius: trackH / 2 },
    shaft: { left_in: layout.shaftLeft_in, top_in: layout.shaftTop_in, width_in: layout.shaftW_in, height_in: layout.shaftH_in },
    head: { left_in: layout.arrowLeft_in, top_in: round(headTop), width_in: layout.arrowW_in, height_in: headH },
    nodeTop: layout.nodeTop_in,
    nodeD: layout.nodeD_in,
    dateTop: layout.dateTop_in,
    dateH: layout.dateH_in,
    dateW: layout.dateW_in,
  };
}
