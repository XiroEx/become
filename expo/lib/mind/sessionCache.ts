import AsyncStorage from "@react-native-async-storage/async-storage";

export const MIND_AI_PLAN_KEY = "mind-ai-plan";

/**
 * Drop the cached AI session so the next compose regenerates fresh.
 * Called when logging workouts or meals to keep the Mind context current (NP-102).
 */
export async function invalidateMindSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MIND_AI_PLAN_KEY);
  } catch {
    // Storage failure should never crash the caller
  }
}
