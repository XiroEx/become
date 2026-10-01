import { z } from "zod";
import {
  DashboardLayoutSchema,
  DashboardLayoutResponseSchema,
  type DashboardTile,
} from "@become/api-client";
import {
  getCachedSync,
  readCache,
  writeCache,
} from "@/lib/cache/lastKnown";

export const LAYOUT_CACHE_KEY = "dashboard.layout";

/**
 * Flexible schema that accepts either:
 * - standard wire response `{ layout: [...] }`
 * - raw array `[...]` (as stored by web cache)
 * - empty object `{}` (fall back to empty layout)
 */
export const LayoutWireSchema = z.union([
  DashboardLayoutResponseSchema,
  DashboardLayoutSchema.transform((layout: DashboardTile[]): { layout: DashboardTile[] } => ({ layout })),
  z.object({}).passthrough().transform((): { layout: DashboardTile[] } => ({ layout: [] })),
]);

export async function readCachedLayout(memberId?: string | null): Promise<DashboardTile[] | null> {
  const cached =
    (await readCache<{ layout?: DashboardTile[] } | DashboardTile[]>(LAYOUT_CACHE_KEY, memberId)) ??
    (await readCache<{ layout?: DashboardTile[] } | DashboardTile[]>("/api/dashboard/layout", memberId));
  if (!cached) return null;
  if (Array.isArray(cached)) return cached;
  if (Array.isArray(cached.layout)) return cached.layout;
  return null;
}

export function getCachedLayoutSync(memberId?: string | null): DashboardTile[] | null {
  const cached =
    getCachedSync<{ layout?: DashboardTile[] } | DashboardTile[]>(LAYOUT_CACHE_KEY, memberId) ??
    getCachedSync<{ layout?: DashboardTile[] } | DashboardTile[]>("/api/dashboard/layout", memberId);
  if (!cached) return null;
  if (Array.isArray(cached)) return cached;
  if (Array.isArray(cached.layout)) return cached.layout;
  return null;
}

export async function writeCachedLayout(
  layout: DashboardTile[],
  memberId?: string | null,
): Promise<void> {
  await Promise.all([
    writeCache(LAYOUT_CACHE_KEY, layout, memberId),
    writeCache("/api/dashboard/layout", { layout }, memberId),
  ]);
}
