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
import type { GatePayload } from '@/lib/entitlementsClient'
import type {
  PlateEstimate,
  PlateEstimator,
  ProductMatch,
  ProductFinder,
  ConsultantTurn,
  NutritionConsultant,
  NutritionAIContext,
  TextEstimateInput,
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

/**
 * The member's plan (or their allowance for today) refused the estimate.
 *
 * This MUST be checked before PlateUnavailableError: both end up as "no
 * estimate came back", but one is our service being down and the other is a
 * price. Telling someone the food AI is unreachable when they have simply used
 * today's free scan sends them retrying against a wall.
 */
export class EntitlementRequiredError extends Error {
  constructor(public readonly gate: GatePayload) {
    super(gate.error)
    this.name = 'EntitlementRequiredError'
  }
}

// ── PlateEstimator ───────────────────────────────────────────────────────────

class PlateEstimatorImpl implements PlateEstimator {
  async estimate(
    imageBase64: string,
    ctx: NutritionAIContext,
    note?: string,
    allowanceTicket?: string,
  ): Promise<PlateEstimate> {
    // Async run: POST returns a runId, runAiTask polls until the estimate lands.
    const r = await runAiTask('/api/ai/nutrition/plate', {
      image: imageBase64,
      grounding: ctx,
      ...(note && note.trim() ? { note } : {}),
      // Present only when this call CORRECTS an estimate the member already
      // paid for. The route verifies it (owner, feature and window all have to
      // match) before it will spend a follow-up instead of a fresh unit.
      ...(allowanceTicket ? { allowanceTicket } : {}),
    })
    const est = r.result as PlateEstimate | undefined
    if (r.ok && est && Array.isArray(est.items)) return withTicket(est, r.allowanceTicket)
    // A gate refused it — a price, not an outage. Checked FIRST.
    if (r.error === 'entitlement' && r.gate) throw new EntitlementRequiredError(r.gate)
    // unavailable / failure → one error type for callers.
    throw new PlateUnavailableError()
  }

  async estimateFromText(input: TextEstimateInput, ctx: NutritionAIContext): Promise<PlateEstimate> {
    const r = await runAiTask('/api/ai/nutrition/describe', {
      description: input.description,
      correction: input.correction,
      priorEstimate: input.priorEstimate,
      grounding: ctx,
      ...(input.allowanceTicket ? { allowanceTicket: input.allowanceTicket } : {}),
    })
    const est = r.result as PlateEstimate | undefined
    if (r.ok && est && Array.isArray(est.items)) return withTicket(est, r.allowanceTicket)
    if (r.error === 'entitlement' && r.gate) throw new EntitlementRequiredError(r.gate)
    throw new PlateUnavailableError()
  }
}

/**
 * Carry the follow-up ticket the ROUTE minted out on the estimate it belongs
 * to, so the correction that refines this estimate can present it.
 *
 * Attached to the outcome rather than remembered in a module-level "last
 * ticket": a ticket handed to a genuinely new estimate would make that new
 * scan ride the previous one's charge, which is the same leak in reverse.
 */
function withTicket(est: PlateEstimate, ticket: string | undefined): PlateEstimate {
  return ticket ? { ...est, allowanceTicket: ticket } : est
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
