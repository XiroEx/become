import { TabStack } from "@/components/navigation/TabStack";

/**
 * The profile tab's own Stack. Settings. Hidden from the tab bar (href:
 * null) and reached from the gear on the dashboard. The Stack is also what
 * makes `profile` ONE screen in the tab navigator: without it
 * `profile/health` was flattened into the tabs and became a button of its
 * own, while `name="profile"` matched no route at all.
 */
export default function ProfileTabLayout() {
  return <TabStack />;
}
