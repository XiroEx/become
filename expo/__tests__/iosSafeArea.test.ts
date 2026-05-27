import * as fs from "fs";
import * as path from "path";

// Top-level screens that own their SafeAreaView directly in the route file.
const DIRECT_SCREENS = [
  "app/index.tsx",
  "app/login.tsx",
  "app/verify.tsx",
  "app/(tabs)/programming/index.tsx",
  "app/(tabs)/programming/search.tsx",
  "app/(tabs)/programming/saved.tsx",
  "app/(tabs)/programming/[id]/index.tsx",
  "app/(tabs)/programming/[id]/phase/[phase].tsx",
  "app/(tabs)/programming/[id]/workout/[idx]/index.tsx",
  "app/(tabs)/mind/index.tsx",
  "app/(tabs)/nutrition/index.tsx",
  "app/(tabs)/nutrition/search.tsx",
  "app/(tabs)/nutrition/food/[id].tsx",
  "app/(tabs)/nutrition/log/[date].tsx",
  "app/(tabs)/nutrition/recipes/index.tsx",
  "app/(tabs)/nutrition/recipes/[id].tsx",
  "app/(tabs)/chat/index.tsx",
  "app/(tabs)/chat/[id].tsx",
  "app/(tabs)/calendar/index.tsx",
  "app/(tabs)/calendar/settings.tsx",
  "app/(tabs)/profile/health.tsx",
  "app/admin/foods/index.tsx",
  "app/admin/exercises/index.tsx",
];

// Routes that delegate the SafeAreaView responsibility to a component they
// import. The test follows the delegation: it verifies the component file
// contains the SafeAreaView wrapper.
const DELEGATING_SCREENS: { route: string; delegate: string }[] = [
  {
    route: "app/(tabs)/dashboard/index.tsx",
    delegate: "components/DashboardScreen.tsx",
  },
  {
    route: "app/(tabs)/programming/[id]/workout/[idx]/live.tsx",
    delegate: "components/live/LiveWorkoutClient.tsx",
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
