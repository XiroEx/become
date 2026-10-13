import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { precomposeMindSession } from "@/lib/mind/precompose";

export interface MindSessionWarmerProps {
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** The precompose function (DI for tests). */
  precompose?: () => Promise<unknown>;
  /** Delay before initial mount warm in ms (default 1200). */
  initialDelayMs?: number;
}

function subscribeToAppStateDefault(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Warms the AI Mind session in the background on APP OPEN and when returning
 * to the foreground (AppState 'active') (NP-102).
 *
 * Runs as a silent run through the AI client (runAiTask with silent: true).
 * Does not block any UI.
 */
export function MindSessionWarmer({
  subscribeToAppState = subscribeToAppStateDefault,
  precompose = precomposeMindSession,
  initialDelayMs = 1200,
}: MindSessionWarmerProps = {}): null {
  useEffect(() => {
    // Launch/mount warm (deferred so it doesn't compete with critical first paint)
    const t = setTimeout(() => {
      void precompose();
    }, initialDelayMs);

    const unsubscribe = subscribeToAppState((status) => {
      if (status === "active") {
        void precompose();
      }
    });

    return () => {
      clearTimeout(t);
      unsubscribe();
    };
  }, [precompose, subscribeToAppState, initialDelayMs]);

  return null;
}
