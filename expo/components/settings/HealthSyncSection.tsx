import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { healthOptInSecureStore } from "@/lib/auth/secureStoreToken";
import { HEALTH_SYNC_ENABLED } from "@/lib/health/enabled";
import {
  createHealthOptInStore,
  type HealthOptInStore,
} from "@/lib/health/opt-in";

export interface HealthSyncSectionProps {
  /**
   * Where the opt-in is persisted. Omitted → `healthOptInSecureStore`
   * (`become.optin.health`). It is NOT the session key: that is the whole
   * point — turning this on used to write "yes" over the member's JWT.
   */
  store?: HealthOptInStore;
}

/**
 * "Sync from Health" — hidden until NP-185 installs a real HealthKit /
 * Health Connect module.
 *
 * The gate is the OUTER component, which holds no hooks, so nothing about the
 * toggle (including its read of SecureStore on mount) runs while the section
 * is off. Flip `HEALTH_SYNC_ENABLED` in NP-185 and this comes back.
 */
export function HealthSyncSection(props: HealthSyncSectionProps) {
  if (!HEALTH_SYNC_ENABLED) return null;
  return <HealthSyncSectionBody {...props} />;
}

function HealthSyncSectionBody({ store }: HealthSyncSectionProps) {
  const [optInStore] = useState<HealthOptInStore>(
    () => store ?? createHealthOptInStore(healthOptInSecureStore),
  );
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await optInStore.isOptedIn();
      if (!cancelled) {
        setEnabled(initial);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optInStore]);

  const handleToggle = async (next: boolean): Promise<void> => {
    setEnabled(next);
    await optInStore.setOptedIn(next);
  };

  return (
    <View testID="health-sync-section" style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        className="text-foreground text-2xl font-bold mt-2"
      >
        Health sync
      </Text>
      <Text className="text-muted-foreground text-sm">
        Sync weight and steps with Apple Health (iOS) or Health Connect
        (Android). You choose what Become may read and what it may write.
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
    </View>
  );
}
