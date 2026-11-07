/**
 * Title band: chapter name, page title and the vertical accent marker.
 *
 * The chapter and page title are native text boxes so they stay editable. The
 * marker is a native rectangle, positioned below the master's logo so the two
 * never overlap.
 */
import { px, round } from "./geometry.mjs";
import { textStyle, noLine } from "./text-style.mjs";

/**
 * @param {object} ctx {slide, theme, typography, layers}
 * @param {object} content {chapter, pageTitle}
 * @param {object} layout config layout block
 */
export function addTitleBand(ctx, content, layout) {
  const { slide, theme, typography, layers } = ctx;

  const chapter = slide.shapes.add({
    geometry: "textbox",
    name: "chapter",
    position: {
      left: px(layout.chapterLeft_in),
      top: px(layout.chapterTop_in),
      width: px(layout.chapterW_in),
      height: px(layout.chapterH_in),
    },
    fill: noLine().fill,
    line: noLine(),
  });
  chapter.text = content.chapter;
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
    reference_bbox_px: [348, 38, 670, 95],
    target_bbox_in: [layout.chapterLeft_in, layout.chapterTop_in, layout.chapterW_in, layout.chapterH_in],
    native_or_crop: "native",
    asset_path: null,
    source_text_span: "approved chapter name",
    editability: "editable_text",
    notes: "Master layout keeps the real logo and rules; chapter name is a single line.",
  });

  slide.shapes.add({
    geometry: "rect",
    name: "title-marker",
    position: {
      left: px(layout.titleMarkerLeft_in),
      top: px(layout.titleMarkerTop_in),
      width: px(layout.titleMarkerWidth_in),
      height: px(layout.titleMarkerHeight_in),
    },
    fill: theme.markerColor,
    line: noLine(),
  });
  layers.add({
    element_id: "header.title_marker",
    semantic_role: "title_marker",
    reference_bbox_px: [68, 150, 82, 205],
    target_bbox_in: [layout.titleMarkerLeft_in, layout.titleMarkerTop_in, layout.titleMarkerWidth_in, layout.titleMarkerHeight_in],
    native_or_crop: "native",
    asset_path: null,
    source_text_span: null,
    editability: "editable_shape",
    notes: "Marker sits below the master logo's lower edge to avoid a logo/title collision.",
  });

  const title = slide.shapes.add({
    geometry: "textbox",
    name: "page-title",
    position: {
      left: px(layout.pageTitleLeft_in),
      top: px(layout.pageTitleTop_in),
      width: px(layout.pageTitleW_in),
      height: px(layout.pageTitleH_in),
    },
    fill: noLine().fill,
    line: noLine(),
  });
  title.text = content.pageTitle;
  title.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.pageTitlePt,
    bold: true,
    color: theme.pageTitleColor,
    alignment: "left",
    verticalAlignment: "middle",
    wrap: "square",
  });
  layers.add({
    element_id: "header.page_title",
    semantic_role: "page_title",
    reference_bbox_px: [75, 150, 285, 205],
    target_bbox_in: [layout.pageTitleLeft_in, layout.pageTitleTop_in, layout.pageTitleW_in, layout.pageTitleH_in],
    native_or_crop: "native",
    asset_path: null,
    source_text_span: "approved page title",
    editability: "editable_text",
    notes: `Title y=${layout.pageTitleTop_in}in, below the master logo so the visual gap stays positive.`,
  });

  return { chapter, title };
}

export { round };
