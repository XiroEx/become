import { TabStack } from "@/components/navigation/TabStack";

/**
 * The calendar tab's own Stack. Hidden from the tab bar (href: null) and
 * reached from the dashboard; settings pushes over the month view.
 */
export default function CalendarTabLayout() {
  return <TabStack />;
}
