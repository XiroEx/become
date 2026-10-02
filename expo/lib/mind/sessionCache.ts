import AsyncStorage from "@react-native-async-storage/async-storage";

export const MIND_AI_PLAN_KEY = "mind-ai-plan";

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
 * Warm a fresh AI Mind session after invalidation (NP-102).
 * Safe anywhere (no-op when storage or precompose is unavailable).
 */
export async function warmMindSession(): Promise<void> {
  // NP-102 precomposes AI Mind sessions in the background.
}
