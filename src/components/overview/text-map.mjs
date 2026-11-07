/**
 * Single source of truth for every text element on an overview page.
 *
 * The builders and the content QA both read this map, so a renamed shape or a
 * dropped label shows up as a QA failure instead of drifting silently.
 */

function boldSpans(runs) {
  return runs.filter((r) => r.bold).map((r) => r.text);
}

/**
 * @returns {Array<{shape:string, element_id?:string, role:string, text:string,
 *   bold_spans:string[]|null}>} `bold_spans: null` means the source has no
 *   run-level emphasis to compare (text embedded in the source image).
 */
export function overviewTextMap(config) {
  const ov = config.overview;
  const out = [];

  out.push({
    shape: "chapter",
    element_id: "header.chapter",
    role: "chapter",
    text: config.header.chapter,
    bold_spans: [config.header.chapter],
  });
  out.push({
    shape: "page-title",
    element_id: "header.page_title_text",
    role: "page_title",
    text: config.header.pageTitle,
    bold_spans: [config.header.pageTitle],
  });
  out.push({
    shape: "lead-text",
    element_id: "lead.text",
    role: "lead",
    text: ov.lead.text,
    bold_spans: boldSpans(ov.lead.runs),
  });

  ov.cards.forEach((card, i) => {
    out.push({
      shape: `research-text-${i + 1}`,
      element_id: `research.${i + 1}.text`,
      role: `research_${i + 1}`,
      text: card.text,
      bold_spans: boldSpans(card.runs),
    });
  });

  for (const block of ov.diagram.blocks) {
    out.push({
      shape: `block-${block.id}-header-text`,
      element_id: `diagram.${block.id}.header`,
      role: `block_title_${block.id}`,
      text: block.title,
      bold_spans: null,
    });
    if (block.kind === "managementGrid") {
      block.columns.forEach((col, ci) => {
        out.push({
          shape: `block-${block.id}-col-${ci + 1}-header`,
          role: `column_header_${block.id}_${ci + 1}`,
          text: col.header,
          bold_spans: null,
        });
        col.items.forEach((text, ii) => {
          out.push({
            shape: `block-${block.id}-col-${ci + 1}-item-${ii + 1}`,
            role: `column_item_${block.id}_${ci + 1}_${ii + 1}`,
            text,
            bold_spans: null,
          });
        });
      });
    } else {
      block.items.forEach((text, i) => {
        out.push({
          shape: `block-${block.id}-item-${i + 1}`,
          role: `block_item_${block.id}_${i + 1}`,
          text,
          bold_spans: null,
        });
      });
    }
  }

  for (const label of ov.diagram.labels || []) {
    out.push({
      shape: `diagram-label-${label.name}`,
      role: `route_label_${label.name}`,
      text: label.text,
      bold_spans: null,
    });
  }

  out.push({
    shape: "diagram-caption",
    role: "diagram_caption",
    text: ov.diagram.caption.text,
    bold_spans: null,
  });

  return out;
}
