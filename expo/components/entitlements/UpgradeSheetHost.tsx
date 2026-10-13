/**
 * ─── THE ONE MOUNT POINT FOR THE UPGRADE SHEET (NP-052) ───────────────────────
 *
 * Mounted ONCE, at the root (`app/_layout.tsx`), above every route. It renders
 * nothing until something calls `showUpgradeSheet(gate)`.
 *
 * Why here and not inside each screen: a gate is not always raised by the screen
 * that is on top. `routeApiError` turns a 403 into a sheet from code that renders
 * nothing — the AI run client, the offline queue replay — and a refusal can land
 * after the screen that asked for it has gone. A per-screen sheet would be
 * unmounted exactly when it was needed, and five screens each mounting their own
 * would be five sheets racing to appear.
 *
 * It sits above the navigator for the same reason `ConnectivityBanner` does: it
 * must outlive any one route.
 */

import { useCallback, useSyncExternalStore } from "react";
import { UpgradeSheet } from "@/components/entitlements/UpgradeSheet";
import type { BillingDeps } from "@/lib/entitlements/billing";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
  subscribeToUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";

export interface UpgradeSheetHostProps {
  /** Network / session / browser injection for the sheet. Tests only. */
  deps?: BillingDeps;
}

export function UpgradeSheetHost({ deps }: UpgradeSheetHostProps = {}) {
  const gate = useSyncExternalStore(
    subscribeToUpgradeSheet,
    getUpgradeSheetGate,
    getUpgradeSheetGate,
  );

  const onClose = useCallback(() => {
    hideUpgradeSheet();
  }, []);

  // `gate === null` is the closed sheet, and `UpgradeSheet` renders null for it —
  // so this costs nothing until a gate arrives.
  return (
    <UpgradeSheet
      open={gate !== null}
      gate={gate}
      onClose={onClose}
      {...(deps ? { deps } : {})}
    />
  );
}

export default UpgradeSheetHost;
