import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { biometricsOptInSecureStore } from "@/lib/auth/secureStoreToken";
import {
  createBiometricsOptInStore,
  type BiometricsOptInStore,
} from "@/lib/auth/biometrics";

export interface BiometricUnlockSectionProps {
  /**
   * Where the opt-in is persisted. Omitted → `biometricsOptInSecureStore`
   * (`become.optin.biometrics`). It is NOT the session key: that is the whole
   * point — the unlock flow clears the session on a failed check, so the two
   * must never collide.
   */
  store?: BiometricsOptInStore;
  /**
   * Whether this phone can honour the switch. Omitted → true (the switch is
   * always offered; a phone without Face ID enrolled simply never prompts).
   * The app passes the real capability probe here.
   */
  available?: boolean;
}

/**
 * "Unlock with Face ID" — the biometric-unlock opt-in (NP-187).
 *
 * The switch writes `become.optin.biometrics` (`"yes"` when on, absent when
 * off). With it on, reopening the app asks for Face ID / fingerprint with a
 * fallback to the device passcode; failing both signs the member out. With it
 * off — or on a phone without biometrics enrolled — the app opens without a
 * prompt. Device verification is deferred to NP-008.
 */
export function BiometricUnlockSection(props: BiometricUnlockSectionProps) {
  const [optInStore] = useState<BiometricsOptInStore>(
    () => props.store ?? createBiometricsOptInStore(biometricsOptInSecureStore),
  );
  const available = props.available ?? true;
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

  const handleToggle = useCallback(
    async (next: boolean): Promise<void> => {
      setEnabled(next);
      await optInStore.setOptedIn(next);
    },
    [optInStore],
  );

  return (
    <View
      testID="settings-security-section"
      className="rounded-xl border border-border bg-card p-4"
      style={{ gap: 12 }}
    >
      <Text
        accessibilityRole="header"
        className="text-foreground text-base font-semibold"
      >
        Security
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          {/* The row's label wraps instead of shoving the switch off the edge at
              the largest Dynamic Type size — a Text in a flex row has
              flexShrink: 0 by default. */}
          <Text style={WRAPPABLE_TEXT} className="text-foreground font-medium text-sm">
            Unlock with Face ID
          </Text>
          <Text className="text-muted-foreground text-xs">
            {available
              ? "Ask for Face ID or your passcode when you reopen Become. Failing both signs you out."
              : "This phone has no Face ID or fingerprint enrolled, so turning this on changes nothing until you enroll one."}
          </Text>
        </View>
        <Toggle
          testID="biometric-unlock-toggle"
          value={enabled}
          onValueChange={(v) => {
            void handleToggle(v);
          }}
          disabled={loading}
          accessibilityLabel="Unlock with Face ID"
          accessibilityHint="Asks for Face ID or the device passcode when reopening Become"
        />
      </View>
    </View>
  );
}
