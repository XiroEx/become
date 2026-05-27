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

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: resolveToken("primary", "dark"),
        tabBarInactiveTintColor: resolveToken("muted-foreground", "dark"),
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#27272a" },
        headerStyle: { backgroundColor: "#0a0a0a" },
        headerTitleStyle: { color: "#ffffff" },
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
