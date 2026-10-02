import * as fs from "fs";
import * as path from "path";

// Top-level screens that own their SafeAreaView directly in the route file.
const DIRECT_SCREENS = [
  "app/index.tsx",
  "app/(auth)/login.tsx",
  "app/(auth)/verify.tsx",
  "app/(app)/(tabs)/programming/index.tsx",
  "app/(app)/(tabs)/programming/browse.tsx",
  "app/(app)/(tabs)/programming/search.tsx",
  "app/(app)/(tabs)/programming/saved.tsx",
  "app/(app)/(tabs)/programming/[id]/index.tsx",
  "app/(app)/(tabs)/programming/[id]/phase/[phase].tsx",
  "app/(app)/(tabs)/programming/[id]/workout/[idx]/index.tsx",
  "app/(app)/(tabs)/mind/index.tsx",
  "app/(app)/(tabs)/nutrition/index.tsx",
  "app/(app)/(tabs)/nutrition/search.tsx",
  "app/(app)/(tabs)/nutrition/food/[id].tsx",
  "app/(app)/(tabs)/nutrition/recipes/index.tsx",
  "app/(app)/(tabs)/nutrition/recipes/[id].tsx",
  "app/(app)/(tabs)/chat/index.tsx",
  "app/(app)/(tabs)/chat/[id].tsx",
  "app/(app)/(tabs)/calendar/index.tsx",
  "app/(app)/(tabs)/calendar/settings.tsx",
  "app/(app)/(tabs)/profile/health.tsx",
  "app/(app)/settings.tsx",
];

// Routes that delegate the SafeAreaView responsibility to a component they
// import. The test follows the delegation: it verifies the component file
// contains the SafeAreaView wrapper.
const DELEGATING_SCREENS: { route: string; delegate: string }[] = [
  {
    route: "app/(app)/(tabs)/dashboard/index.tsx",
    delegate: "components/DashboardScreen.tsx",
  },
  {
    route: "app/(app)/(tabs)/dashboard/streaks.tsx",
    delegate: "components/streaks/StreaksScreen.tsx",
  },
  {
    route: "app/(app)/(tabs)/programming/[id]/workout/[idx]/live.tsx",
    delegate: "components/live/LiveWorkoutClient.tsx",
  },
  {
    route: "app/(app)/(tabs)/profile/index.tsx",
    delegate: "components/profile/ProfileScreen.tsx",
  },
];

describe("iOS safe-area pass", () => {
  it.each(DIRECT_SCREENS)(
    "%s wraps its content in a SafeAreaView",
    (rel) => {
      const full = path.resolve(__dirname, "..", rel);
      const src = fs.readFileSync(full, "utf8");
      expect(src).toContain("SafeAreaView");
    },
  );

  it("every direct screen imports SafeAreaView from react-native-safe-area-context", () => {
    for (const rel of DIRECT_SCREENS) {
      const full = path.resolve(__dirname, "..", rel);
      const src = fs.readFileSync(full, "utf8");
      expect(src).toMatch(/from\s+["']react-native-safe-area-context["']/);
    }
  });

  it.each(DELEGATING_SCREENS)(
    "delegating route $route delegates to $delegate which wraps SafeAreaView",
    ({ delegate }) => {
      const full = path.resolve(__dirname, "..", delegate);
      const src = fs.readFileSync(full, "utf8");
      expect(src).toContain("SafeAreaView");
      expect(src).toMatch(/from\s+["']react-native-safe-area-context["']/);
    },
  );
});
