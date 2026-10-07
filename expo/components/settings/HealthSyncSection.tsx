import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { healthOptInSecureStore } from "@/lib/auth/secureStoreToken";
import { getHealthClient } from "@/lib/health/client";
import { isHealthSyncEnabled } from "@/lib/health/enabled";
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
import {
  hasPermission,
  type HealthClient,
  type HealthPermission,
} from "@/lib/health/types";

export interface HealthSyncSectionProps {
  /**
   * Where the umbrella opt-in is persisted. Omitted → `healthOptInSecureStore`
   * (`become.optin.health`). It is NOT the session key: that is the whole
   * point — turning this on used to write "yes" over the member's JWT.\n   */
  store?: HealthOptInStore;
  /**
   * Where the two direction switches are persisted. Omitted → the real
   * `become.sync.health.{read,write}` keys.
   */
  switches?: HealthSwitchStore;
  /** Defaults to the device's platform; a parameter so tests can ask for both. */
  platform?: string;
  /** Injected health client (tests only). Defaults to `getHealthClient()`. */
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
  client: clientProp,
}: HealthSyncSectionProps) {
  const client = clientProp !== undefined ? clientProp : getHealthClient();
  const [optInStore] = useState<HealthOptInStore>(
    () => store ?? createHealthOptInStore(healthOptInSecureStore),
  );
  const [switchStore] = useState<HealthSwitchStore>(
    () => switches ?? realHealthSwitchStore,
  );
  const [enabled, setEnabled] = useState<boolean>(false);
  const [directions, setDirections] = useState<HealthSwitches>(
    HEALTH_SWITCHES_OFF,
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [readDenied, setReadDenied] = useState<boolean>(false);
  const [writeDenied, setWriteDenied] = useState<boolean>(false);

  const checkPermissions = useCallback(async () => {
    if (!client?.getGrantedPermissions) return;
    try {
      const granted = await client.getGrantedPermissions();
      setReadDenied(!hasPermission(granted, { metric: "weight", direction: "read" }));
      setWriteDenied(
        !hasPermission(granted, { metric: "weight", direction: "write" }) &&
        !hasPermission(granted, { metric: "workouts", direction: "write" }),
      );
    } catch {
      // ignore
    }
  }, [client]);

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
        if (client?.getGrantedPermissions) {
          try {
            const granted = await client.getGrantedPermissions();
            if (!cancelled) {
              setReadDenied(
                !hasPermission(granted, { metric: "weight", direction: "read" }),
              );
              setWriteDenied(
                !hasPermission(granted, { metric: "weight", direction: "write" }) &&
                !hasPermission(granted, { metric: "workouts", direction: "write" }),
              );
            }
          } catch {
            // ignore
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, optInStore, switchStore]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkPermissions();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [checkPermissions]);

  const handleToggle = useCallback(
    async (next: boolean): Promise<void> => {
      setEnabled(next);
      await optInStore.setOptedIn(next);
      if (next && (directions.read || directions.write) && client?.ensurePermissions) {
        const wanted: HealthPermission[] = [];
        if (directions.read) wanted.push({ metric: "weight", direction: "read" });
        if (directions.write) {
          wanted.push(
            { metric: "weight", direction: "write" },
            { metric: "workouts", direction: "write" },
          );
        }
        try {
          const granted = await client.ensurePermissions(wanted);
          if (directions.read) {
            setReadDenied(!hasPermission(granted, { metric: "weight", direction: "read" }));
          }
          if (directions.write) {
            setWriteDenied(
              !hasPermission(granted, { metric: "weight", direction: "write" }) &&
              !hasPermission(granted, { metric: "workouts", direction: "write" }),
            );
          }
        } catch {
          // ignore
        }
      }
    },
    [client, directions, optInStore],
  );

  const handleDirection = useCallback(
    async (direction: "read" | "write", next: boolean): Promise<void> => {
      if (next) {
        const wanted: HealthPermission[] =
          direction === "read"
            ? [{ metric: "weight", direction: "read" }]
            : [
                { metric: "weight", direction: "write" },
                { metric: "workouts", direction: "write" },
              ];
        let granted: HealthPermission[] = [];
        if (client?.ensurePermissions) {
          try {
            granted = await client.ensurePermissions(wanted);
          } catch {
            granted = [];
          }
        }
        const isGranted = wanted.some((w) => hasPermission(granted, w));
        if (direction === "read") {
          setReadDenied(!isGranted);
        } else {
          setWriteDenied(!isGranted);
        }
      } else {
        if (direction === "read") setReadDenied(false);
        if (direction === "write") setWriteDenied(false);
      }
      setDirections((prev) => ({ ...prev, [direction]: next }));
      await switchStore.set(direction, next);
    },
    [client, switchStore],
  );

  const handleOpenSettings = useCallback(() => {
    if (client?.openSettings) {
      client.openSettings();
    } else {
      void Linking.openSettings();
    }
  }, [client]);

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
              {directions.read && readDenied ? (
                <View
                  testID="health-read-denied"
                  style={{ marginTop: 6, gap: 4 }}
                >
                  <Text className="text-destructive text-xs font-medium">
                    Permission denied in {name}
                  </Text>
                  <Pressable
                    testID="health-read-open-settings"
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${name}`}
                    onPress={handleOpenSettings}
                    style={minTouchTarget}
                  >
                    <Text className="text-primary text-xs font-semibold underline">
                      Open {name}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
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
              {directions.write && writeDenied ? (
                <View
                  testID="health-write-denied"
                  style={{ marginTop: 6, gap: 4 }}
                >
                  <Text className="text-destructive text-xs font-medium">
                    Permission denied in {name}
                  </Text>
                  <Pressable
                    testID="health-write-open-settings"
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${name}`}
                    onPress={handleOpenSettings}
                    style={minTouchTarget}
                  >
                    <Text className="text-primary text-xs font-semibold underline">
                      Open {name}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
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
