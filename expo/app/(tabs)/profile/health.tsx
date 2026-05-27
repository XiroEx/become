import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Toggle } from "@/components/Toggle";
import { createHealthOptInStore } from "@/lib/health/opt-in";

/**
 * Profile → Health opt-in toggle. Real platform health flow (permission probe
 * + sync) lands in a follow-up once a dev build with react-native-health and
 * react-native-health-connect is provisioned. P16 ships the persistence layer
 * and the toggle UI.
 */
export default function HealthSettingsRoute() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [store] = useState(() => createHealthOptInStore());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await store.isOptedIn();
      if (!cancelled) {
        setEnabled(initial);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const handleToggle = async (next: boolean): Promise<void> => {
    setEnabled(next);
    await store.setOptedIn(next);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="health-settings-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Health sync</Text>
        <Text className="text-muted-foreground text-sm">
          Read weight + steps from Apple Health (iOS) or Health Connect
          (Android). Become only reads — we never write.
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
          <Text className="text-foreground">Sync from Health</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}
