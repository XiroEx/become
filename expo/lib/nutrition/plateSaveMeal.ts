/**
 * ─── Save a scanned plate as a meal + report a bad estimate (native) ─────────
 *
 * The native half of the web's plate review extras
 * (`webapp/components/nutrition/SnapPlateModal.tsx`):
 * `handleSaveRecipe` (`POST /api/meals` with the reviewed items, `gateFrom`
 * on a 403, the server's words for other refusals) and
 * `GenerationFeedbackModal` (`POST /api/feedback` with
 * `buildGenerationFeedbackMetadata`).
 *
 * RULES THAT TRAVEL:
 *   • Only a 403 carrying `feature` + `requiresTier` raises the upgrade
 *     sheet (`classifyApiError` → `plan-gate`). Any other refusal — an
 *     ownership 403, a 400, a 429, an outage — comes back with the server's
 *     own words and no sheet.
 *   • At the custom-meals cap with enforcement on, the button STAYS and opens
 *     the upgrade sheet from a `syntheticGate` — the sheet never hides the
 *     save half the way the basket/combine sheets do.
 *   • Until My Stuff exists natively (NP-142) the save confirms IN PLACE
 *     instead of opening the meal page.
 */

import { z } from "zod";
import {
  apiFetch,
  classifyApiError,
  FeedbackResponseSchema,
} from "@become/api-client";
import {
  buildGenerationFeedbackMetadata,
  perUnit,
  type ReviewItem,
} from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";

const MealSaveResponseSchema = z
  .object({
    meal: z.object({ _id: z.string() }).passthrough().optional(),
  })
  .passthrough();

export interface SavePlateDeps {
  baseUrl?: string;
  getToken?: () => string | undefined;
}

export type SavePlateResult =
  /** The meal is kept — it appears in My Stuff on the web. */
  | { status: "saved"; mealId?: string }
  /** A real 403 gate — the caller opens the upgrade sheet with it. */
  | { status: "gate"; gate: unknown }
  /** Anything else — the caller shows `message`, the server's own words. */
  | { status: "error"; message: string };

export interface SavePlateInput {
  items: ReviewItem[];
  /** The reusable meal's name, as typed. */
  name: string;
  /** Which meal slot it files under. */
  defaultTag: string;
}

/**
 * Keep the reviewed plate as a reusable meal (`POST /api/meals`). Does NOT
 * log. Never throws for a classified refusal — those come back as results.
 */
export async function savePlateAsMeal(
  input: SavePlateInput,
  deps: SavePlateDeps = {},
): Promise<SavePlateResult> {
  const active = input.items.filter((it) => !it.removed);
  if (active.length === 0) {
    return { status: "error", message: "Add at least one item first." };
  }
  const name = input.name.trim();
  if (!name) {
    return { status: "error", message: "Give the meal a name first." };
  }
  // The web's `handleSaveRecipe` payload exactly: per-ONE-unit nutrition ×
  // servings, matched foods keep their foodId, filed under `defaultTag`.
  const items = active.map((it) => {
    const n = it.nutrition;
    return {
      ...(it.match?.kind === "food" && it.match.id
        ? { foodId: it.match.id }
        : {}),
      name: it.name,
      ...(it.brand ? { brand: it.brand } : {}),
      servingSize: 1,
      servingUnit: it.unitLabel || "serving",
      servings: it.multiplier,
      nutrition: {
        calories: perUnit(n.calories),
        protein: perUnit(n.protein),
        carbs: perUnit(n.carbs),
        fats: perUnit(n.fats),
      },
    };
  });
  try {
    const saved = await apiFetch("/api/meals", MealSaveResponseSchema, {
      method: "POST",
      baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
      ...(deps.getToken ? { getToken: deps.getToken } : {}),
      body: { name, items, defaultTag: input.defaultTag },
    });
    const mealId = saved.meal?._id ? String(saved.meal._id) : undefined;
    return { status: "saved", ...(mealId ? { mealId } : {}) };
  } catch (err) {
    const classification = classifyApiError(err);
    // The gate is checked BEFORE a failure gets the server's words: only a
    // 403 carrying `feature` + `requiresTier` ever becomes a sheet.
    if (classification.kind === "plan-gate") {
      return { status: "gate", gate: classification.gate };
    }
    // No invented plan requirement here. `classifyApiError` has already had
    // its look; anything still 403 is an ownership or role refusal, and it
    // gets the server's own words like every other error.
    const serverMessage =
      classification.kind === "offline"
        ? null
        : classification.message;
    if (serverMessage) {
      return { status: "error", message: `Couldn't save: ${serverMessage}` };
    }
    return { status: "error", message: "Couldn't save meal. Check your connection." };
  }
}

export interface PlateFeedbackInput {
  items: ReviewItem[];
  /** The review thumbnail (data: URL or /api/blob URL) — decides photo vs describe. */
  imageThumb: string;
  tag: string;
  scanId: string | null;
  message: string;
}

export type PlateFeedbackResult =
  | { status: "sent" }
  | { status: "error"; message: string };

/**
 * Report a bad estimate (`POST /api/feedback` with `type:
 * 'nutrition_generation'` and the generation metadata — the item list with
 * the scan reference attached). Never throws; a refusal comes back with the
 * server's words.
 */
export async function sendPlateFeedback(
  input: PlateFeedbackInput,
  deps: SavePlateDeps = {},
): Promise<PlateFeedbackResult> {
  const message = input.message.trim();
  if (!message) {
    return { status: "error", message: "Message is required" };
  }
  try {
    await apiFetch("/api/feedback", FeedbackResponseSchema, {
      method: "POST",
      baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
      ...(deps.getToken ? { getToken: deps.getToken } : {}),
      body: {
        type: "nutrition_generation",
        message,
        metadata: buildGenerationFeedbackMetadata(
          input.items,
          input.imageThumb,
          input.tag,
          input.scanId,
        ),
      },
    });
    return { status: "sent" };
  } catch (err) {
    const classification = classifyApiError(err);
    return {
      status: "error",
      message:
        classification.message ??
        "Could not send feedback. Check your connection and try again.",
    };
  }
}
