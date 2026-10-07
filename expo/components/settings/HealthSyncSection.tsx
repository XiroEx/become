import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { Button } from "@/components/Button";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { healthOptInSecureStore } from "@/lib/auth/secureStoreToken";
import { isHealthSyncEnabled } from "@/lib/health/enabled";
import { getHealthClient } from "@/lib/health/client";
import {
  createHealthOptInStore,
  type HealthOptInStore,
} from "@/lib/health/opt-in";
import {
  HEALTH_SWITCHES_OFF,
  healthSwitchStore as realHealthSwitchStore,
  type HealthSwitchStore,
  type HealthSwitches,
} from "@/lib/health/switches";
import { hasPermission, type HealthClient, type HealthPermission } from "@/lib/health/types";

/** Which Health Connect permissions one direction's toggle justifies. */
function permissionsForDirection(
  direction: "read" | "write",
): HealthPermission[] {
  return direction === "read"
    ? [{ metric: "weight", direction: "read" }]
    : [
        { metric: "weight", direction: "write" },
        { metric: "workouts", direction: "write" },
      ];
}

export interface HealthSyncSectionProps {
  /**
   * Where the umbrella opt-in is persisted. Omitted → `healthOptInSecureStore`
   * (`become.optin.health`). It is NOT the session key: that is the whole
   * point — turning this on used to write "yes" over the member's JWT.
   */
  store?: HealthOptInStore;
  /**
   * Where the two direction switches are persisted. Omitted → the real
   * `become.sync.health.{read,write}` keys.
   */
  switches?: HealthSwitchStore;
  /** Defaults to the device's platform; a parameter so tests can ask for both. */
  platform?: string;
  /**
   * The health client asked for permission when a direction is turned on.
   * Omitted → `getHealthClient()`. A parameter so tests can ask for a
   * specific outcome (granted / denied / no module at all) without a real
   * Health Connect.
   */
  client?: HealthClient | null;
}

/**
 * "Health sync" — the umbrella opt-in and one switch per DIRECTION.
 *
 * The gate is the OUTER component, which holds no hooks, so nothing about the
 * toggles (including their read of SecureStore on mount) runs on a platform with
 * no health module. That is Android-on / iOS-off today
 * (`lib/health/enabled.ts`): NP-199 wired Health Connect, NP-185 wires HealthKit.
 *
 * Each direction is a separate answer because each is a separate permission and
 * a separate risk: importing a weigh-in a scale recorded is not the same
 * decision as handing Become's data to the platform store. And both are read
 * ONCE at launch, so turning one off here stops it the next time the app opens —
 * which is what the copy below says, and why it says it.
 */
export function HealthSyncSection(props: HealthSyncSectionProps) {
  const platform = props.platform ?? Platform.OS;
  if (!isHealthSyncEnabled(platform)) return null;
  return <HealthSyncSectionBody {...props} platform={platform} />;
}

/** What the member's phone calls the thing Become is syncing with. */
function storeName(platform: string): string {
  return platform === "ios" ? "Apple Health" : "Health Connect";
}

function HealthSyncSectionBody({
  store,
  switches,
  platform = Platform.OS,
  client,
}: HealthSyncSectionProps) {
  const [optInStore] = useState<HealthOptInStore>(
    () => store ?? createHealthOptInStore(healthOptInSecureStore),
  );
  const [switchStore] = useState<HealthSwitchStore>(
    () => switches ?? realHealthSwitchStore,
  );
  const [healthClient] = useState<HealthClient | null>(
    () => (client !== undefined ? client : getHealthClient()),
  );
  const [enabled, setEnabled] = useState<boolean>(false);
  const [directions, setDirections] = useState<HealthSwitches>(
    HEALTH_SWITCHES_OFF,
  );
  const [loading, setLoading] = useState<boolean>(true);
  // NP-337: which direction(s) Become asked for and did NOT get. Turning a
  // direction on used to write the switch and wait for the next cold start
  // to find out — silently, with no way to tell the member it was refused
  // or to send them anywhere to fix it.
  const [denied, setDenied] = useState<HealthSwitches>(HEALTH_SWITCHES_OFF);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [initial, initialDirections] = await Promise.all([
        optInStore.isOptedIn(),
        switchStore.load(),
      ]);
      if (!cancelled) {
        setEnabled(initial);
        setDirections(initialDirections);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optInStore, switchStore]);

  const handleToggle = useCallback(
    async (next: boolean): Promise<void> => {
      setEnabled(next);
      await optInStore.setOptedIn(next);
    },
    [optInStore],
  );

  const handleDirection = useCallback(
    async (direction: "read" | "write", next: boolean): Promise<void> => {
      setDirections((prev) => ({ ...prev, [direction]: next }));
      await switchStore.set(direction, next);
      if (!next) {
        // Turning OFF asks nothing — and a denial from an earlier ON no
        // longer describes anything the member can act on.
        setDenied((prev) => ({ ...prev, [direction]: false }));
        return;
      }
      // NP-337: ask RIGHT NOW instead of waiting for the next cold start.
      // The switch itself still only takes effect at the next launch (the
      // snapshot architecture in `lib/health/switches.ts` — unchanged), but
      // the OS permission is a separate question the member should not have
      // to relaunch the app to even be asked.
      if (!healthClient?.ensurePermissions) return;
      const wanted = permissionsForDirection(direction);
      try {
        const granted = await healthClient.ensurePermissions(wanted);
        const allGranted = wanted.every((p) => hasPermission(granted, p));
        setDenied((prev) => ({ ...prev, [direction]: !allGranted }));
      } catch {
        setDenied((prev) => ({ ...prev, [direction]: true }));
      }
    },
    [switchStore, healthClient],
  );

  const openHealthSettings = useCallback((): void => {
    healthClient?.openSettings?.();
  }, [healthClient]);

  const name = storeName(platform);

  return (
    <View testID="health-sync-section" style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        className="text-foreground text-2xl font-bold mt-2"
      >
        Health sync
      </Text>
      <Text className="text-muted-foreground text-sm">
        Sync weight and workouts with {name}. You choose what Become may read
        and what it may write, and either can be turned off on its own.
      </Text>
      <View
        testID="health-toggle-row"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          borderRadius: 12,
        }}
        className="bg-card border border-border"
      >
        {/* The row's label wraps instead of shoving the switch off the edge at
            the largest Dynamic Type size — a Text in a flex row has
            flexShrink: 0 by default. */}
        <Text style={WRAPPABLE_TEXT} className="text-foreground">
          Sync from Health
        </Text>
        <Toggle
          testID="health-toggle"
          value={enabled}
          onValueChange={(v) => {
            void handleToggle(v);
          }}
          disabled={loading}
          accessibilityLabel="Sync from Health"
        />
      </View>

      {enabled ? (
        <View testID="health-directions" style={{ gap: 8 }}>
          <View
            testID="health-read-row"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 12,
              borderRadius: 12,
            }}
            className="bg-card border border-border"
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text className="text-foreground">Read weight from {name}</Text>
              <Text className="text-muted-foreground text-xs">
                Weigh-ins recorded by your scale or another app appear in
                Become.
              </Text>
            </View>
            <Toggle
              testID="health-read-toggle"
              value={directions.read}
              onValueChange={(v) => {
                void handleDirection("read", v);
              }}
              disabled={loading}
              accessibilityLabel={`Read weight from ${name}`}
            />
          </View>
          {denied.read ? (
            <DeniedNotice
              testID="health-read-denied"
              name={name}
              onOpenSettings={openHealthSettings}
              canOpenSettings={!!healthClient?.openSettings}
            />
          ) : null}

          <View
            testID="health-write-row"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 12,
              borderRadius: 12,
            }}
            className="bg-card border border-border"
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text className="text-foreground">
                Write weight and workouts to {name}
              </Text>
              <Text className="text-muted-foreground text-xs">
                Weigh-ins you log here and workouts you finish are written back.
              </Text>
            </View>
            <Toggle
              testID="health-write-toggle"
              value={directions.write}
              onValueChange={(v) => {
                void handleDirection("write", v);
              }}
              disabled={loading}
              accessibilityLabel={`Write weight and workouts to ${name}`}
            />
          </View>
          {denied.write ? (
            <DeniedNotice
              testID="health-write-denied"
              name={name}
              onOpenSettings={openHealthSettings}
              canOpenSettings={!!healthClient?.openSettings}
            />
          ) : null}

          {/* Said plainly because it is true, and because the platform works the
              same way: Health Connect's own permission revocation does not take
              effect until the app restarts. */}
          <Text testID="health-next-launch-note" className="text-muted-foreground text-xs">
            Changes take effect the next time you open Become.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * NP-337: the denied state a direction's toggle used to have none of — it
 * just stayed ON with nothing to show for it and no way out besides
 * guessing to dig through the OS Settings app unprompted.
 */
function DeniedNotice({
  testID,
  name,
  onOpenSettings,
  canOpenSettings,
}: {
  testID: string;
  name: string;
  onOpenSettings: () => void;
  canOpenSettings: boolean;
}) {
  return (
    <View
      testID={testID}
      className="bg-card border border-destructive"
      style={{ borderRadius: 12, padding: 12, gap: 8 }}
    >
      <Text style={WRAPPABLE_TEXT} className="text-destructive text-xs">
        {`${name} did not grant this permission. Become cannot sync this direction until you allow it.`}
      </Text>
      {canOpenSettings ? (
        <Button
          testID={`${testID}-open-settings`}
          size="sm"
          variant="destructive-outline"
          onPress={onOpenSettings}
          accessibilityHint={`Opens ${name}'s own app settings`}
        >
          {`Open ${name}`}
        </Button>
      ) : null}
    </View>
  );
}
