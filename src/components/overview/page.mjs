/**
 * P02-style overview page: title pill, lead paragraph, three research cards.
 *
 * Everything is native. The only decorative shapes are the small white line
 * glyphs inside the green icon bands, drawn from primitives so they stay
 * editable and resolution independent.
 */
import { px } from "../geometry.mjs";
import { textStyle, noLine } from "../text-style.mjs";
import { addRichText } from "../rich-text.mjs";

/** Dark green gradient title pill with a light inner edge. */
export function addTitlePill(ctx, spec) {
  const { slide, theme, typography, layers } = ctx;
  const { box, text } = spec;

  slide.shapes.add({
    geometry: "roundRect",
    name: "page-title-pill",
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: theme.titlePillFill,
    line: { style: "solid", fill: theme.titlePillBorder, width: 1.5 },
    borderRadius: px(box.height / 2),
    shadow: theme.titlePillShadow,
  });
  layers.add({
    element_id: "header.page_title",
    semantic_role: "page_title_pill",
    reference_bbox_px: spec.reference_bbox_px ?? null,
    target_bbox_in: [box.left, box.top, box.width, box.height],
    editability: "editable_shape",
    notes: "Symmetric rounded pill kept at the 019 position; gradient and edge follow the approved visual.",
  });

  const label = slide.shapes.add({
    geometry: "textbox",
    name: "page-title",
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: "none",
    line: noLine(),
  });
  label.text = text;
  label.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.pageTitlePt,
    bold: true,
    color: theme.titlePillTextColor,
    alignment: "center",
    verticalAlignment: "middle",
    wrap: "square",
  });
  layers.add({
    element_id: "header.page_title_text",
    semantic_role: "page_title",
    reference_bbox_px: spec.reference_bbox_px ?? null,
    target_bbox_in: [box.left, box.top, box.width, box.height],
    editability: "editable_text",
    source_text_span: spec.source_span ?? null,
    notes: "Page title, verbatim from the 019 source slide.",
  });
  return label;
}

/** Lead paragraph inside a pale green rounded box. */
export function addLeadBox(ctx, spec) {
  const { slide, theme, layers } = ctx;
  const { box, textBox, runs } = spec;

  slide.shapes.add({
    geometry: "roundRect",
    name: "lead-box",
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: theme.leadFill,
    line: { style: "solid", fill: theme.leadBorder, width: 1 },
    borderRadius: theme.cardRadius,
    shadow: theme.cardShadow,
  });
  layers.add({
    element_id: "lead.box",
    semantic_role: "lead_box",
    reference_bbox_px: spec.reference_bbox_px ?? null,
    target_bbox_in: [box.left, box.top, box.width, box.height],
    editability: "editable_shape",
    confidence: "high",
    notes: "Pale green information box behind the lead paragraph.",
  });

  return addRichText(ctx, {
    name: "lead-text",
    runs,
    box: textBox,
    style: {
      fontPt: spec.fontPt,
      color: theme.bodyTextColor,
      alignment: "left",
      verticalAlignment: "top",
      lineSpacing: spec.lineSpacing,
      wrap: "square",
      insets: 0,
    },
    layer: {
      element_id: "lead.text",
      semantic_role: "lead_paragraph",
      reference_bbox_px: spec.reference_bbox_px ?? null,
      source_text_span: spec.source_text_span ?? null,
      notes: `Lead paragraph ${spec.fontPt}pt with source bold spans preserved at run level.`,
    },
  });
}

const GLYPH_DRAWERS = {
  /** Three ascending bars, a lightweight "analysis" mark. */
  chart(ctx, box, color) {
    const { slide } = ctx;
    const baseY = box.top + box.height;
    const widths = [0.10, 0.10, 0.10];
    const heights = [0.20, 0.30, 0.40];
    widths.forEach((w, i) => {
      slide.shapes.add({
        geometry: "roundRect",
        name: `glyph-bar-${i}`,
        position: {
          left: px(box.left + i * 0.15),
          top: px(baseY - heights[i]),
          width: px(w),
          height: px(heights[i]),
        },
        fill: color,
        line: noLine(),
        borderRadius: 2,
      });
    });
  },

  /** Three stacked slabs, a lightweight "layers" mark. */
  layers(ctx, box, color) {
    const { slide } = ctx;
    [0, 1, 2].forEach((i) => {
      slide.shapes.add({
        geometry: "roundRect",
        name: `glyph-layer-${i}`,
        position: {
          left: px(box.left + i * 0.02),
          top: px(box.top + i * 0.16),
          width: px(box.width - i * 0.04),
          height: px(0.09),
        },
        fill: color,
        line: noLine(),
        borderRadius: 3,
      });
    });
  },

  /** Three linked nodes, a lightweight "coordination" mark. */
  network(ctx, box, color) {
    const { slide } = ctx;
    const cx = box.left + box.width / 2;
    const top = { x: cx, y: box.top + 0.08 };
    const left = { x: box.left + 0.08, y: box.top + box.height - 0.08 };
    const right = { x: box.left + box.width - 0.08, y: box.top + box.height - 0.08 };
    const link = (a, b) => {
      slide.shapes.add({
        geometry: "connector",
        name: `glyph-link-${a.x.toFixed(2)}-${b.x.toFixed(2)}`,
        kind: "straight",
        position: {
          left: px(Math.min(a.x, b.x)),
          top: px(Math.min(a.y, b.y)),
          width: px(Math.abs(b.x - a.x)),
          height: px(Math.abs(b.y - a.y)),
        },
        line: { style: "solid", fill: color, width: 1.5 },
        flipV: a.y > b.y,
      });
    };
    link(top, left);
    link(top, right);
    for (const [name, p] of Object.entries({ top, left, right })) {
      slide.shapes.add({
        geometry: "ellipse",
        name: `glyph-node-${name}`,
        position: { left: px(p.x - 0.06), top: px(p.y - 0.06), width: px(0.12), height: px(0.12) },
        fill: color,
        line: noLine(),
      });
    }
  },
};

/** Draw a decorative glyph inside the icon band. Never contains text. */
export function addIconGlyph(ctx, kind, box, color) {
  const drawer = GLYPH_DRAWERS[kind];
  if (!drawer) throw new Error(`unknown icon glyph "${kind}"`);
  drawer(ctx, box, color);
}

/** One research card: card body, green icon band, glyph, rich text. */
export function addResearchCard(ctx, spec) {
  const { slide, theme, typography, layers } = ctx;
  const { box, textBox, runs, icon, index } = spec;

  slide.shapes.add({
    geometry: "roundRect",
    name: `research-card-${index}`,
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: theme.cardFill,
    line: { style: "solid", fill: theme.cardBorder, width: 1 },
    borderRadius: theme.cardRadius,
    shadow: theme.cardShadow,
  });
  layers.add({
    element_id: `research.${index}.card`,
    semantic_role: "research_card",
    reference_bbox_px: spec.reference_bbox_px ?? null,
    target_bbox_in: [box.left, box.top, box.width, box.height],
    editability: "editable_shape",
    notes: "Native rounded card with soft shadow.",
  });

  const bandW = spec.iconBandWidth;
  slide.shapes.add({
    geometry: "roundRect",
    name: `research-icon-band-${index}`,
    position: { left: px(box.left), top: px(box.top), width: px(bandW), height: px(box.height) },
    fill: theme.iconBandFill,
    line: noLine(),
    borderRadius: theme.cardRadius,
  });
  // Square the band's right edge so it reads as part of the card, not a pill.
  slide.shapes.add({
    geometry: "rect",
    name: `research-icon-band-${index}-edge`,
    position: {
      left: px(box.left + bandW - theme.cardRadius / 96),
      top: px(box.top),
      width: px(theme.cardRadius / 96),
      height: px(box.height),
    },
    fill: theme.iconBandFill,
    line: noLine(),
  });
  layers.add({
    element_id: `research.${index}.icon_band`,
    semantic_role: "icon_band",
    reference_bbox_px: null,
    target_bbox_in: [box.left, box.top, bandW, box.height],
    editability: "editable_shape",
    confidence: "medium",
    notes: "Dark green band carrying the decorative glyph; part of the approved visual language.",
  });

  if (icon) {
    addIconGlyph(ctx, icon, { left: box.left + bandW / 2 - 0.19, top: box.top + box.height / 2 - 0.22, width: 0.38, height: 0.44 }, theme.iconGlyphColor);
    layers.add({
      element_id: `research.${index}.glyph`,
      semantic_role: "decorative_glyph",
      reference_bbox_px: null,
      target_bbox_in: [box.left, box.top, bandW, box.height],
      editability: "editable_shape",
      confidence: "low",
      notes: "Decorative only: the band is a native shape, so this is editable and carries no text.",
    });
  }

  addRichText(ctx, {
    name: `research-text-${index}`,
    runs,
    box: textBox,
    style: {
      fontPt: spec.fontPt,
      color: theme.bodyTextColor,
      alignment: "left",
      verticalAlignment: "middle",
      lineSpacing: spec.lineSpacing,
      wrap: "square",
      insets: 0,
    },
    layer: {
      element_id: `research.${index}.text`,
      semantic_role: "research_description",
      reference_bbox_px: spec.reference_bbox_px ?? null,
      source_text_span: spec.source_text_span ?? null,
      notes: `Research direction ${index}; verbatim source text with original bold spans.`,
    },
  });
}
