import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  ExerciseSuggestionsResponseSchema,
  SuggestionDismissResponseSchema,
  type ExerciseSuggestion,
  type ExerciseSuggestionsResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";

export interface UseExerciseHintsOptions {
  baseUrl?: string;
  /** Fetch implementation override for tests. */
  fetchImpl?: typeof fetch;
}

export interface UseExerciseHintsResult {
  /** Suggestions keyed by lowercase exercise slug (first per slug wins). */
  hints: Record<string, ExerciseSuggestion>;
  /**
   * Remove the hint for `slug` locally and dismiss it on the account
   * (`POST /api/suggestions/dismiss`), so it stays gone on the web too.
   */
  dismissHint: (slug: string) => Promise<void>;
}

/**
 * The web's once-per-workout hint load
 * (`webapp/.../workout/live/LiveWorkoutClient.tsx` and
 * `WorkoutFormClient.tsx`): one `GET /api/workouts/exercise-suggestions?slugs`
 * per slug set, keyed by `sourceData.exerciseSlug`, dismissed through
 * `POST /api/suggestions/dismiss { id }` on the account. Best-effort — a
 * failure leaves the map empty and the hints simply don't show.
 */
export function useExerciseHints(
  slugs: readonly string[],
  options: UseExerciseHintsOptions = {},
): UseExerciseHintsResult {
  const { token } = useAuth();
  const [hints, setHints] = useState<Record<string, ExerciseSuggestion>>({});
  // The fetch + dismissal POST need the token even if it resolves after
  // mount; refs keep the callbacks stable so callers don't re-render per
  // token change. Refs are written in effects below, never during render.
  const tokenRef = useRef(token);
  const optionsRef = useRef(options);
  // Keep the refs in sync via effects (refs must not be written during render).
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    optionsRef.current = options;
  });

  const slugKey = useMemo(() => slugs.join(","), [slugs]);
  useEffect(() => {
    if (slugKey.length === 0) return;
    let alive = true;
    const unique = Array.from(
      new Set(
        slugKey
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (unique.length === 0) return;
    void (async () => {
      try {
        const opts = optionsRef.current;
        const res = await apiFetch<ExerciseSuggestionsResponse>(
          `/api/workouts/exercise-suggestions?slugs=${encodeURIComponent(unique.join(","))}`,
          ExerciseSuggestionsResponseSchema,
          {
            baseUrl: opts.baseUrl ?? WEBAPP_BASE_URL,
            getToken: () => tokenRef.current ?? undefined,
            ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
          },
        );
        if (!alive) return;
        const map: Record<string, ExerciseSuggestion> = {};
        for (const s of res.suggestions ?? []) {
          const slug = String(s.sourceData?.["exerciseSlug"] ?? "").toLowerCase();
          if (!slug || map[slug]) continue;
          map[slug] = s;
        }
        setHints(map);
      } catch {
        // Best-effort: the hints simply don't show.
      }
    })();
    return () => {
      alive = false;
    };
  }, [slugKey, optionsRef, tokenRef]);

  const dismissHint = useCallback(async (slug: string) => {
    const key = slug.toLowerCase();
    // Read the id through the functional update's snapshot: `hints` is not a
    // dep, so the callback stays stable and never posts a stale id.
    let id: string | undefined;
    setHints((prev) => {
      id = prev[key]?.id;
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (!id) return;
    try {
      const opts = optionsRef.current;
      await apiFetch("/api/suggestions/dismiss", SuggestionDismissResponseSchema, {
        method: "POST",
        body: { id },
        baseUrl: opts.baseUrl ?? WEBAPP_BASE_URL,
        getToken: () => tokenRef.current ?? undefined,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      });
    } catch {
      // Keep the optimistic dismissal — the web does the same fire-and-forget.
    }
    // `options` carries only construction-time DI (baseUrl/fetchImpl); the
    // token travels through `tokenRef` so it is fresh without re-creating
    // this callback. Refs are stable identities, so listing them is free.
  }, [optionsRef, tokenRef]);

  return { hints, dismissHint };
}
