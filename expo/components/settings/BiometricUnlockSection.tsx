import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/Text";
import { Toggle } from "@/components/Toggle";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { biometricsOptInSecureStore } from "@/lib/auth/secureStoreToken";
import {
  createBiometricsOptInStore,
  type BiometricsCapability,
  type BiometricsOptInStore,
} from "@/lib/auth/biometrics";
import {
  describeBiometricWording,
  getSupportedAuthenticationTypes,
  realBiometricsCapability,
  type BiometricWording,
} from "@/lib/auth/localAuthentication";

export interface BiometricUnlockSectionProps {
  /**
   * Where the opt-in is persisted. Omitted → `biometricsOptInSecureStore`
   * (`become.optin.biometrics`). It is NOT the session key: that is the whole
   * point — the unlock flow clears the session on a failed check, so the two
   * must never collide.
   */
  store?: BiometricsOptInStore;
  /**
   * Whether this phone can honour the switch. Omitted → probed from
   * `biometrics` (`hasHardware() && isEnrolled()`). Pass this to skip the
   * probe (used by tests); the app itself always omits it so a real phone's
   * hardware/enrollment state drives the copy and the confirm-prompt below.
   */
  available?: boolean;
  /**
   * The capability used to probe availability, read the supported
   * authentication kinds for wording, and confirm a turn-on with a real
   * prompt. Defaults to `realBiometricsCapability`. DI point for tests.
   */
  biometrics?: BiometricsCapability;
  /** DI for tests. Defaults to the real OS platform (`Platform.OS`). */
  platformOS?: string;
  /** DI for tests. Defaults to the real module query. */
  getSupportedTypes?: () => Promise<number[]>;
}

export const BIOMETRIC_CONFIRM_REASON = "Confirm it's you to turn this on";

/**
 * "Unlock with Face ID" (or "fingerprint" / "Touch ID" / "biometrics",
 * depending on the device) — the biometric-unlock opt-in (NP-187).
 *
 * The switch writes `become.optin.biometrics` (`"yes"` when on, absent when
 * off). With it on, reopening the app asks for Face ID / fingerprint with a
 * fallback to the device passcode; failing both signs the member out. With it
 * off — or on a phone without biometrics enrolled — the app opens without a
 * prompt. Device verification is deferred to NP-008.
 *
 * Two things George's 2026-10-06 QA pass asked for, both unit-tested here:
 * - **Platform wording.** The label, hint and accessibility strings read
 *   "Face ID" / "Touch ID" on iOS and "fingerprint" / "face unlock" /
 *   "biometrics" on Android, picked from `supportedAuthenticationTypesAsync`
 *   rather than a hardcoded iOS string (`describeBiometricWording`).
 * - **Confirm on turn-on.** Switching the toggle ON triggers a real biometric
 *   prompt immediately — so a member without anything enrolled learns it
 *   right away instead of the switch silently turning on. A failed confirm
 *   (both biometric AND passcode) reverts the switch without writing the
 *   opt-in; a device the probe found unavailable has nothing to confirm, so
 *   it writes through directly, same as before.
 */
export function BiometricUnlockSection(props: BiometricUnlockSectionProps) {
  const [optInStore] = useState<BiometricsOptInStore>(
    () => props.store ?? createBiometricsOptInStore(biometricsOptInSecureStore),
  );
  const biometrics = props.biometrics ?? realBiometricsCapability;
  const platformOS = props.platformOS ?? Platform.OS;
  const getSupportedTypes = props.getSupportedTypes ?? getSupportedAuthenticationTypes;

  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [available, setAvailable] = useState<boolean>(props.available ?? true);
  const [wording, setWording] = useState<BiometricWording>(() =>
    describeBiometricWording([], platformOS),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [initial, hasHardware, isEnrolled, supportedTypes] =
        await Promise.all([
          optInStore.isOptedIn(),
          biometrics.hasHardware(),
          biometrics.isEnrolled(),
          getSupportedTypes(),
        ]);
      if (cancelled) return;
      setEnabled(initial);
      if (props.available === undefined) {
        setAvailable(hasHardware && isEnrolled);
      }
      setWording(describeBiometricWording(supportedTypes, platformOS));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // `props.available` is read once above (its presence, not its value,
    // decides whether the probe runs) — including it would re-probe on every
    // render of a caller that passes a literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optInStore, biometrics, getSupportedTypes, platformOS]);

  const handleToggle = useCallback(
    async (next: boolean): Promise<void> => {
      if (!next) {
        setEnabled(false);
        await optInStore.setOptedIn(false);
        return;
      }

      // Turning ON. Optimistic — reverted below on a failed confirm.
      setEnabled(true);

      // Nothing to confirm on a device the probe found unavailable (no
      // hardware, or nothing enrolled): enabling here changes nothing until
      // the member enrolls, exactly as the cold-open flow already degrades.
      if (!available) {
        await optInStore.setOptedIn(true);
        return;
      }

      // Confirm immediately with a real prompt rather than silently
      // enabling (George, 2026-10-06 QA) — a member without anything
      // enrolled, or who fails the check, finds out right away.
      setConfirming(true);
      try {
        const result = await biometrics.authenticate({
          reason: BIOMETRIC_CONFIRM_REASON,
        });
        if (result.success) {
          await optInStore.setOptedIn(true);
        } else {
          setEnabled(false);
        }
      } finally {
        setConfirming(false);
      }
    },
    [optInStore, biometrics, available],
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
            {`Unlock with ${wording.label}`}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {available
              ? `Ask for ${wording.noun} or your passcode when you reopen Become. Failing both signs you out.`
              : `This phone has no ${wording.noun} enrolled, so turning this on changes nothing until you enroll one.`}
          </Text>
        </View>
        <Toggle
          testID="biometric-unlock-toggle"
          value={enabled}
          onValueChange={(v) => {
            void handleToggle(v);
          }}
          disabled={loading || confirming}
          accessibilityLabel={`Unlock with ${wording.label}`}
          accessibilityHint={`Asks for ${wording.noun} or the device passcode when reopening Become`}
        />
      </View>
    </View>
  );
}
