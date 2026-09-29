import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { healthOptInSecureStore } from "@/lib/auth/secureStoreToken";
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
}: HealthSyncSectionProps) {
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
    },
    [switchStore],
  );

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
