import { z } from "zod";
import { apiFetch, ApiError } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * ─── Food reports, natively (NP-174) ───────────────────────────────────────
 *
 * The web's `FlagFoodSheet.tsx` files a report with
 * `POST /api/nutrition/foods/{id}/flag { kind, kinds, note?, photoUrl?,
 * photoUrls? }`, and `FoodReportsPanel.tsx` follows it with
 * `GET /api/nutrition/flags/mine` (evidence via
 * `POST /api/nutrition/flags/{id}/evidence { photoUrls, note? }`, read with
 * `POST /api/nutrition/flags/mine {}`).
 *
 * This module is the native half of the SAME four routes. It never edits the
 * shared Food: a flag is evidence handed to the verification agent, and the
 * member fixes their own log separately (PATCH
 * /api/meal-logs/{logId}/items/{itemId} with the corrected per-serving
 * nutrition — see `applyLogCorrection`).
 *
 * Everything is injectable (fetch, base URL, token) for the same reason
 * `lib/account/deleteAccount.ts` is: these are network calls that must be
 * testable without a device.
 */

export type FoodFlagKind = "calories" | "macros" | "serving" | "other";

export const FOOD_FLAG_KINDS: readonly FoodFlagKind[] = [
  "calories",
  "macros",
  "serving",
  "other",
];

export const FOOD_FLAG_KIND_LABELS: Record<FoodFlagKind, string> = {
  calories: "Calories look wrong",
  macros: "Macros look wrong",
  serving: "Serving size is wrong",
  other: "Something else",
};

/** More than this on one report is someone testing the upload, not evidence. */
export const MAX_FLAG_PHOTOS = 6;

/** The per-serving values the member can correct for their own entry. */
export interface LogCorrection {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  /**
   * Set only when the member actually typed a new serving label — never sent
   * just because the field was prefilled and left alone, or a macro-only fix
   * would freeze the live "loggedQuantity + loggedUnit" fallback into a stale
   * stored string the next time the amount changes.
   */
  servingLabel?: string;
}

/** One of the member's own food reports, newest first. */
export interface FoodReport {
  id: string;
  foodId: string;
  food: {
    name: string;
    brand?: string;
    barcode?: string;
    servingLabel?: string;
  };
  status: string;
  kinds: string[];
  note?: string;
  resolution?: string;
  resolvedAt?: string;
  createdAt?: string;
  photoCount: number;
  rounds: number;
  escalated: boolean;
  unread: boolean;
  canAddEvidence: boolean;
}

const FoodReportSchema = z
  .object({
    id: z.string(),
    foodId: z.string(),
    food: z
      .object({
        name: z.string(),
        brand: z.string().optional(),
        barcode: z.string().optional(),
        servingLabel: z.string().optional(),
      })
      .passthrough(),
    status: z.string(),
    kinds: z.array(z.string()).default([]),
    note: z.string().optional(),
    resolution: z.string().optional(),
    resolvedAt: z.string().optional(),
    createdAt: z.string().optional(),
    photoCount: z.number().default(0),
    rounds: z.number().default(1),
    escalated: z.boolean().default(false),
    unread: z.boolean().default(false),
    canAddEvidence: z.boolean().default(false),
  })
  .passthrough();

const MyReportsResponseSchema = z
  .object({
    items: z.array(FoodReportSchema).default([]),
    unreadCount: z.number().default(0),
  })
  .passthrough();

type MyReportsParsed = z.infer<typeof MyReportsResponseSchema>;

const FlagResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    flagId: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

type FlagParsed = z.infer<typeof FlagResponseSchema>;

export interface FoodFlagsDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getToken?: () => string | undefined;
}

export interface FileFoodFlagInput extends FoodFlagsDeps {
  /** The catalogue Food's ObjectId. Only an ObjectId may be sent as foodId. */
  foodId: string;
  kinds: FoodFlagKind[];
  note?: string;
  /** Same-origin `/api/blob/…` URLs from `POST /api/nutrition/flags/image`. */
  photoUrls?: string[];
  /** Session JWT. Absent → nothing is sent (`signed-out`, like uploads). */
  jwt?: string | null;
}

export type FileFoodFlagResult =
  | { status: "filed"; flagId?: string; message: string }
  | { status: "signed-out" }
  | { status: "failed"; httpStatus?: number; message: string };

export interface LoadMyReportsInput extends FoodFlagsDeps {
  /** Session JWT. Absent → nothing is fetched (`signed-out`). */
  jwt?: string | null;
}

export type LoadMyReportsResult =
  | { status: "loaded"; items: FoodReport[]; unreadCount: number }
  | { status: "signed-out" }
  | { status: "failed"; httpStatus?: number; message: string };

export interface MarkReportsReadInput extends FoodFlagsDeps {
  /** Session JWT. Absent → nothing is sent (`signed-out`). */
  jwt?: string | null;
  /** When set, only these report ids are marked. Otherwise all are. */
  ids?: string[];
}

export type MarkReportsReadResult =
  | { status: "marked" }
  | { status: "signed-out" }
  | { status: "failed"; httpStatus?: number; message: string };

export interface AddReportEvidenceInput extends FoodFlagsDeps {
  reportId: string;
  photoUrls: string[];
  note?: string;
  /** Session JWT. Absent → nothing is sent (`signed-out`). */
  jwt?: string | null;
}

export type AddReportEvidenceResult =
  | { status: "sent" }
  | { status: "signed-out" }
  | { status: "failed"; httpStatus?: number; message: string };

export interface ApplyLogCorrectionInput extends FoodFlagsDeps {
  logId: string;
  itemId: string;
  /** The corrected PER-SERVING nutrition for the member's own entry. */
  correction: LogCorrection;
  /** Session JWT. Absent → nothing is sent (`signed-out`). */
  jwt?: string | null;
}

export type ApplyLogCorrectionResult =
  | { status: "applied" }
  | { status: "signed-out" }
  | { status: "failed"; httpStatus?: number; message: string };

function authFor(
  deps: FoodFlagsDeps,
  jwt: string | null | undefined,
): { baseUrl?: string; fetchImpl?: typeof fetch; getToken: () => string | undefined } {
  if (deps.getToken) {
    const getToken = deps.getToken;
    return {
      ...(deps.baseUrl ? { baseUrl: deps.baseUrl } : {}),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      getToken,
    };
  }
  const token = jwt ?? undefined;
  return {
    ...(deps.baseUrl ? { baseUrl: deps.baseUrl } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    getToken: () => token,
  };
}

function failureOf(error: unknown): {
  status: "failed";
  httpStatus?: number;
  message: string;
} {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | null;
    const message =
      body && typeof body.error === "string" && body.error.length > 0
        ? body.error
        : `Request failed (${error.status})`;
    return { status: "failed", httpStatus: error.status, message };
  }
  return { status: "failed", message: "Could not reach Become. Try again." };
}

/**
 * File a report that a food's numbers look wrong.
 *
 * Records evidence for the verification agent. NEVER edits the shared Food —
 * the catalogue is written only by the verification agent. The member fixes
 * their own log separately with `applyLogCorrection`.
 */
export async function fileFoodFlag(
  input: FileFoodFlagInput,
): Promise<FileFoodFlagResult> {
  const { foodId, kinds, note, photoUrls, jwt } = input;
  const cleanKinds = [...new Set(kinds)].filter((k): k is FoodFlagKind =>
    (FOOD_FLAG_KINDS as readonly string[]).includes(k),
  );
  if (cleanKinds.length === 0) {
    return { status: "failed", message: "Pick what looks wrong first." };
  }
  if (!jwt && !input.getToken) return { status: "signed-out" };
  const photos = [...new Set((photoUrls ?? []).filter((u) => u.length > 0))].slice(
    0,
    MAX_FLAG_PHOTOS,
  );
  try {
    const data: FlagParsed = await apiFetch(
      `/api/nutrition/foods/${encodeURIComponent(foodId)}/flag`,
      FlagResponseSchema,
      {
        method: "POST",
        ...authFor(input, jwt),
        baseUrl: input.baseUrl ?? WEBAPP_BASE_URL,
        body: {
          // `kind` stays for compatibility with the stored shape; `kinds`
          // carries the full selection.
          kind: cleanKinds[0],
          kinds: cleanKinds,
          ...(note && note.trim() ? { note: note.trim().slice(0, 1000) } : {}),
          ...(photos[0] ? { photoUrl: photos[0] } : {}),
          ...(photos.length > 0 ? { photoUrls: photos } : {}),
        },
      },
    );
    return {
      status: "filed",
      ...(data.flagId ? { flagId: data.flagId } : {}),
      message: data.message ?? "Thanks — we will check this.",
    };
  } catch (error) {
    return failureOf(error);
  }
}

/** The member's own food reports, newest first, with an unread count. */
export async function loadMyReports(
  input: LoadMyReportsInput,
): Promise<LoadMyReportsResult> {
  const { jwt } = input;
  if (!jwt && !input.getToken) return { status: "signed-out" };
  try {
    const data: MyReportsParsed = await apiFetch("/api/nutrition/flags/mine", MyReportsResponseSchema, {
      ...authFor(input, jwt),
      baseUrl: input.baseUrl ?? WEBAPP_BASE_URL,
    });
    return { status: "loaded", items: data.items, unreadCount: data.unreadCount };
  } catch (error) {
    return failureOf(error);
  }
}

/** Mark the reporter's outcomes as read. Clears the unread badge. */
export async function markReportsRead(
  input: MarkReportsReadInput,
): Promise<MarkReportsReadResult> {
  const { jwt, ids } = input;
  if (!jwt && !input.getToken) return { status: "signed-out" };
  try {
    await apiFetch(
      "/api/nutrition/flags/mine",
      z.object({}).passthrough(),
      {
        method: "POST",
        ...authFor(input, jwt),
        baseUrl: input.baseUrl ?? WEBAPP_BASE_URL,
        body: ids && ids.length > 0 ? { ids } : {},
      },
    );
    return { status: "marked" };
  } catch (error) {
    return failureOf(error);
  }
}

/**
 * The second chance: better photos on a report that came back with no change,
 * then the pipeline runs it again. At least one photo is required.
 */
export async function addReportEvidence(
  input: AddReportEvidenceInput,
): Promise<AddReportEvidenceResult> {
  const { reportId, photoUrls, note, jwt } = input;
  const photos = [...new Set(photoUrls.filter((u) => u.length > 0))].slice(
    0,
    MAX_FLAG_PHOTOS,
  );
  if (photos.length === 0) {
    return { status: "failed", message: "Add at least one photo first." };
  }
  if (!jwt && !input.getToken) return { status: "signed-out" };
  try {
    await apiFetch(
      `/api/nutrition/flags/${encodeURIComponent(reportId)}/evidence`,
      z.object({}).passthrough(),
      {
        method: "POST",
        ...authFor(input, jwt),
        baseUrl: input.baseUrl ?? WEBAPP_BASE_URL,
        body: {
          photoUrls: photos,
          ...(note && note.trim() ? { note: note.trim().slice(0, 1000) } : {}),
        },
      },
    );
    return { status: "sent" };
  } catch (error) {
    return failureOf(error);
  }
}

/**
 * Fix the member's OWN log entry with the corrected per-serving values.
 *
 * This is the deliberate counterpart to `fileFoodFlag`: the flag never edits
 * the shared Food, so the member's own row is corrected here instead —
 * `PATCH /api/meal-logs/{logId}/items/{itemId} { nutrition, servingLabel? }`.
 */
export async function applyLogCorrection(
  input: ApplyLogCorrectionInput,
): Promise<ApplyLogCorrectionResult> {
  const { logId, itemId, correction, jwt } = input;
  if (!jwt && !input.getToken) return { status: "signed-out" };
  try {
    await apiFetch(
      `/api/meal-logs/${encodeURIComponent(logId)}/items/${encodeURIComponent(itemId)}`,
      z.object({}).passthrough(),
      {
        method: "PATCH",
        ...authFor(input, jwt),
        baseUrl: input.baseUrl ?? WEBAPP_BASE_URL,
        body: {
          nutrition: {
            calories: correction.calories,
            protein: correction.protein,
            carbs: correction.carbs,
            fats: correction.fats,
            fiber: correction.fiber,
          },
          ...(correction.servingLabel !== undefined
            ? { servingLabel: correction.servingLabel }
            : {}),
        },
      },
    );
    return { status: "applied" };
  } catch (error) {
    return failureOf(error);
  }
}

/** A factor that cannot scale anything sanely means "already the right basis". */
export function safeBasisFactor(factor: number | undefined | null): number {
  return typeof factor === "number" && Number.isFinite(factor) && factor > 0
    ? factor
    : 1;
}

function round1(value: number): number {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/**
 * Storage basis → what the member sees. Rounded to one decimal, which is all
 * a nutrition label ever carries. Mirrors
 * `webapp/lib/nutrition/portionBasis.ts#toDisplayBasis`.
 */
export function correctionToDisplay(
  correction: LogCorrection,
  factor: number,
): LogCorrection {
  const f = safeBasisFactor(factor);
  return {
    calories: Math.round((Number(correction.calories) || 0) * f * 10) / 10,
    protein: Math.round((Number(correction.protein) || 0) * f * 10) / 10,
    carbs: Math.round((Number(correction.carbs) || 0) * f * 10) / 10,
    fats: Math.round((Number(correction.fats) || 0) * f * 10) / 10,
    fiber: Math.round((Number(correction.fiber) || 0) * f * 10) / 10,
    ...(correction.servingLabel !== undefined
      ? { servingLabel: correction.servingLabel }
      : {}),
  };
}

/**
 * What the member typed → storage basis. Deliberately NOT rounded: rounding
 * here drifts the number they just typed once it is scaled back for display.
 * Mirrors `webapp/lib/nutrition/portionBasis.ts#toStorageBasis`.
 */
export function correctionToStorage(
  correction: LogCorrection,
  factor: number,
): LogCorrection {
  const f = safeBasisFactor(factor);
  const div = (v: number) => (Number(v) || 0) / f;
  return {
    calories: div(correction.calories),
    protein: div(correction.protein),
    carbs: div(correction.carbs),
    fats: div(correction.fats),
    fiber: div(correction.fiber),
    ...(correction.servingLabel !== undefined
      ? { servingLabel: correction.servingLabel }
      : {}),
  };
}

export { round1 as roundCorrectionField };
