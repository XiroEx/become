/* eslint-disable import/first */
// THE BAR SURVIVES A HOST WITH NO USABLE REANIMATED.
//
// `expo-router/testing-library` (what `renderRouter` loads) does
// `jest.mock('react-native-reanimated', …)` over our root mock, returning `{}`
// when the package's own mock cannot be loaded. Every suite that rendered the
// real tab shell then crashed in `GlassTabBar` with
// `useSharedValue is not a function` — the app's only navigation taking the
// whole tree down for want of an animation library.
//
// This file reproduces that module exactly, and asks the bar to render, take a
// press and navigate anyway.

jest.mock("react-native-reanimated", () => ({}));

import { StyleSheet, View } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import * as GlassEffect from "expo-glass-effect";
import { GlassTabBar } from "@/components/navigation/GlassTabBar";

const VISIBLE = ["programming", "mind", "dashboard", "nutrition", "profile"];
const NAMES = [...VISIBLE, "chat", "calendar"];

function props(focused: string) {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
  const descriptors = Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        route,
        options: VISIBLE.includes(route.name)
          ? {
              title: route.name,
              tabBarIcon: () => <View testID={`icon-${route.name}`} />,
            }
          : { title: route.name, tabBarItemStyle: { display: "none" } },
      },
    ]),
  );
  return {
    state: {
      key: "tabs-key",
      index: NAMES.indexOf(focused),
      routeNames: NAMES,
      routes,
      type: "tab",
      stale: false,
      preloadedRouteKeys: [],
    },
    descriptors,
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
    insets: { top: 0, right: 0, bottom: 34, left: 0 },
  } as unknown as Parameters<typeof GlassTabBar>[0];
}

beforeEach(() => {
  jest.spyOn(GlassEffect, "isLiquidGlassAvailable").mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("with react-native-reanimated mocked to {}", () => {
  it("still renders every button and the icons", () => {
    const r = render(<GlassTabBar {...props("dashboard")} />);
    for (const name of VISIBLE) {
      expect(r.getByTestId(`glass-tab-${name}`)).toBeTruthy();
      expect(r.getByTestId(`icon-${name}`)).toBeTruthy();
    }
  });

  it("still navigates, and presses without throwing", () => {
    const p = props("dashboard");
    const r = render(<GlassTabBar {...p} />);
    const button = r.getByTestId("glass-tab-mind");
    fireEvent(button, "pressIn");
    fireEvent(button, "pressOut");
    fireEvent.press(button);
    expect(p.navigation.navigate).toHaveBeenCalledWith("mind");
  });

  it("draws no pill rather than a wrong one", () => {
    const r = render(<GlassTabBar {...props("dashboard")} />);
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-active-pill").props.style),
    ).toMatchObject({ opacity: 0 });
  });
});
