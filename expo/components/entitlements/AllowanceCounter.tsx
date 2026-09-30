/**
 * THE COUNTER — "2/3", and what it resets to and when.
 *
 * Web equivalent: `Meter` inside `webapp/components/dashboard/PlanCard.tsx`.
 * Same two rules as the lock beside it:
 *
 *   • `enforced === false` (or an unknown snapshot) renders NOTHING. The
 *     dashboard is the first screen everybody sees, so a premature counter is
 *     the most visible way to break the dark launch.
 *   • the numbers are the server's. `used` and `limit` are read; `remaining` is
 *     read for the reset line rather than subtracted, and `canCreate` is what a
 *     LOCK reads — a counter never decides whether anything is allowed.
 *
 * An UNCAPPED feature (`limit: null`) draws nothing: there is no meter to show a
 * Plus member, and `limit: 0` is a feature they have none of, not a cap of zero.
 */

import { View } from "react-native";
import { Text } from "@/components/Text";
import {
  FEATURE_LABELS,
  formatResetsAt,
  useEntitlements,
  type Feature,
} from "@/lib/entitlements";

export interface AllowanceCounterProps {
  feature: Feature;
  /** "today" / "this week" — the window in the member's words. Optional. */
  suffix?: string;
  /** Draw the feature's label beside the count. */
  showLabel?: boolean;
  testID?: string;
}

export function AllowanceCounter({
  feature,
  suffix,
  showLabel = true,
  testID = "allowance-counter",
}: AllowanceCounterProps) {
  const { data, feature: entitlementFor } = useEntitlements();

  // The switch is off, or nothing is known yet: no counter, ever.
  if (!data || data.enforced === false) return null;

  const entitlement = entitlementFor(feature);
  if (!entitlement) return null;
  const limit = entitlement.limit;
  // Uncapped, or a feature this member simply does not have.
  if (limit === null || !Number.isFinite(limit) || limit <= 0) return null;

  const used = Math.min(Math.max(entitlement.used, 0), limit);
  const resets = formatResetsAt(entitlement.resetsAt, entitlement.window);

  return (
    <View testID={testID} className="flex-row items-baseline justify-between gap-2">
      {showLabel ? (
        <Text className="text-muted-foreground text-xs">
          {FEATURE_LABELS[feature]}
        </Text>
      ) : null}
      <Text testID={`${testID}-count`} className="text-foreground text-xs font-medium">
        {`${used}/${limit}`}
        {suffix ? ` ${suffix}` : ""}
        {resets ? ` · resets ${resets}` : ""}
      </Text>
    </View>
  );
}

export default AllowanceCounter;
