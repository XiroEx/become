import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import {
  readCheckoutFailure,
  readLiveActivityFailure,
  readRestAlertResult,
  type FailureRecord,
  type RestAlertRecord,
} from "@/lib/diagnostics/deviceDiagnostics";
import type { AsyncStorageLike } from "@/lib/query/persistor";

/**
 * DI for tests — production defaults read the live device. `storage` selects
 * the diagnostics rows' backend (AsyncStorage by default); the two probes
 * default to the OS modules below.
 */
export interface DiagnosticsSectionDeps {
  getNotificationPermission?: () => Promise<string>;
  isLiveActivitiesEnabled?: () => Promise<string>;
  storage?: AsyncStorageLike | null;
}

async function defaultNotificationPermission(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as {
      getPermissionsAsync: () => Promise<{
        granted: boolean;
        canAskAgain?: boolean;
      }>;
    };
    const res = await Notifications.getPermissionsAsync();
    if (res.granted) return "granted";
    return res.canAskAgain === false ? "denied" : "undetermined";
  } catch {
    return "unknown";
  }
}

async function defaultLiveActivitiesEnabled(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const widgets = require("expo-widgets") as {
      areActivitiesEnabled?: () => Promise<boolean> | boolean;
    };
    if (typeof widgets.areActivitiesEnabled !== "function") return "unknown";
    return (await widgets.areActivitiesEnabled()) ? "enabled" : "disabled";
  } catch {
    return "unknown";
  }
}

function formatAt(at: number | null): string {
  if (at === null || at === undefined) return "";
  try {
    return ` · ${new Date(at).toLocaleString()}`;
  } catch {
    return "";
  }
}

function liveActivityLine(record: FailureRecord | null): string {
  if (!record || record.reason === null) return "none";
  return `${record.reason}${formatAt(record.at)}`;
}

function restAlertLine(record: RestAlertRecord | null): string {
  if (!record || record.ok === null) return "none";
  if (record.ok) return `scheduled${formatAt(record.at)}`;
  return `${record.reason ?? "failed"}${formatAt(record.at)}`;
}

function checkoutLine(record: FailureRecord | null): string {
  if (!record || record.reason === null) return "none";
  return `${record.reason}${formatAt(record.at)}`;
}

/**
 * DIAGNOSTICS — the device-only failure reasons, readable on the phone.
 *
 * Checkout, Live Activities and the locked-phone rest alert fail silently by
 * design, and a TestFlight build has no readable console. The last reason for
 * each is persisted where it fails (billing, the Live Activity handle, the
 * rest-alert scheduler) and listed here, read live when this mounts. Plain
 * text, muted, small — decoration, never a gate.
 *
 * No Copy button on purpose: `expo-clipboard` is not a dependency, and adding
 * one dependency for a diagnostics convenience is not worth the native module
 * surface.
 */
export function DiagnosticsSection({
  deps,
  testID = "diagnostics-section",
}: {
  deps?: DiagnosticsSectionDeps;
  testID?: string;
} = {}) {
  const [notifications, setNotifications] = useState<string>("…");
  const [liveActivities, setLiveActivities] = useState<string>("…");
  const [liveActivityFailure, setLiveActivityFailure] =
    useState<FailureRecord | null>(null);
  const [restAlert, setRestAlert] = useState<RestAlertRecord | null>(null);
  const [checkout, setCheckout] = useState<FailureRecord | null>(null);

  // The values live outside React (OS permission state, AsyncStorage rows),
  // so they are read in an effect, like every other permission probe.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storage = deps?.storage;
      const [permission, enabled, liveFailure, rest, checkoutFailure] =
        await Promise.all([
          (deps?.getNotificationPermission ?? defaultNotificationPermission)(),
          (deps?.isLiveActivitiesEnabled ?? defaultLiveActivitiesEnabled)(),
          readLiveActivityFailure(storage),
          readRestAlertResult(storage),
          readCheckoutFailure(storage),
        ]);
      if (cancelled) return;
      setNotifications(permission);
      setLiveActivities(enabled);
      setLiveActivityFailure(liveFailure);
      setRestAlert(rest);
      setCheckout(checkoutFailure);
    })();
    return () => {
      cancelled = true;
    };
  }, [deps?.getNotificationPermission, deps?.isLiveActivitiesEnabled, deps?.storage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const rows: { testID: string; label: string; value: string }[] = [
    { testID: "diagnostics-notifications", label: "Notifications", value: notifications },
    { testID: "diagnostics-live-activities", label: "Live Activities", value: liveActivities },
    {
      testID: "diagnostics-live-activity-failure",
      label: "Live Activity last failure",
      value: liveActivityLine(liveActivityFailure),
    },
    {
      testID: "diagnostics-rest-alert",
      label: "Rest alert last schedule",
      value: restAlertLine(restAlert),
    },
    {
      testID: "diagnostics-checkout",
      label: "Checkout last failure",
      value: checkoutLine(checkout),
    },
  ];

  return (
    <View testID={testID} style={{ gap: 4 }}>
      <Text className="text-foreground text-sm font-semibold" style={WRAPPABLE_TEXT}>
        Diagnostics
      </Text>
      {rows.map((row) => (
        <Text
          key={row.testID}
          testID={row.testID}
          className="text-muted-foreground text-xs"
          style={WRAPPABLE_TEXT}
        >
          {`${row.label}: ${row.value}`}
        </Text>
      ))}
    </View>
  );
}

export default DiagnosticsSection;
