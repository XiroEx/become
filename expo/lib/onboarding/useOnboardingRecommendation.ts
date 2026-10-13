import { useEffect, useRef, useState } from "react";
import {
  ProgramRecommendResponseSchema,
  type ProgramRecommendResponse,
  type ProgramRecommendation,
} from "@become/api-client";
import { apiFetch } from "@become/api-client";
import { reportRequestError } from "@/lib/auth/unauthorized";
import type { OnboardingProfile } from "@/lib/onboarding/steps";

export interface OnboardingRecommendation {
  recommendation: ProgramRecommendation | null;
  loading: boolean;
}

/**
 * Build the GET /api/programs/recommend query for the onboarding answers.
 *
 * Mirrors webapp/app/onboarding/page.tsx (`useRecommendation`):
 * `goals=&limit=1&profile=0` with level, days and equipment. `profile=0`
 * ranks on THIS session's answers only — without it a member redoing
 * onboarding is ranked against the equipment/experience they are in the
 * middle of replacing.
 */
export function buildOnboardingRecommendPath(
  profile: Pick<
    OnboardingProfile,
    "fitnessGoals" | "experienceLevel" | "weeklyAvailability" | "equipmentAccess"
  >,
): string | null {
  const goals = profile.fitnessGoals ?? [];
  if (goals.length === 0) return null;
  const params = new URLSearchParams({
    goals: goals.join(","),
    limit: "1",
    profile: "0",
  });
  if (profile.experienceLevel) params.set("level", profile.experienceLevel);
  if (profile.weeklyAvailability)
    params.set("days", String(profile.weeklyAvailability));
  if (profile.equipmentAccess?.length)
    params.set("equipment", profile.equipmentAccess.join(","));
  return `/api/programs/recommend?${params.toString()}`;
}

export interface UseOnboardingRecommendationOptions {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  /** Debounce before firing, matching the web's 250ms. */
  delayMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

/**
 * Server-driven program recommendation for the onboarding review step.
 *
 * The recommendation comes from the server (GET /api/programs/recommend),
 * never from client-side keyword matching. Fires (debounced) on every
 * meaningful answer change; a failed or superseded request resolves to
 * `null`, never an error — the review step renders fine without a match.
 */
export function useOnboardingRecommendation(
  profile: Pick<
    OnboardingProfile,
    "fitnessGoals" | "experienceLevel" | "weeklyAvailability" | "equipmentAccess"
  >,
  options: UseOnboardingRecommendationOptions = {},
): OnboardingRecommendation {
  const {
    baseUrl,
    getToken,
    fetchImpl,
    delayMs = 250,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = options;
  const [recommendation, setRecommendation] =
    useState<ProgramRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const optsRef = useRef({ baseUrl, getToken, fetchImpl });
  // Keep the request options in sync via ref (refs must not be written during
  // render); the effect below re-runs only on the answer key.
  useEffect(() => {
    optsRef.current = { baseUrl, getToken, fetchImpl };
  });

  const goals = profile.fitnessGoals ?? [];
  const key = [
    goals.join(","),
    profile.experienceLevel ?? "",
    profile.weeklyAvailability ?? "",
    (profile.equipmentAccess ?? []).join(","),
  ].join("|");

  // The effect syncs from the member's answers and the network — both outside
  // React's own state flow for this hook's data. All state updates happen
  // inside the debounced timer / fetch callbacks (never synchronously in
  // the effect body), so no value here is derivable during render.
  useEffect(() => {
    const path = buildOnboardingRecommendPath(profile);
    const id = requestId.current + 1;
    requestId.current = id;
    const timer = setTimeoutImpl(() => {
      if (id !== requestId.current) return;
      if (!path) {
        setRecommendation(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const opts = optsRef.current;
      void apiFetch<ProgramRecommendResponse>(path, ProgramRecommendResponseSchema, {
        method: "GET",
        baseUrl: opts.baseUrl,
        getToken: opts.getToken,
        fetchImpl: opts.fetchImpl,
      })
        .then((data) => {
          if (id !== requestId.current) return;
          setRecommendation(data.recommendations?.[0] ?? null);
        })
        .catch((err) => {
          reportRequestError(err);
          if (id === requestId.current) setRecommendation(null);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, delayMs);
    return () => clearTimeoutImpl(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);

  return { recommendation, loading };
}
