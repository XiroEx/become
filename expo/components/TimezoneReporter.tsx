import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  reportTimezoneOnAppOpen,
  type ReportTimezoneDeps,
  type ReportTimezoneResult,
} from "@/lib/timezone/reportTimezone";

export interface TimezoneReporterProps {
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** The report itself (DI for tests). */
  report?: (deps?: ReportTimezoneDeps) => Promise<ReportTimezoneResult>;
}

function subscribeToAppStateDefault(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Renders nothing. Reports the device's timezone to POST /api/me/timezone on
 * LAUNCH and on the first FOREGROUND of a new local day — the day gate lives in
 * lib/timezone/reportTimezone.ts, so every other resume costs nothing.
 *
 * Why it is at the root and not on a screen: the member this exists for is the
 * one who only logs food or only runs Mind sessions. Until now a workout save
 * was the single thing that recorded a zone, and the notify cron skips a member
 * who has none — so they were unreachable by every reminder the app sells.
 */
export function TimezoneReporter({
  subscribeToAppState = subscribeToAppStateDefault,
  report = reportTimezoneOnAppOpen,
}: TimezoneReporterProps = {}): null {
  useEffect(() => {
    // Launch: the gate is process memory, so a cold start always reports.
    void report();
    const unsubscribe = subscribeToAppState((status) => {
      if (status === "active") void report();
    });
    return unsubscribe;
  }, [report, subscribeToAppState]);
  return null;
}
