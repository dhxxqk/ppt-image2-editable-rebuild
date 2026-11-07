/**
 * Export helpers around the engine's presentation API.
 *
 * `exportPptx` produces the editable deck; `exportEnginePng` is the engine's
 * own rasterizer and is kept only as diagnostic evidence, because its CJK line
 * breaking differs from LibreOffice/PowerPoint. Final visual QA always uses
 * the LibreOffice render.
 */
import fs from "node:fs/promises";
import path from "node:path";

export async function exportPptx(engine, pres, outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const pptx = await engine.PresentationFile.exportPptx(pres);
  await pptx.save(outPath);
  return outPath;
}

export async function exportEnginePng(pres, slide, outPath, scale = 1.8) {
  const png = await pres.export({ slide, format: "png", scale });
  await fs.writeFile(outPath, Buffer.from(await png.arrayBuffer()));
  return outPath;
}

export async function exportLayoutJson(slide, outPath) {
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(outPath, await layout.text(), "utf8");
  return outPath;
}
