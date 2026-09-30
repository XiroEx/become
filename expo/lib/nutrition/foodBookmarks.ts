import { z } from "zod";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

const MeFoodBookmarkResponseSchema = z
  .object({
    saved: z.boolean().optional(),
    alreadyExists: z.boolean().optional(),
  })
  .passthrough();

/**
 * Save a food to the user's saved foods (`POST /api/me/foods`).
 * The endpoint is idempotent and validates that the foodId references
 * an existing Food document.
 */
export async function saveFoodBookmark(
  foodId: string,
  getToken: () => string | undefined,
): Promise<boolean> {
  try {
    await apiFetch(
      "/api/me/foods",
      MeFoodBookmarkResponseSchema,
      {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken,
        body: { foodId },
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a food from the user's saved foods (`DELETE /api/me/foods/{foodId}`).
 */
export async function removeFoodBookmark(
  foodId: string,
  getToken: () => string | undefined,
): Promise<boolean> {
  try {
    await apiFetch(
      `/api/me/foods/${encodeURIComponent(foodId)}`,
      z.object({}).passthrough(),
      {
        method: "DELETE",
        baseUrl: WEBAPP_BASE_URL,
        getToken,
      },
    );
    return true;
  } catch {
    return false;
  }
}
