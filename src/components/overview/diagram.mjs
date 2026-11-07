/**
 * Technical-route diagram: a pale panel holding native blocks, item pills,
 * arrow connectors and a feedback loop.
 *
 * The topology is data, not code: blocks, arrows and labels come from the
 * config, so a reviewer can diff the diagram edges against the source image.
 * Nothing here is a bitmap; every box, pill, connector and label is editable.
 */
import { px } from "../geometry.mjs";
import { textStyle, noLine } from "../text-style.mjs";

function addPanel(ctx, spec) {
  const { slide, theme, layers } = ctx;
  const { box } = spec;

  slide.shapes.add({
    geometry: "roundRect",
    name: "route-panel",
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: spec.fill || theme.panelFill,
    line: { style: "solid", fill: spec.border || theme.panelBorder, width: 1.25 },
    borderRadius: spec.radius ?? 14,
    shadow: theme.panelShadow,
  });
  layers.add({
    element_id: "diagram.panel",
    semantic_role: "diagram_panel",
    reference_bbox_px: null,
    target_bbox_in: [box.left, box.top, box.width, box.height],
    editability: "editable_shape",
    notes: "Independent light-green carrier panel around the route diagram.",
  });
}

/**
 * Header bar: a rounded top, a squared bottom, and centred bold white text.
 * The squaring rect is needed because preset geometry rounds all four corners.
 */
function addHeaderBar(ctx, { name, box, text, fill, textColor, fontPt, radius, layer }) {
  const { slide, typography, layers } = ctx;

  slide.shapes.add({
    geometry: "roundRect",
    name,
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill,
    line: noLine(),
    borderRadius: radius,
  });
  // Square off the bottom edge so the bar reads as a header, not a pill.
  slide.shapes.add({
    geometry: "rect",
    name: `${name}-foot`,
    position: { left: px(box.left), top: px(box.top + box.height - radius), width: px(box.width), height: px(radius) },
    fill,
    line: noLine(),
  });

  const label = slide.shapes.add({
    geometry: "textbox",
    name: `${name}-text`,
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: "none",
    line: noLine(),
  });
  label.text = text;
  label.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt,
    bold: true,
    color: textColor,
    alignment: "center",
    verticalAlignment: "middle",
    wrap: "square",
  });
  void layers;
  if (layer) {
    layers.add({
      ...layer,
      element_id: layer.element_id || name,
      target_bbox_in: [box.left, box.top, box.width, box.height],
      editability: "editable_text",
    });
  }
  return label;
}

/** One item pill: light blue fill, thin blue border, bold navy label. */
function addPill(ctx, { name, box, text, fontPt, theme, radius = 4, layer }) {
  const { slide, typography, layers } = ctx;
  const pill = slide.shapes.add({
    geometry: "roundRect",
    name,
    position: { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) },
    fill: theme.pillFill,
    line: { style: "solid", fill: theme.pillBorder, width: 0.75 },
    borderRadius: radius,
  });
  pill.text = text;
  pill.text.style = textStyle({
    typeface: typography.fontFamily,
    fontPt,
    bold: true,
    color: theme.pillTextColor,
    alignment: "center",
    verticalAlignment: "middle",
    wrap: "square",
  });
  if (layer) {
    layers.add({
      ...layer,
      element_id: layer.element_id || name,
      target_bbox_in: [box.left, box.top, box.width, box.height],
      editability: "editable_text",
    });
  }
  return pill;
}

function addInputGrid(ctx, block) {
  const { slide, theme, layers } = ctx;
  const b = block.box;
  const outer = slide.shapes.add({
    geometry: "roundRect",
    name: `block-${block.id}`,
    position: { left: px(b.left), top: px(b.top), width: px(b.width), height: px(b.height) },
    fill: theme.blockFill,
    line: { style: "solid", fill: theme.blockBorder, width: 1.25 },
    borderRadius: 6,
  });
  layers.add({
    element_id: `diagram.${block.id}.block`,
    semantic_role: "route_block",
    target_bbox_in: [b.left, b.top, b.width, b.height],
    editability: "editable_shape",
    notes: "Input block container.",
  });

  addHeaderBar(ctx, {
    name: `block-${block.id}-header`,
    box: { left: b.left + 1 / 96, top: b.top + 1 / 96, width: b.width - 2 / 96, height: block.headerH },
    text: block.title,
    fill: theme.darkBlue,
    textColor: "#FFFFFF",
    fontPt: block.titlePt,
    radius: 0.05,
    layer: {
      element_id: `diagram.${block.id}.header`,
      semantic_role: "route_block_title",
      source_text_span: block.title,
      notes: "Input block title, verbatim (multi-source data and typical scenarios).",
    },
  });

  const cols = block.columns;
  const rows = Math.ceil(block.items.length / cols);
  const availW = b.width - 2 * block.padX;
  const pillW = (availW - (cols - 1) * block.gapX) / cols;
  const startY = b.top + block.headerH + block.padTop;

  block.items.forEach((text, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    addPill(ctx, {
      name: `block-${block.id}-item-${i + 1}`,
      box: {
        left: b.left + block.padX + c * (pillW + block.gapX),
        top: startY + r * (block.pillH + block.gapY),
        width: pillW,
        height: block.pillH,
      },
      text,
      fontPt: block.itemPt,
      theme,
      radius: 4,
      layer: {
        element_id: `diagram.${block.id}.item.${i + 1}`,
        semantic_role: "route_item",
        source_text_span: text,
        notes: "Input label preserved verbatim (充电汽车 is intentional).",
      },
    });
  });

  layers.add({
    element_id: `diagram.${block.id}.items`,
    semantic_role: "route_items",
    target_bbox_in: [b.left + block.padX, startY, availW, rows * block.pillH + (rows - 1) * block.gapY],
    editability: "editable_text",
    source_text_span: `${block.items.length} input labels`,
    notes: "2x3 input pills, verbatim including 充电汽车.",
  });
  return outer;
}

function addResearchList(ctx, block) {
  const { slide, theme, layers } = ctx;
  const b = block.box;
  const outer = slide.shapes.add({
    geometry: "roundRect",
    name: `block-${block.id}`,
    position: { left: px(b.left), top: px(b.top), width: px(b.width), height: px(b.height) },
    fill: theme.blockFill,
    line: { style: "solid", fill: theme.blockBorder, width: 1.25 },
    borderRadius: 6,
  });
  layers.add({
    element_id: `diagram.${block.id}.block`,
    semantic_role: "route_block",
    target_bbox_in: [b.left, b.top, b.width, b.height],
    editability: "editable_shape",
    notes: "Research block container.",
  });

  addHeaderBar(ctx, {
    name: `block-${block.id}-header`,
    box: { left: b.left + 1 / 96, top: b.top + 1 / 96, width: b.width - 2 / 96, height: block.headerH },
    text: block.title,
    fill: theme.researchBlue,
    textColor: "#FFFFFF",
    fontPt: block.titlePt,
    radius: 0.05,
    layer: {
      element_id: `diagram.${block.id}.header`,
      semantic_role: "route_block_title",
      source_text_span: block.title,
      notes: "Research block title, verbatim.",
    },
  });

  const startY = b.top + block.headerH + block.padTop;
  const itemW = b.width - 2 * block.padX;
  block.items.forEach((text, i) => {
    addPill(ctx, {
      name: `block-${block.id}-item-${i + 1}`,
      box: { left: b.left + block.padX, top: startY + i * (block.itemH + block.gapY), width: itemW, height: block.itemH },
      text,
      fontPt: block.itemPt,
      theme,
      radius: 4,
      layer: {
        element_id: `diagram.${block.id}.item.${i + 1}`,
        semantic_role: "route_item",
        source_text_span: text,
        notes: "Research item, verbatim.",
      },
    });
  });

  layers.add({
    element_id: `diagram.${block.id}.items`,
    semantic_role: "route_items",
    target_bbox_in: [b.left + block.padX, startY, itemW, block.items.length * block.itemH + (block.items.length - 1) * block.gapY],
    editability: "editable_text",
    source_text_span: `${block.items.length} research items`,
    notes: "Research item pills, verbatim.",
  });
  return outer;
}

function addManagementGrid(ctx, block) {
  const { slide, theme, typography, layers } = ctx;
  const b = block.box;
  const outer = slide.shapes.add({
    geometry: "roundRect",
    name: `block-${block.id}`,
    position: { left: px(b.left), top: px(b.top), width: px(b.width), height: px(b.height) },
    fill: theme.blockFill,
    line: { style: "solid", fill: theme.blockBorder, width: 1.25 },
    borderRadius: 6,
  });
  layers.add({
    element_id: `diagram.${block.id}.block`,
    semantic_role: "route_block",
    target_bbox_in: [b.left, b.top, b.width, b.height],
    editability: "editable_shape",
    notes: "Management block container.",
  });

  addHeaderBar(ctx, {
    name: `block-${block.id}-header`,
    box: { left: b.left + 1 / 96, top: b.top + 1 / 96, width: b.width - 2 / 96, height: block.headerH },
    text: block.title,
    fill: theme.researchBlue,
    textColor: "#FFFFFF",
    fontPt: block.titlePt,
    radius: 0.05,
    layer: {
      element_id: `diagram.${block.id}.header`,
      semantic_role: "route_block_title",
      source_text_span: block.title,
      notes: "Management block title, verbatim.",
    },
  });

  const n = block.columns.length;
  const availW = b.width - 2 * block.padX;
  const colW = (availW - (n - 1) * block.gapX) / n;
  const colTop = b.top + block.headerH + block.padTop;

  block.columns.forEach((col, ci) => {
    const x = b.left + block.padX + ci * (colW + block.gapX);

    // Column header pill.
    addPill(ctx, {
      name: `block-${block.id}-col-${ci + 1}-header`,
      box: { left: x, top: colTop, width: colW, height: block.colHeaderH },
      text: col.header,
      fontPt: block.colHeaderPt,
      theme,
      radius: 4,
      layer: {
        element_id: `diagram.${block.id}.column.${ci + 1}.header`,
        semantic_role: "route_column_header",
        source_text_span: col.header,
        notes: "Management column header, verbatim.",
      },
    });

    col.items.forEach((text, ii) => {
      const y = colTop + block.colHeaderH + block.itemGap + ii * block.itemH;
      // Decorative diamond: matches the source diagram's bullet without adding
      // a character to the text run.
      slide.shapes.add({
        geometry: "diamond",
        name: `block-${block.id}-col-${ci + 1}-bullet-${ii + 1}`,
        position: { left: px(x + 0.04), top: px(y + block.itemH / 2 - 0.035), width: px(0.07), height: px(0.07) },
        fill: theme.accentBlue,
        line: noLine(),
      });
      const t = slide.shapes.add({
        geometry: "textbox",
        name: `block-${block.id}-col-${ci + 1}-item-${ii + 1}`,
        position: { left: px(x + 0.13), top: px(y), width: px(colW - 0.14), height: px(block.itemH) },
        fill: "none",
        line: noLine(),
      });
      t.text = text;
      t.text.style = textStyle({
        typeface: typography.fontFamily,
        fontPt: block.itemPt,
        bold: true,
        color: theme.pillTextColor,
        alignment: "left",
        verticalAlignment: "middle",
        wrap: "square",
      });
      layers.add({
        element_id: `diagram.${block.id}.column.${ci + 1}.item.${ii + 1}`,
        semantic_role: "route_item",
        target_bbox_in: [x + 0.13, y, colW - 0.14, block.itemH],
        editability: "editable_text",
        source_text_span: text,
        notes: "Management item, verbatim; the diamond is a separate decorative shape.",
      });
    });
  });

  layers.add({
    element_id: `diagram.${block.id}.columns`,
    semantic_role: "route_items",
    target_bbox_in: [b.left + block.padX, colTop, availW, block.colHeaderH + block.itemGap + 3 * block.itemH],
    editability: "editable_text",
    source_text_span: `${block.columns.length} columns, ${block.columns.reduce((a, c) => a + c.items.length, 0)} items`,
    notes: "Vertical/horizontal/evaluation columns with decorative diamond markers.",
  });
  return outer;
}

const BLOCK_RENDERERS = {
  inputGrid: addInputGrid,
  researchList: addResearchList,
  managementGrid: addManagementGrid,
};

/**
 * @param {object} ctx {slide, theme, typography, layers}
 * @param {object} spec config.diagram
 */
export function addDiagramPanel(ctx, spec) {
  const { slide, theme, typography, layers } = ctx;
  addPanel(ctx, spec.panel);

  const shapes = new Map();
  for (const block of spec.blocks) {
    const renderer = BLOCK_RENDERERS[block.kind];
    if (!renderer) throw new Error(`unknown diagram block kind "${block.kind}"`);
    shapes.set(block.id, renderer(ctx, block));
  }

  // Arrows. Two authoring modes:
  //  - `box` + `direction`: a preset arrow shape at an exact position. Used when
  //    the two blocks are not vertically aligned, so a straight connector would
  //    draw a diagonal line.
  //  - `from`/`to` + `fromSide`/`toSide`: a real connector attached to both
  //    blocks, so moving a block keeps the link attached in PowerPoint.
  for (const arrow of spec.arrows || []) {
    if (arrow.box) {
      slide.shapes.add({
        geometry: `${arrow.direction || "down"}Arrow`,
        name: `route-arrow-${arrow.id}`,
        position: {
          left: px(arrow.box.left),
          top: px(arrow.box.top),
          width: px(arrow.box.width),
          height: px(arrow.box.height),
        },
        fill: arrow.color || theme.accentBlue,
        line: noLine(),
      });
    } else {
      const from = shapes.get(arrow.from);
      const to = shapes.get(arrow.to);
      if (!from || !to) throw new Error(`arrow references an unknown block: ${arrow.from} -> ${arrow.to}`);
      slide.shapes.connect(from, to, {
        kind: "straight",
        fromSide: arrow.fromSide,
        toSide: arrow.toSide,
        line: { style: "solid", fill: arrow.color || theme.accentBlue, width: arrow.width ?? 2 },
        tail: { type: "triangle", width: "med", length: "med" },
      });
    }
    layers.add({
      element_id: `diagram.arrow.${arrow.id}`,
      semantic_role: "route_connector",
      target_bbox_in: arrow.box
        ? [arrow.box.left, arrow.box.top, arrow.box.width, arrow.box.height]
        : [0, 0, 0.001, 0.001],
      editability: "editable_shape",
      source_text_span: `${arrow.from} -> ${arrow.to} (${arrow.direction || `${arrow.fromSide} to ${arrow.toSide}`})`,
      notes: "Native route arrow; direction recorded for the topology audit.",
    });
  }

  // Connector labels (特征 / 依据 / 反馈优化).
  for (const label of spec.labels || []) {
    const t = slide.shapes.add({
      geometry: "textbox",
      name: `diagram-label-${label.name}`,
      position: {
        left: px(label.box.left),
        top: px(label.box.top),
        width: px(label.box.width),
        height: px(label.box.height),
      },
      fill: "none",
      line: noLine(),
    });
    t.text = label.text;
    t.text.style = textStyle({
      typeface: typography.fontFamily,
      fontPt: label.fontPt,
      bold: true,
      color: label.color || theme.labelColor,
      alignment: label.alignment || "center",
      verticalAlignment: "middle",
      wrap: "square",
    });
    layers.add({
      element_id: `diagram.label.${label.name}`,
      semantic_role: "route_label",
      target_bbox_in: [label.box.left, label.box.top, label.box.width, label.box.height],
      editability: "editable_text",
      source_text_span: label.text,
      notes: "Connector annotation from the source diagram.",
    });
  }

  // Feedback loop: thin native segments plus one left-pointing arrow head.
  const fb = spec.feedback;
  if (fb) {
    for (const [i, seg] of fb.segments.entries()) {
      slide.shapes.add({
        geometry: "rect",
        name: `feedback-segment-${i + 1}`,
        position: { left: px(seg.left), top: px(seg.top), width: px(seg.width), height: px(seg.height) },
        fill: theme.accentBlue,
        line: noLine(),
      });
    }
    slide.shapes.add({
      geometry: "leftArrow",
      name: "feedback-arrowhead",
      position: {
        left: px(fb.head.left),
        top: px(fb.head.top),
        width: px(fb.head.width),
        height: px(fb.head.height),
      },
      fill: theme.accentBlue,
      line: noLine(),
    });
    layers.add({
      element_id: "diagram.feedback",
      semantic_role: "route_feedback",
      target_bbox_in: [fb.segments[0].left, fb.head.top, fb.head.width + fb.segments.length, fb.head.height],
      editability: "editable_shape",
      source_text_span: fb.source_text_span || "feedback loop to the top block",
      notes: "Outer feedback path: native segments plus a native leftArrow head.",
    });
  }

  // Caption under the diagram.
  if (spec.caption) {
    const cap = slide.shapes.add({
      geometry: "textbox",
      name: "diagram-caption",
      position: {
        left: px(spec.caption.box.left),
        top: px(spec.caption.box.top),
        width: px(spec.caption.box.width),
        height: px(spec.caption.box.height),
      },
      fill: "none",
      line: noLine(),
    });
    cap.text = spec.caption.text;
    cap.text.style = textStyle({
      typeface: typography.fontFamily,
      fontPt: spec.caption.fontPt,
      bold: false,
      color: spec.caption.color || theme.captionColor,
      alignment: "center",
      verticalAlignment: "middle",
      wrap: "square",
    });
    layers.add({
      element_id: "diagram.caption",
      semantic_role: "diagram_caption",
      target_bbox_in: [spec.caption.box.left, spec.caption.box.top, spec.caption.box.width, spec.caption.box.height],
      editability: "editable_text",
      source_text_span: spec.caption.text,
      notes: "Native caption retained from the 019 source page.",
    });
  }
}
