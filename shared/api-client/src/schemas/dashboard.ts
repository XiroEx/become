import { z } from 'zod';

/**
 * The unified dashboard tile model — the single wire shape that replaces the
 * two previously-parallel tile systems (themed StatTiles + intelligence metric
 * tiles).
 *
 * A user's dashboard is an ordered list of `DashboardTile`s (`DashboardLayout`).
 *
 *  - `kind: 'stat'`           — one of the 8 themed stat tiles
 *    (streak/mood/weekly/goal/calories/water/weight/workouts). `id` is the stat id.
 *  - `kind: 'metric'`         — a registered intelligence metric. `id` is the metric id.
 *  - `kind: 'smart-rotating'` — a synthetic tile that rotates through eligible
 *    smart metrics. `id` is a client-generated instance id. `locked` may pin it
 *    to a single metric id (null/absent = rotates).
 *
 * NOTE: the webapp does NOT depend on this package (only the Expo app does) and
 * the webapp itself has no `zod` dependency, so the webapp keeps a hand-rolled
 * mirror of this shape in `webapp/lib/dashboardLayout/types.ts`. Keep the two in
 * sync — they describe the same persisted/wire shape.
 */

export const TILE_KINDS = ['stat', 'metric', 'smart-rotating'] as const;
export type DashboardTileKind = (typeof TILE_KINDS)[number];

export const TILE_SIZES = ['1x1', '2x1'] as const;
export type DashboardTileSize = (typeof TILE_SIZES)[number];

/** Maximum number of tiles a single layout may contain. */
export const MAX_DASHBOARD_TILES = 20;

export const DashboardTileSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(TILE_KINDS),
    size: z.enum(TILE_SIZES),
    /**
     * Pins a smart-rotating tile to a single metric id. Only valid when
     * `kind === 'smart-rotating'`; null/absent means the tile rotates.
     */
    locked: z.string().min(1).nullable().optional(),
  })
  .refine((tile) => tile.kind === 'smart-rotating' || tile.locked == null, {
    message: "`locked` is only allowed on a 'smart-rotating' tile",
    path: ['locked'],
  });

export type DashboardTile = z.infer<typeof DashboardTileSchema>;

export const DashboardLayoutSchema = z
  .array(DashboardTileSchema)
  .max(MAX_DASHBOARD_TILES, {
    message: `A dashboard layout may contain at most ${MAX_DASHBOARD_TILES} tiles`,
  });

export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;

/** GET /api/dashboard/layout → { layout: [...] }. */
export const DashboardLayoutResponseSchema = z.object({
  layout: DashboardLayoutSchema,
});

export type DashboardLayoutResponse = z.infer<
  typeof DashboardLayoutResponseSchema
>;

/** PATCH /api/dashboard/layout body → { layout: [...] }. */
export const DashboardLayoutUpdateRequestSchema = z.object({
  layout: DashboardLayoutSchema,
});

export type DashboardLayoutUpdateRequest = z.infer<
  typeof DashboardLayoutUpdateRequestSchema
>;
