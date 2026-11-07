/**
 * Compose one slide: presentation base -> title band -> timeline -> cards.
 *
 * Ordering matters. The timeline band is drawn before the cards so the cards
 * sit on top of it; nodes and date pills are drawn after each card so their
 * outlines stay crisp.
 */
import { computeCardStack, computeCards, computeTimeline } from "../components/geometry.mjs";
import { addTitleBand } from "../components/title-band.mjs";
import { addTimelineBand, addTimelineNode, addDatePill } from "../components/timeline.mjs";
import { addMilestoneCard } from "../components/card.mjs";
import { LayerRecorder } from "../manifest/index.mjs";
import { importPresentation } from "../engine/index.mjs";

/**
 * @param {object} engine loaded engine ({FileBlob, PresentationFile})
 * @param {object} config validated rebuild config
 * @param {object} deps {iconBuffers: Map<cardId, Buffer>}
 * @returns {Promise<{pres:object, slide:object, layers:LayerRecorder, layout:object}>}
 */
export async function buildSlide(engine, config, deps = {}) {
  const pres = await importPresentation(engine, config.slide.master);
  const slideCount = pres.slides.items.length;
  if (config.slide.expected_existing_slides && slideCount !== config.slide.expected_existing_slides) {
    throw new Error(
      `presentation base has ${slideCount} slides, config expected ${config.slide.expected_existing_slides}; refusing to guess the layout`,
    );
  }
  pres.slides.keep([]);
  const slide = pres.slides.add({ layout: config.slide.layout });
  if (!slide) throw new Error(`failed to add a slide from layout "${config.slide.layout}"`);

  const layers = new LayerRecorder();
  const ctx = { slide, theme: config.theme, typography: config.typography, layers };

  addTitleBand(ctx, config.header, config.layout);
  const timeline = computeTimeline(config.layout);
  addTimelineBand(ctx, timeline);

  const cardGeom = computeCards(config.slide.width_in, config.layout, config.cards.length);
  const stack = computeCardStack(config.layout);
  const layout = { ...cardGeom, stack, timeline };

  for (let i = 0; i < config.cards.length; i += 1) {
    const card = config.cards[i];
    const geom = cardGeom.cards[i];
    const icon = deps.iconBuffers?.get(card.id) || null;
    addMilestoneCard(ctx, card, geom, stack, icon);
    addTimelineNode(ctx, card, geom.center_in, timeline);
    addDatePill(ctx, card, geom.center_in, timeline);
  }

  return { pres, slide, layers, layout };
}
