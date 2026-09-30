// Nutrition AI seams — the contracts the upcoming Become AI engine fulfills.
//
// The engine (a single, full-coverage redbtn graph powering EVERY AI feature
// of Become — programs, sessions, mindset content, nutrition) is NOT built
// yet. Like the Mind MoveEngine seam (lib/mind/moves.ts → composeSession),
// these interfaces define the plug points now so the engine drops in later
// with no UI rework: same inputs, same outputs, different backing.
//
// Three nutrition capabilities, per the product plan:
//   • PlateEstimator      — camera photo → estimated foods + macros
//   • ProductFinder       — free-text/photo product lookup → nutrition facts
//   • NutritionConsultant — meal planning + general nutrition guidance,
//                           grounded in the user's goals/logs (one of the
//                           per-domain consultants).
//
// Pure types; client-safe. No implementations here — the deterministic app
// works fully without them, and the UI surfaces them as "coming soon"
// (components/nutrition/NutritionAITeaser.tsx) until the engine lands.

import type { IMealNutrition } from '@/models/Meal'

export interface EstimatedPlateItem {
  name: string
  /** Brand when the model can read it on packaging or the user named it (e.g.
   *  "Fairlife"). Used in DB matching exactly like a manual search's brand. */
  brand?: string
  estimatedServing: string // e.g. "1 cup", "~150 g"
  nutrition: IMealNutrition
  confidence: number // 0..1
}

export interface PlateEstimate {
  items: EstimatedPlateItem[]
  total: IMealNutrition
  caveats?: string[]
  /**
   * The signed follow-up ticket this estimate was issued with, when the member
   * is on a capped allowance. Hand it straight back on a CORRECTION of this
   * same estimate and the refinement spends a bounded follow-up instead of a
   * whole new scan. Not persisted, not part of the model's output — the
   * server mints it and the client only relays it.
   */
  allowanceTicket?: string
}

/** Text input for a no-photo estimate or a correction of a prior estimate. */
export interface TextEstimateInput {
  /** Free-text description of the meal (the "describe it" path). */
  description?: string
  /** A prior item list to be corrected. */
  priorEstimate?: EstimatedPlateItem[]
  /** The user's correction, e.g. "it was 6 tacos not 5". */
  correction?: string
  /** The `allowanceTicket` of the estimate being corrected. Only ever set on a
   *  correction: sending it with a fresh estimate would charge a new outcome
   *  as a refinement of an old one. */
  allowanceTicket?: string
}

/** Plate estimator: photo in (or text), loggable items out. */
export interface PlateEstimator {
  /** Photo → estimate. Optional `note` lets the user describe the plate (e.g.
   *  "these are 6 carnitas tacos") to improve identification/counts.
   *  `allowanceTicket` is set only when this call re-runs the vision pass to
   *  CORRECT an estimate the member already paid for. */
  estimate(
    imageBase64: string,
    ctx: NutritionAIContext,
    note?: string,
    allowanceTicket?: string,
  ): Promise<PlateEstimate>
  /** Estimate from words (describe a meal) or refine a prior estimate via a correction. */
  estimateFromText(input: TextEstimateInput, ctx: NutritionAIContext): Promise<PlateEstimate>
}

export interface ProductMatch {
  name: string
  brand?: string
  servingSize?: number
  servingUnit?: string
  nutrition: IMealNutrition
  source: 'usda' | 'openfoodfacts' | 'ai'
}

/** Product / nutrition-fact finder: query (text or label photo) → matches. */
export interface ProductFinder {
  find(query: { text?: string; imageBase64?: string }, ctx: NutritionAIContext): Promise<ProductMatch[]>
}

export interface ConsultantTurn {
  reply: string
  /** Optional structured output: a proposed plan the UI can apply. */
  proposedPlans?: Array<{ dateKey: string; tag: string; mealName: string; items: ProductMatch[] }>
}

/** Meal planner / general nutrition consultant (per-domain consultant). */
export interface NutritionConsultant {
  ask(message: string, ctx: NutritionAIContext): Promise<ConsultantTurn>
}

/** Grounding context the engine receives with every nutrition call. */
export interface NutritionAIContext {
  userId: string
  goals?: { calories?: number; protein?: number; carbs?: number; fats?: number } | null
  /** Recent per-day rollups (same shape the suggestion engine uses). */
  recentDays?: Array<{ date: string; calories: number; protein: number; logCount: number }>
  profile?: { fitnessGoal?: string; weightUnit?: string } | null
}

/** Capability registry — what the UI may surface and its availability. */
export const NUTRITION_AI_CAPABILITIES = [
  { id: 'plate-estimator', label: 'Snap your plate', blurb: 'Point the camera at your food — get foods + macros, ready to log.', available: false },
  { id: 'product-finder', label: 'Find any product', blurb: 'Name it or photograph the label — nutrition facts found for you.', available: false },
  { id: 'consultant', label: 'Your nutrition consultant', blurb: 'Meal plans and answers, grounded in your goals and real logs.', available: false },
] as const

export type NutritionAICapabilityId = (typeof NUTRITION_AI_CAPABILITIES)[number]['id']
