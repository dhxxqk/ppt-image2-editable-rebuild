/**
 * P02 overview layout: left information column + right technical-route panel.
 *
 * The two-column split is the page structure; the pieces (title pill, lead box,
 * research cards, diagram panel) are independent components so a similar page
 * can reuse one of them without inheriting the rest.
 */
import { px } from "../components/geometry.mjs";
import { textStyle, noLine } from "../components/text-style.mjs";
import { addTitlePill, addLeadBox, addResearchCard } from "../components/overview/page.mjs";
import { addDiagramPanel } from "../components/overview/diagram.mjs";

function addChapter(ctx, config) {
  const { slide, theme, typography, layers } = ctx;
  const box = config.overview.chapter.box;

  const chapter = slide.shapes.add({
    geometry: "textbox",
    name: "chapter",
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: "none",
    line: noLine(),
  });
  chapter.text = config.header.chapter;
  chapter.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.chapterPt,
    bold: true,
    color: theme.chapterColor,
    alignment: "left",
    verticalAlignment: "middle",
    wrap: "square",
  });
  layers.add({
    element_id: "header.chapter",
    semantic_role: "chapter_name",
    reference_bbox_px: null,
    target_bbox_in: [box.left, box.top, box.width, box.height],
    editability: "editable_text",
    source_text_span: config.header.chapter,
    notes: "Chapter name kept at the 019 position and size.",
  });
}

/**
 * @param {object} ctx {slide, theme, typography, layers}
 * @param {object} config validated rebuild config with an `overview` block
 */
export function buildOverviewSlide(ctx, config) {
  const ov = config.overview;
  addChapter(ctx, config);

  addTitlePill(ctx, {
    box: ov.titlePill.box,
    text: config.header.pageTitle,
    reference_bbox_px: ov.titlePill.reference_bbox_px,
    source_span: config.header.pageTitle,
  });

  addLeadBox(ctx, {
    box: ov.lead.box,
    textBox: ov.lead.textBox,
    runs: ov.lead.runs,
    fontPt: ov.lead.fontPt,
    lineSpacing: ov.lead.lineSpacing,
    reference_bbox_px: ov.lead.reference_bbox_px,
    source_text_span: ov.lead.source_text_span,
  });

  for (const [i, card] of ov.cards.entries()) {
    addResearchCard(ctx, {
      box: card.box,
      textBox: card.textBox,
      iconBandWidth: ov.iconBandWidth,
      icon: card.icon,
      runs: card.runs,
      fontPt: ov.cardFontPt,
      lineSpacing: ov.cardLineSpacing,
      reference_bbox_px: card.reference_bbox_px,
      source_text_span: card.source_text_span,
      index: i + 1,
    });
  }

  addDiagramPanel(ctx, ov.diagram);
  return { layout: { template: "overview-two-column" } };
}
