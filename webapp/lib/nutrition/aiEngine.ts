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

// ── Auth header helper ───────────────────────────────────────────────────────

function authHeader(): HeadersInit {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : ''
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

// ── PlateEstimator ───────────────────────────────────────────────────────────

class PlateEstimatorImpl implements PlateEstimator {
  async estimate(imageBase64: string, ctx: NutritionAIContext): Promise<PlateEstimate> {
    const res = await fetch('/api/ai/nutrition/plate', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ image: imageBase64, grounding: ctx }),
    })

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (data.ok === true && data.estimate) {
      return data.estimate as PlateEstimate
    }

    // { ok: false, unavailable: true } — vision stub not yet live.
    // Also treat any other failure (network error after throw, bad status) the
    // same way so callers only need to handle one error type.
    throw new PlateUnavailableError()
  }
}

// ── ProductFinder ────────────────────────────────────────────────────────────

class ProductFinderImpl implements ProductFinder {
  async find(
    query: { text?: string; imageBase64?: string },
    ctx: NutritionAIContext,
  ): Promise<ProductMatch[]> {
    const res = await fetch('/api/ai/nutrition/product', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({
        text: query.text,
        image: query.imageBase64,
        grounding: ctx,
      }),
    })

    const data = await res.json().catch(() => ({})) as Record<string, unknown>

    if (data.ok === true && Array.isArray(data.matches)) {
      return data.matches as ProductMatch[]
    }

    // { ok: false, unavailable: true } — vision stub or no result.
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
