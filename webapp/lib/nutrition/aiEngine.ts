// lib/nutrition/aiEngine.ts — client-side implementations of the nutrition AI
// seams declared in lib/nutrition/aiSeams.ts. These call the authenticated
// proxy routes (/api/ai/nutrition/*) which in turn invoke the become-ai redbtn
// graph. Runs client-side only — never import lib/ai/becomeGraph.ts here.
//
// Availability contract (mirrors the route contracts):
//   • NutritionConsultant.ask  — always returns ConsultantTurn; route falls
//     back gracefully so this never rejects on a graph outage.
//   • PlateEstimator.estimate  — throws PlateUnavailableError when the route
//     returns { ok:false, unavailable:true } (vision stub). Callers detect
//     err instanceof PlateUnavailableError to show the "coming soon" state.
//   • ProductFinder.find       — throws ProductUnavailableError on the same
//     condition. Returns ProductMatch[] when the route eventually resolves.

import { runAiTask } from '@/lib/ai/runClient'
import type {
  PlateEstimate,
  PlateEstimator,
  ProductMatch,
  ProductFinder,
  ConsultantTurn,
  NutritionConsultant,
  NutritionAIContext,
} from '@/lib/nutrition/aiSeams'

// ── Error sentinels ──────────────────────────────────────────────────────────

export class PlateUnavailableError extends Error {
  constructor() {
    super('Plate photo scanning is not yet available.')
    this.name = 'PlateUnavailableError'
  }
}

export class ProductUnavailableError extends Error {
  constructor() {
    super('AI product lookup is not yet available.')
    this.name = 'ProductUnavailableError'
  }
}

// ── PlateEstimator ───────────────────────────────────────────────────────────

class PlateEstimatorImpl implements PlateEstimator {
  async estimate(imageBase64: string, ctx: NutritionAIContext): Promise<PlateEstimate> {
    // Async run: POST returns a runId, runAiTask polls until the estimate lands.
    const r = await runAiTask('/api/ai/nutrition/plate', { image: imageBase64, grounding: ctx })
    const est = r.result as PlateEstimate | undefined
    if (r.ok && est && Array.isArray(est.items)) return est
    // unavailable / failure → one error type for callers.
    throw new PlateUnavailableError()
  }
}

// ── ProductFinder ────────────────────────────────────────────────────────────

class ProductFinderImpl implements ProductFinder {
  async find(
    query: { text?: string; imageBase64?: string },
    ctx: NutritionAIContext,
  ): Promise<ProductMatch[]> {
    // Async run: POST returns a runId, runAiTask polls until matches land.
    const r = await runAiTask(
      '/api/ai/nutrition/product',
      { text: query.text, image: query.imageBase64, grounding: ctx },
    )
    const result = r.result as { matches?: ProductMatch[] } | ProductMatch[] | undefined
    const matches = Array.isArray(result) ? result : result?.matches
    if (r.ok && Array.isArray(matches)) return matches
    throw new ProductUnavailableError()
  }
}

// ── NutritionConsultant ──────────────────────────────────────────────────────

class NutritionConsultantImpl implements NutritionConsultant {
  async ask(message: string, ctx: NutritionAIContext): Promise<ConsultantTurn> {
    // Async run: POST returns a runId, runAiTask polls until the reply lands.
    const r = await runAiTask('/api/ai/nutrition/consultant', { message, grounding: ctx })

    const reply =
      (r.text && r.text.trim()) || (r.reply && r.reply.trim())
        || "Let's keep it simple. Tell me your goal and roughly what you eat in a normal day, and I'll help you adjust one thing at a time."

    return { reply }
  }
}

// ── Singleton exports ────────────────────────────────────────────────────────

export const plateEstimator: PlateEstimator = new PlateEstimatorImpl()
export const productFinder: ProductFinder = new ProductFinderImpl()
export const nutritionConsultant: NutritionConsultant = new NutritionConsultantImpl()
