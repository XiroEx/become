import { Tabs } from "expo-router";
import {
  Brain,
  ClipboardList,
  Home,
  UtensilsCrossed,
} from "lucide-react-native";
import { resolveToken } from "@/lib/theme/tokens";

export interface TabRouteConfig {
  /** The folder under `(tabs)` this button opens. */
  name: "programming" | "mind" | "dashboard" | "nutrition";
  /** The label, which is the WEB's label — see the note below. */
  title: string;
}

/**
 * THE TAB BAR IS THE WEB'S TAB BAR.
 *
 * `webapp/components/BottomNav.tsx` is the source of truth for order, labels
 * and icons: Workout, Mind, Home, Nutrition, Community. Native shipped its own
 * set — Home, Programs, Mind, Nutrition, Chat — so the two clients disagreed
 * about what the app is called in four places out of five and about which
 * button sits under the thumb.
 *
 * Community is absent because it is hidden on the web too
 * (`webapp/components/FeatureGuard.tsx` answers "Coming soon" to everyone but
 * an admin), which leaves four buttons with Home in the middle, exactly where
 * the web puts it. The `chat` folder is still in the tree and still reachable
 * by URL; it is listed below with `href: null` so it is not a button. NP-032
 * removes those routes behind `EXPO_PUBLIC_COMMUNITY_ENABLED` — there is
 * deliberately no second flag here.
 *
 * `programming` is the Workout tab: the label is the web's, the screen is
 * today's programs list until NP-071 ports the web's workout home. A route
 * rename would break every `/(tabs)/programming/…` href in the app, so the
 * folder keeps its name.
 */
export const TAB_ROUTES: TabRouteConfig[] = [
  { name: "programming", title: "Workout" },
  { name: "mind", title: "Mind" },
  { name: "dashboard", title: "Home" },
  { name: "nutrition", title: "Nutrition" },
];

/** The web's icons, one for one with `BottomNav.tsx`'s lucide imports. */
const ICON_BY_ROUTE: Record<TabRouteConfig["name"], typeof Home> = {
  programming: ClipboardList,
  mind: Brain,
  dashboard: Home,
  nutrition: UtensilsCrossed,
};

/**
 * THE TAB BAR — four buttons, and nothing else.
 *
 * Every direct child of this folder is a screen of the TAB navigator, listed
 * here or not: a folder without its own `_layout.tsx` is flattened, so
 * `programming/[id]/workout/[idx]/live` used to be a tab button and the bar
 * carried twenty of them. Each tab now owns a Stack
 * (`components/navigation/TabStack.tsx`), which makes each folder exactly ONE
 * screen here and turns every detail route into a push inside its tab.
 *
 * `headerShown: false` for the same reason the stacks set it: the screens draw
 * their own headers inside a SafeAreaView.
 *
 * `__tests__/navigation-shell.test.tsx` renders this layout over the REAL app
 * directory and reads the bar that comes out, so it fails if the bar ever grows
 * a fifth button or reorders the four.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: resolveToken("primary", "dark"),
        tabBarInactiveTintColor: resolveToken("muted-foreground", "dark"),
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#27272a" },
      }}
    >
      {TAB_ROUTES.map(({ name, title }) => {
        const Icon = ICON_BY_ROUTE[name];
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title,
              tabBarIcon: ({ color }) => (
                <Icon color={color} size={22} strokeWidth={1.5} />
              ),
            }}
          />
        );
      })}
      {/* Hidden routes — present in the (tabs) tree but not in the tab bar. */}
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
