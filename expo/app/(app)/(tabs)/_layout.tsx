import { Tabs } from "expo-router";
import {
  Dumbbell,
  Home,
  MessageCircle,
  Salad,
  Sparkles,
} from "lucide-react-native";
import { resolveToken } from "@/lib/theme/tokens";

export interface TabRouteConfig {
  name: "dashboard" | "programming" | "mind" | "nutrition" | "chat";
  title: string;
}

export const TAB_ROUTES: TabRouteConfig[] = [
  { name: "dashboard", title: "Home" },
  { name: "programming", title: "Programs" },
  { name: "mind", title: "Mind" },
  { name: "nutrition", title: "Nutrition" },
  { name: "chat", title: "Chat" },
];

const ICON_BY_ROUTE: Record<
  TabRouteConfig["name"],
  typeof Home
> = {
  dashboard: Home,
  programming: Dumbbell,
  mind: Sparkles,
  nutrition: Salad,
  chat: MessageCircle,
};

/**
 * THE TAB BAR — five buttons, and nothing else.
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
 * `__tests__/tab-bar.test.tsx` renders this layout over the REAL app directory
 * and fails if the bar ever grows a sixth button.
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
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
