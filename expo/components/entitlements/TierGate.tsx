/**
 * ─── THE WHOLE-SURFACE GATE (NP-052) ──────────────────────────────────────────
 *
 * Native port of `webapp/components/TierGate.tsx`. Wrap a surface a free member
 * may SEE but not USE — today that is Vision, which the product wants visible as
 * a teaser rather than hidden.
 *
 * This is an EXPLANATORY lock, not a security boundary: the routes behind it
 * refuse independently (`app/api/mind/vision` POST + PATCH). Its whole job is to
 * stop someone walking into a screen whose every action would 403.
 *
 * Three rules, the same three as `AllowanceLock` beside it:
 *
 *   • `enforced === false` — or an unknown snapshot — renders the CHILDREN. The
 *     launch-day contract is that the app looks exactly as it did before any of
 *     this shipped, and a gate that fails closed on a network blip locks a
 *     member out of a feature the server would have allowed.
 *   • the gate is `allowed`, read off the snapshot, never recomputed. For a
 *     whole-surface feature `allowed` is the right field (unlike a create cap,
 *     where `canCreate` is) — a free member is not allowed into Vision at all.
 *   • the words are not written here. `syntheticGate` + `featureHeadline` +
 *     `allowanceLine` come from `@become/core`, the same module the web renders,
 *     so a phone and a browser cannot explain the same lock differently.
 *
 * Not to be confused with the admin-only "Coming Soon" guard for sections that do
 * not exist yet; that is a different thing on both platforms.
 */

import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Lock } from "lucide-react-native";
import { Text } from "@/components/Text";
import { UpgradeSheet } from "@/components/entitlements/UpgradeSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  FEATURE_LABELS,
  syntheticGate,
  tierLabel,
  useEntitlements,
  type Feature,
  type GatePayload,
  type Tier,
} from "@/lib/entitlements";
import type { BillingDeps } from "@/lib/entitlements/billing";

export interface TierGateProps {
  feature: Feature;
  children: ReactNode;
  /** Replace the default locked card. Receives the tier being asked for. */
  teaser?: (ctx: { requiresTier: Tier; open: () => void }) => ReactNode;
  /** Optional blurb under the default teaser's title. */
  description?: string;
  /** Network / browser injection for the sheet this raises. Tests only. */
  deps?: BillingDeps;
  testID?: string;
}

export function TierGate({
  feature,
  children,
  teaser,
  description,
  deps,
  testID = "tier-gate",
}: TierGateProps) {
  const { colors } = useThemeTokens();
  const { data, loading, feature: entitlementFor } = useEntitlements();
  const [gate, setGate] = useState<GatePayload | null>(null);

  const entitlement = entitlementFor(feature);
  const requiresTier: Tier = entitlement?.requiresTier ?? "plus";

  // While the snapshot is in flight, draw a neutral placeholder rather than the
  // children: flashing the real surface and then locking it is worse than a beat
  // of nothing, and the module + persisted caches make this rare.
  if (loading && !data) {
    return (
      <View
        testID={`${testID}-placeholder`}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View className="bg-muted h-24 rounded-2xl" />
        <View className="bg-muted mt-3 h-32 rounded-2xl" />
      </View>
    );
  }

  // Enforcement off, unknown feature, or allowed → exactly what shipped before.
  if (!data || data.enforced === false || !entitlement || entitlement.allowed) {
    return <>{children}</>;
  }

  // The gate this surface raises, built ONCE from the snapshot's own allowance
  // facts so the teaser's accessible name and the sheet's body are the same
  // sentence — `allowanceLine` then has the numbers to add a second one when
  // there are any (a whole-surface feature has `limit: 0`, so it does not).
  const teaserGate = syntheticGate(feature, requiresTier, entitlement);
  const open = () => setGate(teaserGate);

  return (
    <>
      {teaser ? (
        teaser({ requiresTier, open })
      ) : (
        <Pressable
          testID={`${testID}-teaser`}
          accessibilityRole="button"
          accessibilityLabel={`${FEATURE_LABELS[feature]} — ${teaserGate.error}`}
          accessibilityHint={`Shows what ${tierLabel(requiresTier)} includes`}
          onPress={open}
          style={minTouchTarget}
          className="border-border bg-card flex-row items-start gap-3 rounded-2xl border border-dashed p-5"
        >
          <View className="bg-muted h-11 w-11 items-center justify-center rounded-xl">
            <Lock size={20} color={colors["muted-foreground"]} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                className="text-foreground text-sm font-semibold"
                style={WRAPPABLE_TEXT}
              >
                {FEATURE_LABELS[feature]}
              </Text>
              <Text
                testID={`${testID}-tier`}
                className="text-primary text-[10px] font-semibold uppercase"
              >
                {tierLabel(requiresTier)}
              </Text>
            </View>
            <Text
              testID={`${testID}-description`}
              className="text-muted-foreground mt-1 text-xs"
              style={WRAPPABLE_TEXT}
            >
              {description ??
                `Included with ${tierLabel(requiresTier)}. Tap to see what you get.`}
            </Text>
          </View>
        </Pressable>
      )}

      <UpgradeSheet
        open={gate !== null}
        gate={gate}
        onClose={() => setGate(null)}
        {...(deps ? { deps } : {})}
      />
    </>
  );
}

export default TierGate;
