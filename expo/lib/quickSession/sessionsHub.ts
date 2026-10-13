/**
 * ─── SESSIONS HUB HELPERS (NP-134) ───────────────────────────────────────────
 *
 * Pure helpers behind the native Sessions hub
 * (`app/(app)/(tabs)/programming/sessions.tsx`), ported from
 * `webapp/app/dashboard/workout/hub/HubClient.tsx`:
 *
 *   • `moveInArray` — drag-reorder within the Favorites group.
 *   • `sortFavoritesFirst` — favorites float to the top in `favoriteOrder`
 *     (falling back to newest-first for a favorite that was never dragged);
 *     everything else keeps its original (newest-first) order.
 *   • `formatSessionDate` / `formatPlannedDate` — the web's relative day
 *     labels ("Today", "Yesterday"/"Tomorrow", weekday, short date).
 *
 * The web's `SessionLog`/`PlannedSession` shapes are mirrored here as
 * `HubSession`/`HubPlannedSession` so the screen and these helpers agree on
 * one vocabulary. `exercises` are `DraftExercise`-shaped (`@become/core`),
 * exactly what the web's `?withExercises=true` answer carries.
 */

import type { DraftExercise } from "@become/core";

export interface HubSession {
  kind: "program" | "quick";
  title: string;
  focus?: string;
  date: string;
  duration?: number | null;
  exerciseCount: number;
  sessionId?: string;
  favorite?: boolean;
  exercises?: DraftExercise[];
}

export interface HubPlannedSession {
  sessionId: string;
  title: string;
  focus?: string;
  date: string;
  exerciseCount: number;
  exercises: DraftExercise[];
  needsName?: boolean;
}

export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr.slice();
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

// Favorites always float to the top, in `favoriteOrder` (falling back to
// newest-first for any favorite that hasn't been dragged yet). Everything
// else keeps its original (newest-first) order.
export function sortFavoritesFirst<
  T extends { sessionId?: string; favorite?: boolean; date: string },
>(sessions: T[], favoriteOrder: string[]): { favorites: (T & { sessionId: string })[]; others: T[] } {
  const orderIndex = new Map(favoriteOrder.map((id, i) => [id, i]));
  const favorites = sessions
    .filter((s): s is T & { sessionId: string } => !!s.favorite && !!s.sessionId)
    .sort((a, b) => {
      const ai = orderIndex.get(a.sessionId) ?? Infinity;
      const bi = orderIndex.get(b.sessionId) ?? Infinity;
      if (ai !== bi) return ai - bi;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  const others = sessions.filter((s) => !s.favorite || !s.sessionId);
  return { favorites, others };
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatPlannedDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatSessionDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/**
 * The focus keys the stash accepts (`webapp/lib/quickSession/types.ts`
 * `isFocusKey`). A stale/unknown server value must not leak into the stash,
 * so `openHubSession`/`startHubPlanned` drop it — the same rule
 * `expo/lib/quickSession/rebuild.ts` applies when rebuilding from a log.
 */
const FOCUS_KEYS = new Set([
  "full_body",
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "glutes",
  "core",
  "arms",
  "chest",
  "back",
  "shoulders",
  "cardio",
]);

export function isHubFocusKey(v: unknown): v is string {
  return typeof v === "string" && FOCUS_KEYS.has(v);
}
