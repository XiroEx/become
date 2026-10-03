/**
 * ─── MEAL PHOTO → DESCRIBE → ESTIMATE → REVIEW → LOG (NP-089) ────────────────
 *
 * The native half of the web's `SnapPlateModal.tsx`: a photo (camera or
 * library, resized to the web's 1024 px / 0.6 JPEG via NP-059's capture
 * helper) with an optional note, or a typed description, becomes an itemised
 * estimate through the AI run client (NP-038), is reconciled against the
 * member's foods/meals/recipes (`POST /api/nutrition/foods/match`), reviewed
 * with per-item portion controls, and logged through `POST /api/meal-logs`.
 * Every generated estimate is saved to history (`POST /api/nutrition/scans`,
 * updated in place with `PATCH /api/nutrition/scans/{id}`).
 *
 * RULES THAT TRAVEL:
 *   • Photo, upload and describe share ONE `ai-food-estimate` allowance
 *     (free: 1 a day). The server buckets that day by the member's stored
 *     timezone offset — the app never computes or resets it.
 *   • The gate is checked BEFORE a failure is called an outage: a 403 with
 *     `feature` + `requiresTier` opens the upgrade sheet with the server's
 *     wording, never an error line.
 *   • A consent refusal opens the consent prompt and NOTHING else — no
 *     estimate is charged (the route checks consent before the allowance)
 *     and no outage line is shown behind the sheet.
 *   • Empty `items` means "could not read it, add detail"; a thrown failure
 *     means "our side, try in a minute".
 *   • Logging drops the cached AI Mind session (NP-102).
 *   • `source` on the log is `photo` for a camera capture, `upload` for a
 *     library pick, and `describe` for a typed description.
 */

import { z } from "zod";
import { apiFetch } from "@become/api-client";
import {
  applyMatches,
  buildScanItems,
  entryToReviewItem,
  toReviewItems,
  type DbMatch,
  type EstimatedPlateItem,
  type PlateEstimate,
  type ReviewItem,
} from "@become/core";
import { runAiTask } from "@/lib/ai/runClient";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { uploadScanImage as uploadScanPhoto } from "@/lib/media/upload";
import type { CapturedImage } from "@/lib/media/capture";

/** Where the estimate came from — drives the log `source` and scan `source`. */
export type EstimateOrigin = "camera" | "library" | "describe";

/** The `source` the meal log and the scan history record carry. */
export type MealLogSource = "photo" | "upload" | "describe";

export function mealLogSourceFor(origin: EstimateOrigin): MealLogSource {
  if (origin === "camera") return "photo";
  if (origin === "library") return "upload";
  return "describe";
}

/** What the estimate step can answer. Mirrors the web's runEstimate split. */
export type EstimateOutcome =
  | { status: "estimated"; estimate: PlateEstimate }
  /** The model answered and found nothing — ask for more detail. */
  | { status: "empty" }
  /** A plan/allowance refusal — the caller opens the upgrade sheet. */
  | { status: "gate"; gate: unknown }
  /** A consent refusal — the caller opens the consent prompt, nothing else. */
  | { status: "consent" }
  /** Nothing came back at all — our side, try in a minute. */
  | { status: "unavailable" };

const MatchesResponseSchema = z
  .object({ matches: z.array(z.any()).optional() })
  .passthrough();
type MatchesResponse = { matches?: unknown[] };

const ScanSaveResponseSchema = z
  .object({ scan: z.object({ _id: z.string() }).passthrough().optional() })
  .passthrough();
type ScanSaveResponse = { scan?: { _id: string } };

const MealLogCreateResponseSchema = z
  .object({
    log: z.object({ _id: z.string() }).passthrough().optional(),
    mealLog: z.object({ _id: z.string() }).passthrough().optional(),
    _id: z.string().optional(),
  })
  .passthrough();
type MealLogCreateResponse = {
  log?: { _id: string };
  mealLog?: { _id: string };
  _id?: string;
};

export interface EstimateDeps {
  baseUrl?: string;
  getToken?: () => string | undefined;
  runTask?: typeof runAiTask;
}

function taskOf(deps: EstimateDeps): typeof runAiTask {
  return deps.runTask ?? runAiTask;
}

/**
 * Run the plate (photo + optional note) estimate through the AI client.
 * Never throws for a classified refusal — those come back as outcomes.
 */
export async function estimateFromPhoto(
  image: CapturedImage,
  note: string | undefined,
  deps: EstimateDeps = {},
): Promise<EstimateOutcome> {
  const runTask = taskOf(deps);
  const trimmed = (note ?? "").trim();
  const r = await runTask(
    "/api/ai/nutrition/plate",
    {
      image: image.dataUrl,
      ...(trimmed ? { note: trimmed } : {}),
    },
  );
  return toOutcome(r);
}

/** Run the describe (typed description) estimate through the AI client. */
export async function estimateFromDescription(
  description: string,
  deps: EstimateDeps = {},
): Promise<EstimateOutcome> {
  const runTask = taskOf(deps);
  const r = await runTask("/api/ai/nutrition/describe", {
    description: description.trim(),
  });
  return toOutcome(r);
}

function toOutcome(r: {
  ok: boolean;
  result?: unknown;
  error?: string;
  gate?: unknown;
}): EstimateOutcome {
  if (r.ok) {
    const est = r.result as PlateEstimate | undefined;
    if (est && Array.isArray(est.items)) {
      if (est.items.length === 0) return { status: "empty" };
      return { status: "estimated", estimate: est };
    }
    return { status: "unavailable" };
  }
  // The gate is checked BEFORE a failure is called an outage.
  if (r.error === "entitlement" && r.gate) return { status: "gate", gate: r.gate };
  if (r.error === "ai_consent") return { status: "consent" };
  return { status: "unavailable" };
}

/** The member-facing line for each non-estimate outcome. */
export const ESTIMATE_EMPTY_MESSAGE =
  "Could not read that. Try adding a little more detail.";
export const ESTIMATE_UNAVAILABLE_MESSAGE =
  "Could not reach the food AI just now. That one is on our end, not yours. Give it a minute and try again.";

/** Fresh review rows for a new estimate (match flags start unchecked). */
export function reviewItemsFor(estimate: PlateEstimate): ReviewItem[] {
  return toReviewItems(estimate);
}

/**
 * Reconcile review rows against the member's foods, meals and recipes.
 * Best-effort: any failure leaves the rows as AI estimates (matchChecked).
 */
export async function reconcileEstimateItems(
  items: ReviewItem[],
  deps: EstimateDeps = {},
): Promise<ReviewItem[]> {
  try {
    const data: MatchesResponse = await apiFetch(
      "/api/nutrition/foods/match",
      MatchesResponseSchema,
      {
        method: "POST",
        baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
        ...(deps.getToken ? { getToken: deps.getToken } : {}),
        body: {
          items: items.map((it) => ({ name: it.name, brand: it.brand })),
        },
      },
    );
    const raw = Array.isArray(data.matches) ? data.matches : [];
    const matches: (DbMatch | null)[] = items.map((_, i) => {
      const m = raw[i] as DbMatch | null | undefined;
      return m && typeof m === "object" ? m : null;
    });
    return applyMatches(items, matches);
  } catch {
    return items.map((it) => ({ ...it, matchChecked: true }));
  }
}

/** A review row from a food picked in the add-more search sheet. */
export function reviewItemFromSearchEntry(entry: {
  foodId?: string;
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  servings: number;
  nutrition: { calories: number; protein: number; carbs: number; fats: number };
  servingLabel?: string;
  loggedQuantity?: number;
  loggedUnit?: string;
  loggedGramsPerServing?: number;
  loggedMlPerServing?: number;
}): ReviewItem {
  return entryToReviewItem({
    ...entry,
    ...(entry.servingLabel ? { servingLabel: entry.servingLabel } : {}),
    ...(entry.loggedQuantity !== undefined
      ? { loggedQuantity: entry.loggedQuantity }
      : {}),
    ...(entry.loggedUnit !== undefined ? { loggedUnit: entry.loggedUnit } : {}),
    ...(entry.loggedGramsPerServing !== undefined
      ? { loggedGramsPerServing: entry.loggedGramsPerServing }
      : {}),
    ...(entry.loggedMlPerServing !== undefined
      ? { loggedMlPerServing: entry.loggedMlPerServing }
      : {}),
  });
}

export interface PersistEstimateInput {
  items: ReviewItem[];
  origin: EstimateOrigin;
  tag: string;
  note?: string;
  scanId?: string | null;
  mealLogId?: string;
  loggedAt?: string;
  imageUrl?: string;
}

export interface PersistEstimateResult {
  scanId: string | null;
}

/**
 * Save a generated estimate to history. Best-effort — never throws.
 * Creates on first generation, updates in place afterwards (one record per
 * estimate). Describe estimates carry no thumbnail.
 */
export async function persistEstimate(
  input: PersistEstimateInput,
  deps: EstimateDeps = {},
): Promise<PersistEstimateResult> {
  try {
    const scanItems = buildScanItems(input.items);
    if (scanItems.length === 0) return { scanId: input.scanId ?? null };
    const source: MealLogSource = mealLogSourceFor(input.origin);
    const payload: Record<string, unknown> = {
      source: source === "upload" ? "photo" : source,
      tag: input.tag,
      items: scanItems,
      ...(input.note ? { note: input.note } : {}),
      ...(input.mealLogId ? { mealLogId: input.mealLogId } : {}),
      ...(input.loggedAt ? { loggedAt: input.loggedAt } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    };
    if (input.scanId) {
      await apiFetch(
        `/api/nutrition/scans/${encodeURIComponent(input.scanId)}`,
        z.object({}).passthrough(),
        {
          method: "PATCH",
          baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
          ...(deps.getToken ? { getToken: deps.getToken } : {}),
          body: payload,
        },
      );
      return { scanId: input.scanId };
    }
    const saved: ScanSaveResponse = await apiFetch(
      "/api/nutrition/scans",
      ScanSaveResponseSchema,
      {
        method: "POST",
        baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
        ...(deps.getToken ? { getToken: deps.getToken } : {}),
        body: payload,
      },
    );
    const id = saved.scan?._id ? String(saved.scan._id) : null;
    return { scanId: id };
  } catch {
    return { scanId: input.scanId ?? null };
  }
}

export interface LogEstimateInput {
  items: ReviewItem[];
  origin: EstimateOrigin;
  tag: string;
  /** YYYY-MM-DD the log lands on. */
  dateKey: string;
  /** Today's YYYY-MM-DD — decides "now" vs noon stamping. */
  todayKey: string;
  now?: Date;
}

export interface LogEstimateResult {
  ok: boolean;
  mealLogId?: string;
  error?: string;
}

/**
 * Log the reviewed estimate through `POST /api/meal-logs` with the right
 * `source`, then update the history record and drop the cached AI Mind
 * session (NP-102). Removed rows are skipped; logging nothing is an error.
 */
export async function logEstimate(
  input: LogEstimateInput,
  deps: EstimateDeps = {},
): Promise<LogEstimateResult> {
  const active = input.items.filter((it) => !it.removed);
  if (active.length === 0) {
    return { ok: false, error: "Add at least one item to log." };
  }
  const now = input.now ?? new Date();
  const loggedAt =
    input.dateKey === input.todayKey
      ? now.toISOString()
      : `${input.dateKey}T12:00:00.000Z`;
  const mealItems = active.map((it) => {
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
        calories: n.calories ?? 0,
        protein: n.protein ?? 0,
        carbs: n.carbs ?? 0,
        fats: n.fats ?? 0,
      },
    };
  });
  try {
    const created: MealLogCreateResponse = await apiFetch(
      "/api/meal-logs",
      MealLogCreateResponseSchema,
      {
        method: "POST",
        baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
        ...(deps.getToken ? { getToken: deps.getToken } : {}),
        body: {
          items: mealItems,
          tags: [input.tag],
          loggedAt,
          untimed: true,
          source: mealLogSourceFor(input.origin),
        },
      },
    );
    const rawId = created.log?._id ?? created.mealLog?._id ?? created._id;
    const mealLogId = rawId ? String(rawId) : undefined;
    await invalidateMindSession();
    return { ok: true, ...(mealLogId ? { mealLogId } : {}) };
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : "Failed to log.";
    return { ok: false, error: message };
  }
}

/**
 * Upload the full-res photo to blob storage (`POST /api/nutrition/scans/image`).
 * Returns the same-origin `/api/blob/…` URL, or null. Best-effort — never throws.
 */
export async function uploadScanImage(
  image: CapturedImage,
  deps: EstimateDeps = {},
): Promise<string | null> {
  try {
    const uploaded = await uploadScanPhoto(
      { uri: image.uri, fileName: image.fileName, mimeType: image.mimeType },
      {
        ...(deps.baseUrl ? { baseUrl: deps.baseUrl } : {}),
        ...(deps.getToken
          ? { store: { get: async () => deps.getToken?.() ?? null } as never }
          : {}),
      },
    );
    if (uploaded.status !== "uploaded") return null;
    return uploaded.imageUrl.startsWith("/api/blob/") ? uploaded.imageUrl : null;
  } catch {
    return null;
  }
}

/** Re-exported for the sheet: the web's review maths live in @become/core. */
export type { DbMatch, EstimatedPlateItem, PlateEstimate, ReviewItem };
