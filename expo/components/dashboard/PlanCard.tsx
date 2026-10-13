/**
 * The member's plan, on the native dashboard.
 * Ported 1:1 from `webapp/components/dashboard/PlanCard.tsx` (NP-158).
 *
 * LAUNCH-DAY CONTRACT: this renders NOTHING until ENTITLEMENTS_ENFORCED is on.
 * The dashboard is the first screen everybody sees, so it is the one place a
 * premature counter would be most visible — the `enforced` check is the whole
 * reason the monetization work can ship dark.
 *
 * On free it shows only the four allowances a member actually feels. The other
 * six exist in the API response and are deliberately not drawn: a wall of
 * meters reads as a paywall, four reads as a plan.
 */

import React from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  FEATURE_LABELS,
  tierLabel,
  useEntitlements,
  type EntitlementsSnapshot,
  type Feature,
  type FeatureEntitlement,
} from "@/lib/entitlements";

/** The four a member feels, in the order they meet them. */
export const DASHBOARD_PLAN_METERS: { feature: Feature; suffix: string }[] = [
  { feature: "ai-food-estimate", suffix: "today" },
  { feature: "workout-generation", suffix: "this week" },
  { feature: "custom-programs", suffix: "" },
  { feature: "mind-sessions", suffix: "" },
];

export interface PlanMeterProps {
  ent: FeatureEntitlement;
  label: string;
  suffix: string;
  feature: Feature;
}

export function PlanMeter({ ent, label, suffix, feature }: PlanMeterProps) {
  const limit = ent.limit ?? 0;
  if (limit <= 0) return null;
  const used = Math.min(Math.max(ent.used, 0), limit);
  const pct = Math.round((used / limit) * 100);
  const spent = ent.remaining !== null ? ent.remaining <= 0 : !ent.canCreate;

  return (
    <View testID={`plan-meter-${feature}`} className="gap-1">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="text-muted-foreground text-xs">{label}</Text>
        <Text
          testID={`plan-meter-${feature}-count`}
          className={`text-xs font-medium tabular-nums ${
            spent
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          }`}
        >
          {`${used}/${limit}${suffix ? ` ${suffix}` : ""}`}
        </Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <View
          testID={`plan-meter-${feature}-bar`}
          className={`h-full rounded-full ${spent ? "bg-amber-500" : "bg-green-500"}`}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </View>
    </View>
  );
}

export interface PlanCardProps {
  onOpenPlan?: () => void;
  snapshot?: EntitlementsSnapshot | null;
  testID?: string;
}

export function PlanCard({
  onOpenPlan,
  snapshot,
  testID = "dashboard-plan-card",
}: PlanCardProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { data: hookData } = useEntitlements();
  const data = snapshot !== undefined ? snapshot : hookData;

  // The switch is off, or nothing is known yet: no card, ever.
  if (!data || data.enforced === false) return null;

  const handleOpenPlan = () => {
    if (onOpenPlan) {
      onOpenPlan();
    } else {
      router.push("/plan" as never);
    }
  };

  const isPlus = data.tier !== "free";
  const periodEnd = data.subscription?.currentPeriodEnd
    ? new Date(data.subscription.currentPeriodEnd)
    : null;
  // A cancelled subscription keeps Plus until the period end and then STOPS.
  // Calling that date "Renews" tells someone who has already cancelled that
  // they are about to be charged again.
  const endsInstead = data.subscription?.cancelAtPeriodEnd === true;

  if (isPlus) {
    const subText = data.grandfathered
      ? "Thanks for being here early"
      : periodEnd && !Number.isNaN(periodEnd.getTime())
        ? `${endsInstead ? "Ends" : "Renews"} ${periodEnd.toLocaleDateString()}`
        : "No limits on anything";

    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${tierLabel(data.tier)} — everything unlocked. ${subText}`}
        accessibilityHint="Opens the plan details screen"
        onPress={handleOpenPlan}
        style={[minTouchTarget, { flexDirection: "row", alignItems: "center" }]}
        className="w-full flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          {/* Purple sparkle, matching its own purple badge and the web's
              Plus accent — `colors.accent` (amber) painted this orange. */}
          <Sparkles size={20} color={colors.mindset} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-semibold">
            {tierLabel(data.tier)} — everything unlocked
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {subText}
          </Text>
        </View>
      </Pressable>
    );
  }

  const rows = DASHBOARD_PLAN_METERS.map(({ feature, suffix }) => ({
    feature,
    suffix,
    ent: data.features?.[feature] ?? null,
  })).filter(
    (r): r is { feature: Feature; suffix: string; ent: FeatureEntitlement } =>
      r.ent !== null && r.ent.limit !== null && r.ent.limit > 0,
  );

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      className="w-full rounded-2xl border border-border bg-card p-4"
    >
      <View className="mb-3 flex-row items-center justify-between gap-2">
        <Text
          testID={`${testID}-title`}
          className="text-foreground text-base font-semibold"
        >
          Free plan
        </Text>
        <Pressable
          testID={`${testID}-see-plus`}
          accessibilityRole="button"
          accessibilityLabel="See Plus"
          accessibilityHint="Opens the plan details and upgrade screen"
          onPress={handleOpenPlan}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-purple-600 dark:text-purple-400 text-sm font-medium">
            See Plus
          </Text>
        </Pressable>
      </View>
      <View className="gap-2.5">
        {rows.map((r) => (
          <PlanMeter
            key={r.feature}
            ent={r.ent}
            label={FEATURE_LABELS[r.feature]}
            suffix={r.suffix}
            feature={r.feature}
          />
        ))}
      </View>
    </View>
  );
}

export default PlanCard;
