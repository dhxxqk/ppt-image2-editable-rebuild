/**
 * Minimal layer recorder.
 *
 * Every visual element added to the slide is registered with the same fields
 * the private layer manifest uses, so structure, editability and provenance can
 * be audited after the build without re-parsing the PPTX.
 */
export class LayerRecorder {
  constructor() {
    this.layers = [];
    this.z = 0;
  }

  nextZ() {
    return this.z++;
  }

  /**
   * @param {object} entry element_id, semantic_role, reference_bbox_px,
   *   target_bbox_in, z_index, native_or_crop, asset_path, source_text_span,
   *   editability, confidence, notes
   */
  add(entry) {
    if (!entry.element_id) throw new Error("layer entry requires element_id");
    this.layers.push({
      element_id: entry.element_id,
      semantic_role: entry.semantic_role,
      reference_bbox_px: entry.reference_bbox_px ?? null,
      target_bbox_in: entry.target_bbox_in,
      z_index: entry.z_index ?? this.nextZ(),
      native_or_crop: entry.native_or_crop ?? "native",
      asset_path: entry.asset_path ?? null,
      source_text_span: entry.source_text_span ?? null,
      editability: entry.editability,
      confidence: entry.confidence ?? "high",
      notes: entry.notes ?? "",
    });
    return this.layers[this.layers.length - 1];
  }

  counts() {
    const native = this.layers.filter((l) => l.native_or_crop === "native").length;
    const crop = this.layers.filter((l) => l.native_or_crop === "crop").length;
    const text = this.layers.filter((l) => l.editability === "editable_text").length;
    return { total: this.layers.length, native, crop, text };
  }
}
