import { TabStack } from "@/components/navigation/TabStack";

/**
 * The mind tab's own Stack. Mind is one screen today; check-ins and
 * history push onto this Stack as they arrive.
 */
export default function MindTabLayout() {
  return <TabStack />;
}
