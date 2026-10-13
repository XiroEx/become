import { TabStack } from "@/components/navigation/TabStack";

/**
 * The dashboard tab's own Stack. Home is a single screen today; the Stack
 * is what keeps anything pushed from it — the settings gear's target
 * included — inside this tab instead of beside it.
 */
export default function DashboardTabLayout() {
  return <TabStack />;
}
