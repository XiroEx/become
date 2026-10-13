import { TabStack } from "@/components/navigation/TabStack";

/**
 * The chat tab's own Stack. The conversation list pushes a thread, and
 * Back returns to the list with the tab bar still on screen.
 */
export default function ChatTabLayout() {
  return <TabStack />;
}
