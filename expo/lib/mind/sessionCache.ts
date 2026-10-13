import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MindSessionPlan, SuggestedAction } from "@become/core";

export const MIND_AI_PLAN_KEY = "mind-ai-plan";
export const AI_PLAN_TTL = 8 * 60 * 60 * 1000; // 8h cooldown

export const SUGG_CACHE_KEY = "mind-suggested-next";
export const SUGG_CACHE_TTL = 12 * 60 * 60 * 1000; // 12h cooldown

export interface MindPlanCacheRecord {
  plan: MindSessionPlan | null;
  ts: number;
}

/**
 * Read the cached AI Mind plan + its timestamp from AsyncStorage.
 * A record may carry { ts } with no plan (a cooldown stamp from an attempt that
 * hasn't resolved or failed) — callers fall back to the deterministic plan in that case.
 */
export async function readMindPlanCache(): Promise<MindPlanCacheRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(MIND_AI_PLAN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { plan?: MindSessionPlan | null; ts?: number };
    if (typeof o?.ts === "number") {
      return { plan: o.plan ?? null, ts: o.ts };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Stamp cooldown or store composed plan + timestamp.
 */
export async function stampMindPlan(plan?: MindSessionPlan | null): Promise<void> {
  try {
    const data = plan ? { plan, ts: Date.now() } : { ts: Date.now() };
    await AsyncStorage.setItem(MIND_AI_PLAN_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Drop the cached AI Mind session so the next compose regenerates.
 * Safe anywhere (no-op when storage is unavailable).
 */
export async function invalidateMindSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MIND_AI_PLAN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Read cached post-session protocol suggestions.
 */
export async function readMindSuggestionsCache(): Promise<SuggestedAction[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SUGG_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { suggestions?: SuggestedAction[]; ts?: number };
    const fresh = typeof c.ts === "number" && Date.now() - c.ts < SUGG_CACHE_TTL;
    if (!fresh || !Array.isArray(c.suggestions)) return null;
    return c.suggestions;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Write post-session protocol suggestions to cache.
 */
export async function writeMindSuggestionsCache(
  suggestions: SuggestedAction[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SUGG_CACHE_KEY,
      JSON.stringify({ suggestions, ts: Date.now() }),
    );
  } catch {
    // ignore
  }
}

/**
 * Invalidate cached suggestions after a session completes.
 */
export async function invalidateMindSuggestions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SUGG_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Warm a fresh AI Mind session after invalidation (NP-102).
 * Safe anywhere (no-op when storage or precompose is unavailable).
 */
export async function warmMindSession(): Promise<void> {
  try {
    const { precomposeMindSession } = await import("./precompose");
    await precomposeMindSession();
  } catch {
    // ignore
  }
}
