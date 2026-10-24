/* eslint-disable import/first */
// THE GLASS BAR MOVES AND LOOKS LIKE THE WEB'S (`webapp/components/BottomNav.tsx`).
//
// What this pins:
//   1. the capsule's numbers are the web's, read out of the web's own source;
//   2. ONE active pill, whose translateX + width target follows the focused tab
//      through `withSpring` — and which jumps (no spring) under Reduce Motion
//      and on the very first placement;
//   3. a tab change re-renders only the two items whose `focused` flipped;
//   4. the green badge, and the scroll "condense" with its 300ms ease-out.
//
// Reanimated is mocked (`__mocks__/react-native-reanimated.js`): a shared value
// is a mutable box, `useAnimatedStyle` evaluates once per render, and
// `withSpring` / `withTiming` return their target. So the pill's TARGET is
// observable by re-rendering, and the spring itself by spying on `withSpring`.

import * as fs from "fs";
import * as path from "path";
import { cloneElement, type ReactElement } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { act, fireEvent, render, type RenderAPI } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import * as Reanimated from "react-native-reanimated";
import * as GlassEffect from "expo-glass-effect";
import { GlassTabBar } from "@/components/navigation/GlassTabBar";
import {
  TAB_BAR_BORDER_WIDTH,
  TAB_BAR_HEIGHT,
  TAB_BAR_ITEM_GAP,
  TAB_BAR_ITEM_HEIGHT,
  TAB_BAR_ITEM_WIDTH,
  TAB_BAR_PADDING_X,
  TAB_BAR_PADDING_Y,
} from "@/lib/navigation/tabBarInset";
import {
  setTabBarCondensed,
  subscribeTabBarCondensed,
  useTabBarCondenseOnScroll,
} from "@/lib/navigation/tabBarCondense";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const WEB_NAV = fs.readFileSync(
  path.resolve(EXPO_DIR, "..", "webapp", "components", "BottomNav.tsx"),
  "utf8",
);

const VISIBLE = ["programming", "mind", "dashboard", "nutrition", "profile"];
const HIDDEN = ["chat", "calendar"];
const NAMES = [...VISIBLE, ...HIDDEN];

type BarProps = Parameters<typeof GlassTabBar>[0];

function barProps(focused: string, badges: Record<string, number> = {}): BarProps {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
  const descriptors = Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        route,
        options: VISIBLE.includes(route.name)
          ? {
              title: route.name,
              tabBarBadge: badges[route.name],
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
  } as unknown as BarProps;
}

/** Where the row would put button `i`: padding, then 56 + 8 per step. */
const itemX = (i: number) =>
  TAB_BAR_PADDING_X + i * (TAB_BAR_ITEM_WIDTH + TAB_BAR_ITEM_GAP);

function measure(r: RenderAPI): void {
  VISIBLE.forEach((name, i) => {
    fireEvent(r.getByTestId(`glass-tab-${name}`), "layout", {
      nativeEvent: {
        layout: {
          x: itemX(i),
          y: TAB_BAR_PADDING_Y,
          width: TAB_BAR_ITEM_WIDTH,
          height: TAB_BAR_ITEM_HEIGHT,
        },
      },
    });
  });
}

/** Re-render so `useAnimatedStyle` re-reads the shared values, then read the pill. */
function pill(r: RenderAPI, el: ReactElement) {
  // A clone: React skips re-rendering an element object it has already seen.
  r.rerender(cloneElement(el));
  const style = StyleSheet.flatten(
    r.getByTestId("glass-tab-active-pill").props.style,
  ) as {
    opacity: number;
    width: number;
    transform: { translateX: number }[];
  };
  return {
    x: style.transform[0]?.translateX,
    width: style.width,
    opacity: style.opacity,
  };
}

function mockReduceMotion(value: boolean) {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(value));
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(() => ({ remove: () => {} }) as never);
}

beforeEach(() => {
  jest.spyOn(GlassEffect, "isLiquidGlassAvailable").mockReturnValue(false);
  act(() => {
    colorScheme.set("dark");
    setTabBarCondensed(false);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the capsule is the web's capsule", () => {
  it("takes its numbers from BottomNav.tsx", () => {
    // The web's classes, so a change there fails here.
    expect(WEB_NAV).toContain("gap-2 rounded-full border border-zinc-200/70");
    expect(WEB_NAV).toContain("px-3 py-1.5");
    expect(WEB_NAV).toContain("h-12 w-14");
    expect(WEB_NAV).toContain("shadow-lg shadow-black/10");
    expect(WEB_NAV).toContain("dark:shadow-black/40");
    expect(WEB_NAV).toContain("dark:bg-zinc-900/80");

    expect(TAB_BAR_ITEM_WIDTH).toBe(56);
    expect(TAB_BAR_ITEM_HEIGHT).toBe(48);
    expect(TAB_BAR_ITEM_GAP).toBe(8);
    expect(TAB_BAR_PADDING_X).toBe(12);
    expect(TAB_BAR_PADDING_Y).toBe(6);
    // border-box: 48 + 6 + 6 + 1 + 1.
    expect(TAB_BAR_HEIGHT).toBe(62);
    expect(TAB_BAR_BORDER_WIDTH).toBe(1);
  });

  it("is content-sized and centred, with the web's per-scheme shadow", () => {
    const r = render(<GlassTabBar {...barProps("dashboard")} />);
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-bar").props.style),
    ).toMatchObject({ alignItems: "center" });
    const dark = StyleSheet.flatten(
      r.getByTestId("glass-tab-bar-pill").props.style,
    );
    expect(dark.borderWidth).toBe(1);
    expect(dark.borderRadius).toBe(TAB_BAR_HEIGHT / 2);
    expect(dark.shadowOpacity).toBe(0.4);

    act(() => colorScheme.set("light"));
    r.rerender(<GlassTabBar {...barProps("dashboard")} />);
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-bar-pill").props.style)
        .shadowOpacity,
    ).toBe(0.1);
  });

  it("gives each button the web's 56 × 48", () => {
    const r = render(<GlassTabBar {...barProps("dashboard")} />);
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-mind").props.style),
    ).toMatchObject({ width: 56, height: 48 });
  });
});

describe("the active pill slides", () => {
  it("is one view, placed under the focused tab without a spring first", () => {
    const spring = jest.spyOn(Reanimated, "withSpring");
    const el = <GlassTabBar {...barProps("dashboard")} />;
    const r = render(el);
    expect(r.getAllByTestId("glass-tab-active-pill")).toHaveLength(1);

    measure(r);
    expect(pill(r, el)).toEqual({
      x: itemX(2),
      width: TAB_BAR_ITEM_WIDTH,
      opacity: 1,
    });
    // Nothing to slide FROM on the first placement.
    expect(spring).not.toHaveBeenCalled();
  });

  it("moves translateX + width to the new tab with the web's spring", () => {
    const spring = jest.spyOn(Reanimated, "withSpring");
    const r = render(<GlassTabBar {...barProps("dashboard")} />);
    measure(r);

    const next = <GlassTabBar {...barProps("nutrition")} />;
    r.rerender(next);

    // The target the pill is headed for, through the web's own transition:
    // `{ type: 'spring', stiffness: 500, damping: 35 }`.
    expect(spring).toHaveBeenCalledWith(
      itemX(3),
      expect.objectContaining({ stiffness: 500, damping: 35 }),
    );
    expect(spring).toHaveBeenCalledWith(
      TAB_BAR_ITEM_WIDTH,
      expect.objectContaining({ stiffness: 500, damping: 35 }),
    );
    expect(pill(r, next).x).toBe(itemX(3));
    expect(WEB_NAV).toContain("stiffness: 500, damping: 35");
  });

  it("pressing a tab asks the navigator, and the pill follows the new focus", () => {
    const props = barProps("dashboard");
    const r = render(<GlassTabBar {...props} />);
    measure(r);

    fireEvent.press(r.getByTestId("glass-tab-mind"));
    expect(props.navigation.navigate).toHaveBeenCalledWith("mind");

    // The navigator answers with the new state. The first render after it
    // starts the pill's move (in an effect, so that render's style is the old
    // one); the next render reads where it is headed.
    const after = <GlassTabBar {...barProps("mind")} />;
    r.rerender(after);
    expect(pill(r, after).x).toBe(itemX(1));
  });

  it("snaps instead of springing when a measurement changes", () => {
    const spring = jest.spyOn(Reanimated, "withSpring");
    const el = <GlassTabBar {...barProps("mind")} />;
    const r = render(el);
    measure(r);
    fireEvent(r.getByTestId("glass-tab-mind"), "layout", {
      nativeEvent: { layout: { x: 100, y: 6, width: 50, height: 48 } },
    });
    expect(pill(r, el)).toMatchObject({ x: 100, width: 50 });
    expect(spring).not.toHaveBeenCalled();
  });

  it("has no pill while a hidden route is focused", () => {
    const el = <GlassTabBar {...barProps("chat")} />;
    const r = render(el);
    measure(r);
    expect(pill(r, el).opacity).toBe(0);
  });

  it("jumps, with no spring, under Reduce Motion", async () => {
    mockReduceMotion(true);
    const spring = jest.spyOn(Reanimated, "withSpring");
    const r = render(<GlassTabBar {...barProps("dashboard")} />);
    await act(async () => {});
    measure(r);

    const next = <GlassTabBar {...barProps("nutrition")} />;
    r.rerender(next);

    expect(spring).not.toHaveBeenCalled();
    expect(pill(r, next).x).toBe(itemX(3));
  });
});

describe("an icon shrinks while pressed and springs back", () => {
  const iconScale = (r: RenderAPI, label: string) => {
    const style = StyleSheet.flatten(
      r.getByTestId(`glass-tab-icon-${label}`).props.style,
    ) as { transform: { scale: number }[] };
    return style.transform[0]?.scale;
  };

  it("goes to 0.9 on press-in and back to 1 on press-out, by spring", () => {
    const spring = jest.spyOn(Reanimated, "withSpring");
    const r = render(<GlassTabBar {...barProps("dashboard")} />);
    expect(iconScale(r, "mind")).toBe(1);

    const button = r.getByTestId("glass-tab-mind");
    fireEvent(button, "pressIn");
    expect(spring).toHaveBeenLastCalledWith(
      0.9,
      expect.objectContaining({ stiffness: 500, damping: 20 }),
    );
    expect(iconScale(r, "mind")).toBe(0.9);
    // Only the pressed tab's icon moves.
    expect(iconScale(r, "dashboard")).toBe(1);

    fireEvent(button, "pressOut");
    expect(spring).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ stiffness: 500, damping: 20 }),
    );
    expect(iconScale(r, "mind")).toBe(1);
  });

  // The haptic on press is pinned by NP-351 ("taps the phone on every press").

  it("does not shrink under Reduce Motion", async () => {
    mockReduceMotion(true);
    const spring = jest.spyOn(Reanimated, "withSpring");
    const r = render(<GlassTabBar {...barProps("dashboard")} />);
    await act(async () => {});

    const button = r.getByTestId("glass-tab-mind");
    fireEvent(button, "pressIn");
    expect(spring).not.toHaveBeenCalled();
    expect(iconScale(r, "mind")).toBe(1);
    fireEvent(button, "pressOut");
    expect(iconScale(r, "mind")).toBe(1);
  });
});

describe("a tab change does not re-render every item", () => {
  it("re-renders the two items whose focus flipped, and no others", () => {
    const renders: Record<string, number> = {};
    const props = barProps("dashboard");
    // Count renders through the icon, which an item calls once per render.
    for (const name of VISIBLE) {
      const descriptor = props.descriptors[`${name}-key`];
      if (!descriptor) throw new Error(name);
      descriptor.options.tabBarIcon = () => {
        renders[name] = (renders[name] ?? 0) + 1;
        return <View />;
      };
    }
    const r = render(<GlassTabBar {...props} />);
    const before = { ...renders };

    // Same descriptors and navigation (as a real tab change keeps them), a new
    // focused index.
    const next = {
      ...props,
      state: { ...props.state, index: NAMES.indexOf("nutrition") },
    } as BarProps;
    r.rerender(<GlassTabBar {...next} />);

    const rerendered = VISIBLE.filter(
      (name) => (renders[name] ?? 0) > (before[name] ?? 0),
    );
    expect(rerendered.sort()).toEqual(["dashboard", "nutrition"]);
  });
});

describe("the badge is the web's badge", () => {
  it("draws a green count top right, capped at 99+", () => {
    expect(WEB_NAV).toContain("bg-green-500");
    expect(WEB_NAV).toContain("h-4 min-w-[16px]");
    expect(WEB_NAV).toContain("text-[10px] font-bold");

    const r = render(
      <GlassTabBar {...barProps("dashboard", { mind: 7, nutrition: 120 })} />,
    );
    const seven = r.getByTestId("glass-tab-badge-mind");
    expect(StyleSheet.flatten(seven.props.style)).toMatchObject({
      right: 4,
      top: 2,
      minWidth: 16,
      minHeight: 16,
    });
    expect(r.getByText("7")).toBeTruthy();
    expect(r.getByText("99+")).toBeTruthy();
    expect(r.getByLabelText("mind, tab, 2 of 7, 7 new")).toBeTruthy();
    expect(r.queryByTestId("glass-tab-badge-dashboard")).toBeNull();
  });
});

describe("the capsule condenses while a tab root scrolls", () => {
  const scale = (r: RenderAPI, el: ReactElement) => {
    r.rerender(cloneElement(el));
    const style = StyleSheet.flatten(
      r.getByTestId("glass-tab-bar-condense").props.style,
    ) as { transform: { scale: number }[]; transformOrigin: string };
    return { scale: style.transform[0]?.scale, origin: style.transformOrigin };
  };

  it("scales to 0.88 from centre-bottom over 300ms ease-out, and back", () => {
    expect(WEB_NAV).toContain("scale-[0.88]");
    expect(WEB_NAV).toContain("duration-300 ease-out");
    expect(WEB_NAV).toContain("transformOrigin: 'center bottom'");

    const timing = jest.spyOn(Reanimated, "withTiming");
    const el = <GlassTabBar {...barProps("dashboard")} />;
    const r = render(el);
    expect(scale(r, el)).toEqual({ scale: 1, origin: "50% 100%" });

    act(() => setTabBarCondensed(true));
    expect(timing).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ duration: 300 }),
    );
    expect(scale(r, el).scale).toBeCloseTo(0.88);

    act(() => setTabBarCondensed(false));
    expect(scale(r, el).scale).toBe(1);
  });

  it("does not condense under Reduce Motion", async () => {
    mockReduceMotion(true);
    const el = <GlassTabBar {...barProps("dashboard")} />;
    const r = render(el);
    await act(async () => {});

    act(() => setTabBarCondensed(true));
    expect(scale(r, el).scale).toBe(1);
  });

  it("is fed by a scroll handler that writes once, then lets go after 200ms", () => {
    jest.useFakeTimers();
    try {
      const seen: boolean[] = [];
      const off = subscribeTabBarCondensed((c) => seen.push(c));

      function Probe() {
        const props = useTabBarCondenseOnScroll();
        return <Text testID="probe" onPress={props.onScroll} />;
      }
      const r = render(<Probe />);
      for (let i = 0; i < 5; i += 1) fireEvent.press(r.getByTestId("probe"));
      expect(seen).toEqual([true]);

      act(() => {
        jest.advanceTimersByTime(199);
      });
      expect(seen).toEqual([true]);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(seen).toEqual([true, false]);
      off();
    } finally {
      jest.useRealTimers();
    }
  });
});
