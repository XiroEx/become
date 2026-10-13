/* eslint-disable import/first */
// NP-315 — ANDROID: SYSTEM BACK ON HOME JUMPS TO THE WORKOUT TAB; HISTORY
// OPENED FROM HOME EXITS THE APP; GOAL TILE'S BACK LANDS ON WORKOUT.
//
// Full visual pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9), build 24f4e34d:
//
//   1. System back on Home used to switch to the Workout tab instead of
//      leaving the app — the tab navigator had no `initialRouteName`, so its
//      back history was seeded with its FIRST declared screen (`programming`,
//      the Workout tab), not Home.
//   2. This Week tile -> History (cross-tab, inside the Workout tab): system
//      back used to exit the app and the round header back button did
//      nothing — neither went through `router.canGoBack()`.
//   3. Goal tile -> Nutrition Goals: both the header "Back to nutrition"
//      button and system back used to land on the Workout hub, because that
//      is where the tab navigator's own (phantom) back history pointed.
//
// This suite pins the fix: `(tabs)/_layout.tsx` declares Home as the
// `initialRouteName` with an explicit `backBehavior="history"`, and
// `history.tsx` / `goals.tsx` each resolve their own back target
// (`router.canGoBack()` → `router.back()`, else `router.replace` to Home) for
// BOTH the header button and the Android hardware back/gesture
// (`useAndroidBackHandler`) — never trusting the tab navigator's history.

const capturedTabsProps: Record<string, unknown>[] = [];
jest.mock("expo-router", () => {
  function FakeTabs(props: Record<string, unknown>) {
    capturedTabsProps.push(props);
    return props.children;
  }
  FakeTabs.displayName = "FakeTabs";
  function FakeTabsScreen() {
    return null;
  }
  FakeTabsScreen.displayName = "FakeTabsScreen";
  FakeTabs.Screen = FakeTabsScreen;
  return {
    __esModule: true,
    Tabs: FakeTabs,
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
  };
});

jest.mock("@/lib/theme/useThemeTokens", () => ({
  useThemeTokens: () => ({
    colors: {
      primary: "rgb(0 0 0)",
      "muted-foreground": "rgb(1 1 1)",
      background: "rgb(2 2 2)",
      border: "rgb(3 3 3)",
    },
    tint: () => "rgb(0 0 0)",
  }),
}));

import { render } from "@testing-library/react-native";
import TabsLayout, { TAB_ROUTES } from "../app/(app)/(tabs)/_layout";
/* eslint-enable import/first */

beforeEach(() => {
  capturedTabsProps.length = 0;
});

describe("(NP-315) the tab navigator's back-history root is Home", () => {
  it("declares dashboard (Home) as initialRouteName, not the first tab in the bar", () => {
    render(<TabsLayout />);
    expect(capturedTabsProps).toHaveLength(1);
    expect(capturedTabsProps[0]?.initialRouteName).toBe("dashboard");

    // The bar's first declared button is still Workout (TAB_ROUTES order is
    // unchanged — this is about back-history seeding, not button order).
    expect(TAB_ROUTES[0]?.name).toBe("programming");
  });

  it("names backBehavior explicitly as 'history' rather than leaving it implicit", () => {
    render(<TabsLayout />);
    expect(capturedTabsProps[0]?.backBehavior).toBe("history");
  });
});
