import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  fetchAppConfig,
  evaluateVersionGate,
  dismissUpdateBanner,
  openStore,
  type VersionGateDeps,
  type VersionGateState,
} from "@/lib/version/versionGate";
import { UpdateRequiredScreen } from "./UpdateRequiredScreen";
import { UpdateBanner } from "./UpdateBanner";

export interface VersionGateProps {
  children?: ReactNode;
  deps?: VersionGateDeps;
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
}

function subscribeToAppStateDefault(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Minimum-version gate (NP-041).
 *
 * Compares the installed app version against GET /api/app/config:
 *   - At launch and on foreground;
 *   - Below `minVersion`: displays full-screen blocking "Update Become" screen;
 *   - Below `latestVersion`: displays dismissible banner once per version;
 *   - On network error or unset config: does nothing (fails open).
 */
export function VersionGate({
  children,
  deps,
  subscribeToAppState = subscribeToAppStateDefault,
}: VersionGateProps) {
  const [gateState, setGateState] = useState<VersionGateState>({
    isBlocked: false,
    hasUpdate: false,
  });

  const check = useCallback(async () => {
    try {
      const config = await fetchAppConfig(deps);
      const nextState = await evaluateVersionGate(config, deps);
      setGateState(nextState);
    } catch {
      // Network error or other failure: fail open, do nothing
    }
  }, [deps]);

  useEffect(() => {
    // 1. Launch check
    void check();

    // 2. Foreground check
    const unsubscribe = subscribeToAppState((status) => {
      if (status === "active") {
        void check();
      }
    });

    return unsubscribe;
  }, [check, subscribeToAppState]);

  const handleDismiss = useCallback(() => {
    if (gateState.latestVersion) {
      void dismissUpdateBanner(gateState.latestVersion, deps);
    }
    setGateState((prev) => ({ ...prev, hasUpdate: false }));
  }, [gateState.latestVersion, deps]);

  const handleUpdate = useCallback(() => {
    void openStore(gateState.storeUrl, deps);
  }, [gateState.storeUrl, deps]);

  if (gateState.isBlocked) {
    return (
      <UpdateRequiredScreen
        storeUrl={gateState.storeUrl}
        deps={deps}
        onOpenStore={handleUpdate}
      />
    );
  }

  return (
    <>
      {gateState.hasUpdate && gateState.latestVersion && (
        <UpdateBanner
          latestVersion={gateState.latestVersion}
          storeUrl={gateState.storeUrl}
          onUpdate={handleUpdate}
          onDismiss={handleDismiss}
        />
      )}
      {children}
    </>
  );
}
