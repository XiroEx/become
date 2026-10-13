import { TabStack } from "@/components/navigation/TabStack";

/**
 * The programming tab's own Stack. Program, phase, workout overview and
 * the live workout all push here, so Back walks them in reverse and the
 * tab bar never moves.
 */
export default function ProgrammingTabLayout() {
  return <TabStack />;
}
