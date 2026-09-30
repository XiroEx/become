/**
 * Materialising an external search hit so it can be logged.
 *
 * A `usda-*` / `off-*` row is a SYNTHETIC id: no Food document exists for it
 * yet, so `GET /api/nutrition/foods/[id]` 404s and `POST /api/nutrition/foods`
 * is the wrong door entirely — that route is `requireQuota('custom-foods')`
 * and stamps `authoredBy`, i.e. it charges the member's custom-food allowance
 * for a row they did not author. Logging never charges `custom-foods`; only
 * the create screens and the two save-as-food routes may.
 *
 * The right door is `POST /api/nutrition/foods/import`, which is ungated and
 * stamps only `createdBy` provenance. It is the same call the web makes
 * (`webapp/components/nutrition/FoodSearchModal.tsx#importExternalIfNeeded`),
 * including the fallback: the source import re-fetches authoritative data and,
 * when USDA is flaky or the local OFF cache has dropped the row, the cached
 * search row we already hold is re-imported as `{ source: 'manual', data }`.
 */

import { apiFetch, FoodImportResponseSchema } from "@become/api-client";
import type { Food } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";

export interface ExternalFoodRef {
  /** The `source` the import route expects — the web says `openfoodfacts`. */
  source: "usda" | "openfoodfacts";
  externalId: string;
}

/** Split a synthetic search id into the import route's `{ source, externalId }`. */
export function parseExternalFoodId(
  id: string | undefined,
): ExternalFoodRef | null {
  if (!id) return null;
  if (id.startsWith("usda-")) {
    const externalId = id.slice("usda-".length);
    return externalId ? { source: "usda", externalId } : null;
  }
  if (id.startsWith("off-")) {
    const externalId = id.slice("off-".length);
    return externalId ? { source: "openfoodfacts", externalId } : null;
  }
  return null;
}

/** A 24-char hex id, i.e. a row that really exists in our Food collection. */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The `data` half of `{ source: 'manual', data }`, built from a cached search
 * row. `importManualFood` needs `nutrition` + `servingSize` or it throws (and
 * the route 500s), so a row without them yields null and the caller keeps the
 * source import's error instead of sending a payload that cannot work.
 */
export function manualFoodDataFromRow(
  row: unknown,
): Record<string, unknown> | null {
  const rec = asRecord(row);
  if (!rec) return null;
  const name = typeof rec.name === "string" ? rec.name : "";
  if (!name) return null;
  const variant = defaultVariantOf(rec);
  if (!variant) return null;
  const data: Record<string, unknown> = {
    name,
    aliases: [],
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit,
    alternateServings: Array.isArray(rec.alternateServings)
      ? rec.alternateServings
      : [],
    nutrition: variant.nutrition,
  };
  if (typeof rec.brand === "string" && rec.brand) data.brand = rec.brand;
  if (typeof rec.category === "string" && rec.category) {
    data.category = rec.category;
  }
  if (variant.gramsPerServing != null) {
    data.gramsPerServing = variant.gramsPerServing;
  }
  if (variant.mlPerServing != null) data.mlPerServing = variant.mlPerServing;
  // Deliberately NOT forwarded: `barcode` (a unique global key the server only
  // honours for admins) and any id — the import route owns identity.
  return data;
}

/** Serialize a search row for the food detail route's `row` query param. */
export function foodRowParam(row: unknown): string | null {
  const data = manualFoodDataFromRow(row);
  return data ? JSON.stringify(data) : null;
}

/** Read back what `foodRowParam` wrote. Never throws on a bad param. */
export function parseFoodRowParam(
  value: string | string[] | undefined,
): Record<string, unknown> | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw) return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export interface ImportExternalFoodOptions {
  ref: ExternalFoodRef;
  /** Cached search row (already reduced by `manualFoodDataFromRow`). */
  fallback?: Record<string, unknown> | null;
  getToken: () => string | undefined;
}

/** Resolve an external search hit into a real Food document. */
export async function importExternalFood({
  ref,
  fallback,
  getToken,
}: ImportExternalFoodOptions): Promise<Food> {
  const base = { baseUrl: WEBAPP_BASE_URL, getToken };
  try {
    const res = await apiFetch(
      "/api/nutrition/foods/import",
      FoodImportResponseSchema,
      { method: "POST", body: { source: ref.source, externalId: ref.externalId }, ...base },
    );
    return res.food;
  } catch (err) {
    if (!fallback) throw err;
  }
  const res = await apiFetch(
    "/api/nutrition/foods/import",
    FoodImportResponseSchema,
    { method: "POST", body: { source: "manual", data: fallback }, ...base },
  );
  return res.food;
}
