/**
 * THE LOCK — what a free member at a cap sees instead of a create control.
 *
 * Web equivalents: the `Lock` branch of `ExerciseLibraryClient`'s create button
 * and `components/TierGate.tsx`. The words are not written here: they come from
 * `syntheticGate` + `allowanceLine` in `@become/core`, the same functions the
 * web renders, so a device and a browser cannot explain a cap differently.
 *
 * Three rules, and all three are one line each:
 *
 *   • `enforced === false` (or an unknown snapshot) renders NOTHING. The
 *     launch-day contract: the app must look exactly as it did before any of
 *     this shipped.
 *   • `canCreate` is READ, never recomputed from `limit` and `used`. `allowed`
 *     is deliberately true for a capped free member, so a lock wired to it
 *     would also lock the edit and delete they need to get back under the cap.
 *   • it is EXPLANATORY. The route refuses independently; this only stops
 *     someone walking into an action that would 403.
 *
 * `onPress` hands the gate — the same `GatePayload` shape a 403 produces — to
 * whatever raises the upgrade sheet (NP-052). Without it the lock is a
 * non-interactive explanation, which is still better than a dead button.
 */

import { Pressable, View } from "react-native";
import { Lock } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  FEATURE_LABELS,
  allowanceLine,
  syntheticGate,
  tierLabel,
  useEntitlements,
  type Feature,
  type GatePayload,
} from "@/lib/entitlements";

export interface AllowanceLockProps {
  feature: Feature;
  /** Raise the upgrade sheet for this gate. Omit for a plain explanation. */
  onPress?: (gate: GatePayload) => void;
  testID?: string;
}

export function AllowanceLock({
  feature,
  onPress,
  testID = "allowance-lock",
}: AllowanceLockProps) {
  const { colors } = useThemeTokens();
  const { data, feature: entitlementFor } = useEntitlements();

  // The switch is off, or nothing is known yet: no lock, ever.
  if (!data || data.enforced === false) return null;

  const entitlement = entitlementFor(feature);
  // Unknown feature, or they may still create one — read `canCreate`.
  if (!entitlement || entitlement.canCreate) return null;

  const gate = syntheticGate(
    feature,
    entitlement.requiresTier ?? "plus",
    entitlement,
  );
  const line = allowanceLine(gate);

  const body = (
    <View
      testID={testID}
      className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
        <Lock size={18} color={colors["muted-foreground"]} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground text-sm font-semibold">
            {FEATURE_LABELS[feature]}
          </Text>
          <Text
            testID={`${testID}-tier`}
            className="text-primary text-[10px] font-semibold uppercase"
          >
            {tierLabel(gate.requiresTier)}
          </Text>
        </View>
        <Text
          testID={`${testID}-headline`}
          className="text-muted-foreground mt-1 text-xs"
        >
          {gate.error}
        </Text>
        {line ? (
          <Text
            testID={`${testID}-allowance`}
            className="text-muted-foreground mt-1 text-xs"
          >
            {line}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      testID={`${testID}-press`}
      accessibilityRole="button"
      accessibilityLabel={gate.error}
      onPress={() => onPress(gate)}
    >
      {body}
    </Pressable>
  );
}

export default AllowanceLock;
