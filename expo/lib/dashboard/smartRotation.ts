/**
 * SMART-TILE ROTATION (NP-156) — the native port of
 * `webapp/lib/dashboardTiles/smartRotation.ts` plus the pool-building half of
 * `webapp/components/dashboard/SmartRotatingTile.tsx#buildRotationItems`.
 *
 * WHAT THE SMART TILE IS. Not a card type of its own: a rotating window onto
 * the cards the member has NOT pinned on the grid. So the pool is
 * "everything eligible, minus everything already on the grid", and the ORDER is
 * relevance — not a fixed cycle. Two inputs decide it, exactly as on the web:
 *
 *   - stat actionability, scored here from the live dashboard data (mood not
 *     logged today, weight never logged, streak at risk, behind the weekly
 *     target, over the calorie budget…);
 *   - metric relevance, which the server already decided: `GET
 *     /api/dashboard/tiles` returns `metrics[]` in rotator-scored order, so a
 *     metric's array index IS its rank.
 *
 * Then every base score is multiplied by an engagement boost built from the tap
 * history (`tileEngagement`, written by `POST /api/dashboard/tile-tap`), so a
 * card the member keeps opening drifts toward the front. The boost saturates
 * and decays, so one heavily-tapped card can neither dominate forever nor bury
 * a genuinely actionable stat.
 *
 * THE NUMBERS ARE THE WEB'S NUMBERS. Every constant and every branch below is
 * copied from `webapp/lib/dashboardTiles/smartRotation.ts`; the only difference
 * is the shape of the input (`DashboardStatData`, which the native dashboard
 * already assembles for the stat tiles, instead of the web's
 * `DashboardTileContext`). Same member, same data, same order on both apps —
 * which is what acceptance e015ca30 asks for.
 *
 * Pure + node-safe (no React, no RN): `__tests__/dashboardSmartTilesNP156.test.tsx`
 * drives it directly.
 */

import { STAT_TILE_IDS, type TileEngagement } from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";

/**
 * The stat cards a smart tile may rotate through — the 8 data cards plus the 3
 * action cards, mirroring `ALL_TILE_IDS` in `webapp/lib/dashboardTiles` (and
 * the same list the native customizer offers as pool options).
 */
export const ROTATION_STAT_IDS: readonly string[] = [
  ...STAT_TILE_IDS,
  "mindset",
  "nutrition",
  "workoutNow",
];

/** The action cards: rendered by `StatActionTile`, not `StatTile`. */
const ACTION_STAT_IDS = new Set(["mindset", "nutrition", "workoutNow"]);

export function isActionStatId(id: string): boolean {
  return ACTION_STAT_IDS.has(id);
}

/**
 * The default pool when a smart tile carries no `settings.pool`: the ORIGINAL
 * stat cards only — no metrics. Mirrors `DEFAULT_SMART_POOL` in
 * `webapp/lib/dashboardLayout/defaults.ts`; metrics are opted in explicitly in
 * the customizer.
 */
export const DEFAULT_SMART_POOL: string[] = STAT_TILE_IDS.map(
  (id) => `stat:${id}`,
);

/** `stat:streak` → `{ kind: 'stat', id: 'streak' }`; null for anything else. */
export function parseRotationKey(
  key: string,
): { kind: "stat" | "metric"; id: string } | null {
  if (key.startsWith("stat:")) {
    const id = key.slice(5);
    return id ? { kind: "stat", id } : null;
  }
  if (key.startsWith("metric:")) {
    const id = key.slice(7);
    return id ? { kind: "metric", id } : null;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Stat actionability                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Actionability score for a stat card in [0..1]; higher = surface sooner.
 * Branch for branch, number for number, the web's `scoreStatTile`.
 */
export function scoreStatTile(
  id: string,
  data?: DashboardStatData | null,
): number {
  switch (id) {
    case "mood":
      // Nudge hardest when today's mood isn't logged yet.
      return data?.todaysMood == null ? 0.95 : 0.35;
    case "weight": {
      const entries = data?.weightEntries ?? [];
      if (entries.length === 0) return 0.9; // never logged — prompt first weigh-in
      return 0.45;
    }
    case "streak": {
      const days = data?.streakDays ?? 0;
      // The web gates this on having loaded the streak payload at all
      // (`streakData && !streakData.activityToday`); natively that payload is
      // what sets `activityToday`, so an explicit `false` is the same signal.
      if (days > 0 && data?.activityToday === false) return 0.9; // at risk today
      if (days === 0) return 0.55; // encourage starting one
      return 0.4;
    }
    case "weekly": {
      const done = data?.thisWeekWorkouts ?? 0;
      const target = data?.weeklyTarget ?? 0;
      if (target > 0 && done < target) return 0.6; // behind pace
      return 0.4;
    }
    case "calories": {
      const goal = data?.caloriesGoal ?? 0;
      if (!goal) return 0.3;
      return (data?.caloriesConsumed ?? 0) > goal ? 0.7 : 0.5; // over budget
    }
    case "water": {
      const goal = data?.waterGoal ?? 0;
      if (!goal) return 0.3;
      return (data?.waterCurrent ?? 0) < goal ? 0.5 : 0.35;
    }
    case "goal":
      return 0.4;
    case "workouts":
      return 0.3;
    default:
      return 0.35;
  }
}

/* -------------------------------------------------------------------------- */
/* Adaptive engagement                                                        */
/* -------------------------------------------------------------------------- */

// Tuning (the web's): a card the member keeps opening should lead, but never to
// the point of burying everything else. Taps decay over ~45 days so the tile
// keeps adapting as habits change.
const ENGAGEMENT_MAX_BOOST = 0.5; // up to +50% relative score
const ENGAGEMENT_TAPS_FOR_HALF = 4; // ~4 recent taps → half of max boost
const ENGAGEMENT_DECAY_DAYS = 45;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Multiplicative boost in [1 .. 1+ENGAGEMENT_MAX_BOOST] for a card's tap
 * history. Saturating (diminishing returns) and recency-decayed. Pure and
 * deterministic given `now`.
 */
export function engagementBoost(
  eng: TileEngagement | undefined,
  now: Date,
): number {
  if (!eng || !eng.taps || eng.taps <= 0) return 1;
  let effectiveTaps = eng.taps;
  if (eng.lastTapAt) {
    const last = new Date(eng.lastTapAt);
    const lastMs = last.getTime();
    if (Number.isFinite(lastMs)) {
      const ageDays = Math.max(0, (now.getTime() - lastMs) / MS_PER_DAY);
      // Linear decay to zero influence by ENGAGEMENT_DECAY_DAYS.
      const decay = Math.max(0, 1 - ageDays / ENGAGEMENT_DECAY_DAYS);
      effectiveTaps = eng.taps * decay;
    }
  }
  if (effectiveTaps <= 0) return 1;
  const frac = effectiveTaps / (effectiveTaps + ENGAGEMENT_TAPS_FOR_HALF);
  return 1 + ENGAGEMENT_MAX_BOOST * frac;
}

/** Index engagement rows by key for O(1) lookup. */
export function indexEngagement(
  rows: readonly TileEngagement[] | undefined,
): Map<string, TileEngagement> {
  const m = new Map<string, TileEngagement>();
  for (const r of rows ?? []) {
    if (r && typeof r.key === "string") m.set(r.key, r);
  }
  return m;
}

/** One optimistic tap bump, held locally until the server's count catches up. */
export interface TapBump {
  taps: number;
  lastTapAt: string;
}

/**
 * The server's tap history with this session's un-acknowledged taps folded in,
 * so a tap tunes the rotation immediately instead of on the next refetch (the
 * web does the same by mutating its in-memory `tilesData.engagement`).
 */
export function mergeEngagement(
  serverRows: readonly TileEngagement[] | undefined,
  bumps: Readonly<Record<string, TapBump>> | undefined,
): TileEngagement[] {
  const out: TileEngagement[] = (serverRows ?? []).map((r) => ({ ...r }));
  for (const [key, bump] of Object.entries(bumps ?? {})) {
    if (!bump || bump.taps <= 0) continue;
    const i = out.findIndex((r) => r.key === key);
    if (i >= 0) {
      const row = out[i];
      out[i] = {
        ...row,
        key,
        taps: (row?.taps ?? 0) + bump.taps,
        lastTapAt: bump.lastTapAt,
      };
    } else {
      out.push({ key, taps: bump.taps, lastTapAt: bump.lastTapAt });
    }
  }
  return out;
}

/**
 * A fingerprint of the tap history a tiles payload carries, used to decide
 * whether this session's optimistic bumps are still needed. The server's clock
 * moves on every refetch and the per-key counts move whenever a tap lands, so
 * a change in either means the payload now counts what we were holding —
 * which is how a tap gets counted once rather than twice.
 */
export function engagementSignature(
  tiles:
    | { now?: string; engagement?: readonly TileEngagement[] }
    | null
    | undefined,
): string {
  if (!tiles) return "";
  const rows = (tiles.engagement ?? [])
    .map((r) => `${r.key}:${r.taps}`)
    .sort()
    .join(",");
  return `${tiles.now ?? ""}|${rows}`;
}

/* -------------------------------------------------------------------------- */
/* The order                                                                  */
/* -------------------------------------------------------------------------- */

export interface RankedKeyInput {
  /** Stat ids available to rotate (pinned ones already excluded). */
  statIds: readonly string[];
  /** Metric ids in the server's relevance order (pinned ones excluded). */
  metricIds: readonly string[];
  statData?: DashboardStatData | null;
  /** Per-key tap history. Omit for the non-adaptive baseline. */
  engagement?: readonly TileEngagement[];
  /** Injected for determinism; the grid passes the server's `now`. */
  now?: Date;
}

/**
 * The rotation order as item keys (`stat:<id>` / `metric:<id>`), most relevant
 * first. Base score = actionability (stats) or incoming rank (metrics), each
 * multiplied by the engagement boost. Ties break on the incoming order, stats
 * before metrics. Deterministic for fixed inputs + `now`.
 */
export function rankedRotationKeys({
  statIds,
  metricIds,
  statData,
  engagement,
  now,
}: RankedKeyInput): string[] {
  const at = now ?? new Date(0); // callers pass a real `now`; epoch keeps it pure
  const engById = indexEngagement(engagement);
  const boost = (key: string): number => engagementBoost(engById.get(key), at);

  const scored: { key: string; score: number; tie: number }[] = [];

  for (let i = 0; i < statIds.length; i++) {
    const id = statIds[i] as string;
    const key = `stat:${id}`;
    scored.push({ key, score: scoreStatTile(id, statData) * boost(key), tie: i });
  }
  // Metric rank → score band [0.30 .. ~0.62]; index 0 highest.
  for (let i = 0; i < metricIds.length; i++) {
    const key = `metric:${metricIds[i] as string}`;
    const base = Math.max(0.3, 0.62 - i * 0.04);
    scored.push({ key, score: base * boost(key), tie: 1000 + i });
  }

  scored.sort((a, b) => b.score - a.score || a.tie - b.tie);
  return scored.map((s) => s.key);
}

export interface RotationItem {
  /** `stat:<id>` / `metric:<id>` — the key `POST /api/dashboard/tile-tap` takes. */
  key: string;
  kind: "stat" | "metric";
  id: string;
}

export interface BuildRotationOptions {
  statData?: DashboardStatData | null;
  /** Metric ids in the server's order (from `tiles.metrics`). */
  metricIds?: readonly string[];
  /** Cards already pinned on the grid — never repeated by a smart tile. */
  excludeKeys?: ReadonlySet<string>;
  /** This tile's `settings.pool`. Absent ⇒ {@link DEFAULT_SMART_POOL}. */
  poolKeys?: ReadonlySet<string>;
  engagement?: readonly TileEngagement[];
  now?: Date;
}

/**
 * The pool for ONE smart tile, in rotation order: eligible stat cards plus
 * eligible metric cards, minus everything pinned on the grid. Eligibility is
 * the tile's configured pool (default: the 8 stat cards).
 */
export function buildRotationItems(
  opts: BuildRotationOptions = {},
): RotationItem[] {
  const { statData, metricIds, excludeKeys, poolKeys, engagement, now } = opts;
  const exclude = excludeKeys ?? new Set<string>();
  const pool = poolKeys ?? new Set(DEFAULT_SMART_POOL);
  const allowed = (key: string): boolean =>
    !exclude.has(key) && pool.has(key);

  const statIds = ROTATION_STAT_IDS.filter((id) => allowed(`stat:${id}`));
  const metrics = (metricIds ?? []).filter((id) => allowed(`metric:${id}`));

  const order = rankedRotationKeys({
    statIds,
    metricIds: metrics,
    statData,
    engagement,
    now,
  });

  const items: RotationItem[] = [];
  for (const key of order) {
    const parsed = parseRotationKey(key);
    if (parsed) items.push({ key, kind: parsed.kind, id: parsed.id });
  }
  return items;
}

/** The keys a layout already pins, keyed the way the rotation keys its items. */
export function pinnedRotationKeys(
  layout: readonly { kind: string; id: string }[] | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  for (const t of layout ?? []) {
    if (t.kind === "stat") keys.add(`stat:${t.id}`);
    else if (t.kind === "metric") keys.add(`metric:${t.id}`);
  }
  return keys;
}
