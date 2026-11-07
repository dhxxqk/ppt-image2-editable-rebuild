/**
 * Milestone timeline: track, shaft, arrow head, nodes and date pills.
 *
 * The head is a custom path rather than a rotated triangle: rotation on a
 * triangle produced an `invalid int32` export error in the validated engine
 * version, and the custom path is still a native editable shape.
 */
import { px } from "./geometry.mjs";
import { textStyle, noLine } from "./text-style.mjs";

/** Pale rounded track + solid shaft + arrow head, drawn behind the cards. */
export function addTimelineBand(ctx, timeline) {
  const { slide, theme, layers } = ctx;

  slide.shapes.add({
    geometry: "roundRect",
    name: "timeline-track",
    position: {
      left: px(timeline.track.left_in),
      top: px(timeline.track.top_in),
      width: px(timeline.track.width_in),
      height: px(timeline.track.height_in),
    },
    fill: theme.trackFill,
    line: noLine(),
    borderRadius: px(timeline.track.radius),
  });
  layers.add({
    element_id: "timeline.track",
    semantic_role: "timeline_track",
    reference_bbox_px: [84, 690, 1640, 725],
    target_bbox_in: [timeline.track.left_in, timeline.track.top_in, timeline.track.width_in, timeline.track.height_in],
    editability: "editable_shape",
    notes: "Expresses time progression only; it does not encode completion status.",
  });

  slide.shapes.add({
    geometry: "rect",
    name: "timeline-shaft",
    position: {
      left: px(timeline.shaft.left_in),
      top: px(timeline.shaft.top_in),
      width: px(timeline.shaft.width_in),
      height: px(timeline.shaft.height_in),
    },
    fill: theme.shaftFill,
    line: noLine(),
  });
  layers.add({
    element_id: "timeline.shaft",
    semantic_role: "timeline_arrow_shaft",
    reference_bbox_px: [120, 692, 1608, 722],
    target_bbox_in: [timeline.shaft.left_in, timeline.shaft.top_in, timeline.shaft.width_in, timeline.shaft.height_in],
    editability: "editable_shape",
    notes: "Single-direction time arrow; overlaps the head so no seam appears.",
  });

  const { width_in: w, height_in: h } = timeline.head;
  slide.shapes.add({
    geometry: "custom",
    name: "timeline-arrowhead",
    position: {
      left: px(timeline.head.left_in),
      top: px(timeline.head.top_in),
      width: px(w),
      height: px(h),
    },
    fill: theme.arrowFill,
    line: noLine(),
    customPaths: [
      {
        width: px(w),
        height: px(h),
        commands: [
          { moveTo: { x: 0, y: 0 } },
          { lineTo: { x: px(w), y: px(h / 2) } },
          { lineTo: { x: 0, y: px(h) } },
          { close: {} },
        ],
      },
    ],
  });
  layers.add({
    element_id: "timeline.arrowhead",
    semantic_role: "timeline_arrowhead",
    reference_bbox_px: [1608, 686, 1660, 730],
    target_bbox_in: [timeline.head.left_in, timeline.head.top_in, w, h],
    editability: "editable_shape",
    notes: "Custom triangle path avoids the engine's rotation export defect; still native.",
  });
}

/** Circle node with the two-digit sequence number. */
export function addTimelineNode(ctx, card, centerX, timeline) {
  const { slide, theme, typography, layers } = ctx;
  const d = timeline.nodeD;
  const left = centerX - d / 2;

  const node = slide.shapes.add({
    geometry: "ellipse",
    name: `node-${card.id}`,
    position: { left: px(left), top: px(timeline.nodeTop), width: px(d), height: px(d) },
    fill: theme.nodeFill,
    line: { style: "solid", fill: theme.nodeBorder, width: theme.nodeBorderWidth },
  });
  node.text = card.id;
  node.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.nodeNoPt,
    bold: true,
    color: theme.nodeNumberColor,
    alignment: "center",
    verticalAlignment: "middle",
  });
  layers.add({
    element_id: `node.${card.id}.circle`,
    semantic_role: "timeline_node",
    reference_bbox_px: [Math.round(centerX) - 30, 678, Math.round(centerX) + 30, 742],
    target_bbox_in: [left, timeline.nodeTop, d, d],
    editability: "editable_text",
    source_text_span: `sequence=${card.id}`,
    notes: "The number expresses order only, not completion status.",
  });
  return node;
}

/** Rounded date pill under the node. */
export function addDatePill(ctx, card, centerX, timeline) {
  const { slide, theme, typography, layers } = ctx;
  const w = timeline.dateW;
  const left = centerX - w / 2;

  const pill = slide.shapes.add({
    geometry: "roundRect",
    name: `date-${card.id}`,
    position: { left: px(left), top: px(timeline.dateTop), width: px(w), height: px(timeline.dateH) },
    fill: theme.pillFill,
    line: { style: "solid", fill: theme.pillBorder, width: theme.pillBorderWidth },
    borderRadius: theme.pillRadius,
    shadow: theme.pillShadow,
  });
  pill.text = card.date;
  pill.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.datePt,
    bold: true,
    color: theme.pillColor,
    alignment: "center",
    verticalAlignment: "middle",
  });
  layers.add({
    element_id: `date.${card.id}.pill`,
    semantic_role: "date_pill",
    reference_bbox_px: card.reference?.date_px ?? null,
    target_bbox_in: [left, timeline.dateTop, w, timeline.dateH],
    editability: "editable_text",
    source_text_span: card.source?.date_span ?? null,
    notes: card.note ? card.note : "Date matches the source slide.",
  });
  return pill;
}
