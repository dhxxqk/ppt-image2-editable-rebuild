/**
 * Milestone card: body, gradient title band, icon disc, icon crop, text and
 * the small V-shaped pointer that connects the card to the timeline.
 *
 * Text and geometry come from the caller; this module never reads a business
 * document or a private path by itself.
 */
import { px } from "./geometry.mjs";
import { textStyle, noLine } from "./text-style.mjs";

function cardHeaderPath(widthPx, heightPx, radiusPx = 10) {
  return [
    { moveTo: { x: radiusPx, y: 0 } },
    { lineTo: { x: widthPx - radiusPx, y: 0 } },
    { quadBezTo: { x1: widthPx, y1: 0, x: widthPx, y: radiusPx } },
    { lineTo: { x: widthPx, y: heightPx } },
    { lineTo: { x: 0, y: heightPx } },
    { lineTo: { x: 0, y: radiusPx } },
    { quadBezTo: { x1: 0, y1: 0, x: radiusPx, y: 0 } },
    { close: {} },
  ];
}

/**
 * @param {object} ctx {slide, theme, typography, layers}
 * @param {object} card {id,title,date,body,icon}
 * @param {object} geom {left_in,width_in,center_in}
 * @param {object} stack computed card stack (see geometry.computeCardStack)
 * @param {Buffer|null} iconBuffer PNG bytes for the local icon crop
 */
export function addMilestoneCard(ctx, card, geom, stack, iconBuffer) {
  const { slide, theme, typography, layers } = ctx;
  const left = geom.left_in;
  const cardW = geom.width_in;
  const centerX = geom.center_in;

  slide.shapes.add({
    geometry: "roundRect",
    name: `card-${card.id}`,
    position: { left: px(left), top: px(stack.cardTop), width: px(cardW), height: px(stack.cardH) },
    fill: theme.cardFill,
    line: { style: "solid", fill: theme.cardBorder, width: theme.cardBorderWidth },
    borderRadius: theme.cardRadius,
    shadow: theme.cardShadow,
  });
  layers.add({
    element_id: `card.${card.id}.body`,
    semantic_role: "milestone_card",
    reference_bbox_px: card.reference?.card_px ?? null,
    target_bbox_in: [left, stack.cardTop, cardW, stack.cardH],
    editability: "editable_shape",
    notes: `Card ${cardW}in wide; white fill, thin border, soft native shadow.`,
  });

  const headerW = px(cardW) - 2;
  const headerH = px(stack.headerH);
  const header = slide.shapes.add({
    geometry: "custom",
    name: `card-${card.id}-header`,
    position: { left: px(left) + 1, top: px(stack.cardTop) + 1, width: headerW, height: headerH },
    fill: theme.headerFill,
    line: noLine(),
    customPaths: [{ width: headerW, height: headerH, commands: cardHeaderPath(headerW, headerH, theme.cardRadius) }],
  });
  header.text = card.title;
  header.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.cardTitlePt,
    bold: true,
    color: theme.headerTextColor,
    alignment: "center",
    verticalAlignment: "middle",
    wrap: "square",
  });
  layers.add({
    element_id: `card.${card.id}.header`,
    semantic_role: "card_title_band",
    reference_bbox_px: card.reference?.header_px ?? null,
    target_bbox_in: [left, stack.cardTop, cardW, stack.headerH],
    editability: "editable_text",
    source_text_span: card.source?.title_span ?? null,
    notes: "Short title is a same-meaning excerpt of the source sentence.",
  });

  slide.shapes.add({
    geometry: "ellipse",
    name: `card-${card.id}-icon-disc`,
    position: {
      left: px(centerX - stack.iconDiscD / 2),
      top: px(stack.iconDiscTop),
      width: px(stack.iconDiscD),
      height: px(stack.iconDiscD),
    },
    fill: theme.discFill,
    line: noLine(),
  });
  layers.add({
    element_id: `card.${card.id}.icon_disc`,
    semantic_role: "icon_backplate",
    reference_bbox_px: card.reference?.disc_px ?? null,
    target_bbox_in: [centerX - stack.iconDiscD / 2, stack.iconDiscTop, stack.iconDiscD, stack.iconDiscD],
    editability: "editable_shape",
    confidence: "medium",
    notes: "Pale disc is a native ellipse, not part of the cropped icon.",
  });

  if (iconBuffer) {
    slide.images.add({
      blob: iconBuffer.buffer.slice(iconBuffer.byteOffset, iconBuffer.byteOffset + iconBuffer.byteLength),
      contentType: "image/png",
      alt: `${card.id} ${card.title} linear icon`,
      fit: "contain",
      position: {
        left: px(centerX - stack.iconW / 2),
        top: px(stack.iconTop),
        width: px(stack.iconW),
        height: px(stack.iconH),
      },
    });
    layers.add({
      element_id: `card.${card.id}.icon`,
      semantic_role: "linear_icon",
      reference_bbox_px: card.reference?.icon_px ?? null,
      target_bbox_in: [centerX - stack.iconW / 2, stack.iconTop, stack.iconW, stack.iconH],
      native_or_crop: "crop",
      asset_path: card.icon?.path ?? null,
      editability: "local_image",
      notes: "Local crop with transparency; the disc behind it is native.",
    });
  }

  const bodyW = cardW - 2 * stack.bodyPad;
  const body = slide.shapes.add({
    geometry: "textbox",
    name: `card-${card.id}-body`,
    position: {
      left: px(left + stack.bodyPad),
      top: px(stack.bodyTop),
      width: px(bodyW),
      height: px(stack.bodyH),
    },
    fill: noLine().fill,
    line: noLine(),
  });
  body.text = card.body;
  body.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt: typography.bodyPt,
    color: theme.bodyTextColor,
    alignment: "left",
    verticalAlignment: "top",
    lineSpacing: typography.bodyLine,
    wrap: "square",
  });
  layers.add({
    element_id: `card.${card.id}.text`,
    semantic_role: "milestone_description",
    reference_bbox_px: card.reference?.text_px ?? null,
    target_bbox_in: [left + stack.bodyPad, stack.bodyTop, bodyW, stack.bodyH],
    editability: "editable_text",
    source_text_span: card.source?.body_span ?? null,
    notes: `Body ${typography.bodyPt}pt, line spacing ${typography.bodyLine}; natural wrapping, no manual breaks.`,
  });

  const tailW = stack.tailW;
  const tailH = stack.tailH;
  slide.shapes.add({
    geometry: "custom",
    name: `card-${card.id}-tail`,
    position: { left: px(centerX - tailW / 2), top: px(stack.tailTop), width: px(tailW), height: px(tailH) },
    fill: theme.tailFill,
    line: { style: "solid", fill: theme.tailBorder, width: 1 },
    customPaths: [
      {
        width: px(tailW),
        height: px(tailH),
        commands: [
          { moveTo: { x: 0, y: 0 } },
          { lineTo: { x: px(tailW / 2), y: px(tailH) } },
          { lineTo: { x: px(tailW), y: 0 } },
        ],
      },
    ],
  });
  layers.add({
    element_id: `card.${card.id}.tail`,
    semantic_role: "card_pointer",
    reference_bbox_px: card.reference?.tail_px ?? null,
    target_bbox_in: [centerX - tailW / 2, stack.tailTop, tailW, tailH],
    editability: "editable_shape",
    confidence: "medium",
    notes: "Open path: strokes the two sides only, so the card joins the timeline continuously.",
  });

  return { body };
}
