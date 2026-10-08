/* eslint-disable import/first */
// NP-351 — HOME IN THE CENTRE, AND A GLASS BOTTOM BAR.
//
// Jon and George on the 0.1.0 TestFlight build: "that bottom bar is so shit,
// Home needs to be in the middle" / "where's our glass bottom nav bar?".
//
// What shipped was bottom-tabs' default strip: four buttons (Workout, Mind,
// Home, Nutrition), so Home was 3rd of 4 and never centred, on an opaque bar
// with a hairline on top. The web has had a detached frosted capsule all along
// (`webapp/components/BottomNav.tsx`, lines 84-128): five icon-only buttons,
// `rounded-full`, `bg-white/80 dark:bg-zinc-900/80`, `backdrop-blur-xl`,
// `shadow-lg`, sitting `env(safe-area-inset-bottom) + 10px` off the bottom,
// with the active tab wearing `bg-zinc-900/10 dark:bg-white/15`.
//
// So this suite pins both halves:
//
//   1. five tabs with Home exactly in the middle — Workout, Mind, Home,
//      Nutrition, Profile (Profile in Community's slot while community is
//      hidden on native), Home still the launch tab, chat and calendar still
//      hidden;
//   2. the bar is the web's pill: floating, inset from the edges, rounded,
//      translucent — Apple's Liquid Glass on iOS 26+, expo-blur's
//      `systemChromeMaterial` below it, a blurred translucent surface with
//      elevation on Android — and it keeps the icons, the accessible labels,
//      `tabPress` (so scroll-to-top on a re-press still works), a haptic on
//      press and the per-tab stacks;
//   3. the active tab is the NEUTRAL primary (NP-313), in both modes, never
//      the brand red;
//   4. every tab root reserves `TAB_BAR_CONTENT_INSET` at the bottom of its
//      scroll content, because the bar is absolute and reserves nothing.

const capturedTabsProps: Record<string, unknown>[] = [];
const capturedScreens: { name: string; options: Record<string, unknown> }[] = [];

jest.mock("expo-router", () => {
  function FakeTabs(props: Record<string, unknown>) {
    capturedTabsProps.push(props);
    return props.children;
  }
  FakeTabs.displayName = "FakeTabs";
  function FakeTabsScreen(props: {
    name: string;
    options?: Record<string, unknown>;
  }) {
    capturedScreens.push({ name: props.name, options: props.options ?? {} });
    return null;
  }
  FakeTabsScreen.displayName = "FakeTabsScreen";
  FakeTabs.Screen = FakeTabsScreen;
  return { __esModule: true, Tabs: FakeTabs };
});

import * as fs from "fs";
import * as path from "path";
import type { ReactElement } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { act, render, fireEvent } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import * as Haptics from "expo-haptics";
import * as GlassEffect from "expo-glass-effect";
import { darkTokens, lightTokens, type ThemeMode } from "@/lib/theme/tokens";
import {
  TAB_BAR_CONTENT_INSET,
  TAB_BAR_GAP,
  TAB_BAR_HEIGHT,
  TAB_BAR_MIN_BOTTOM,
  TAB_BAR_SIDE_INSET,
  tabBarBottomOffset,
  tabBarScreenInset,
} from "@/lib/navigation/tabBarInset";
import { GlassTabBar } from "@/components/navigation/GlassTabBar";
import TabsLayout, { TAB_ROUTES } from "../app/(app)/(tabs)/_layout";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const rgb = (triplet: string) => `rgb(${triplet})`;
/** What `tint()` writes: `rgba(r, g, b, a)`, commas and all. */
const rgba = (triplet: string, alpha: number) =>
  `rgba(${triplet.split(" ").join(", ")}, ${alpha})`;

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

beforeEach(() => {
  capturedTabsProps.length = 0;
  capturedScreens.length = 0;
  jest.clearAllMocks();
  setSystemScheme("dark");
});

// `jest.replaceProperty(Platform, "OS", …)` and the `isLiquidGlassAvailable`
// spies below are only undone by a RESTORE, not by `clearAllMocks` — without
// this, one Android case leaves every later case running on Android.
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Five tabs, Home in the middle
// ---------------------------------------------------------------------------

describe("(NP-351) Home is in the centre of five tabs", () => {
  it("orders the bar Workout · Mind · Home · Nutrition · Profile", () => {
    expect(TAB_ROUTES.map((r) => r.title)).toEqual([
      "Workout",
      "Mind",
      "Home",
      "Nutrition",
      "Profile",
    ]);
    expect(TAB_ROUTES.map((r) => r.name)).toEqual([
      "programming",
      "mind",
      "dashboard",
      "nutrition",
      "profile",
    ]);
  });

  it("puts Home at the exact middle index, not merely third of four", () => {
    expect(TAB_ROUTES).toHaveLength(5);
    const middle = (TAB_ROUTES.length - 1) / 2;
    expect(Number.isInteger(middle)).toBe(true);
    expect(TAB_ROUTES[middle]?.name).toBe("dashboard");
  });

  it("promotes Profile to a real button and keeps chat and calendar hidden", () => {
    render(<TabsLayout />);

    const buttons = capturedScreens.filter(
      (s) => (s.options as { href?: unknown }).href === undefined,
    );
    expect(buttons.map((s) => s.name)).toEqual([
      "programming",
      "mind",
      "dashboard",
      "nutrition",
      "profile",
    ]);

    const hidden = capturedScreens.filter(
      (s) => (s.options as { href?: unknown }).href === null,
    );
    expect(hidden.map((s) => s.name)).toEqual(["chat", "calendar"]);
    // Profile used to be in this list; nothing else moved out of it.
    expect(hidden.map((s) => s.name)).not.toContain("profile");
  });

  it("still launches on Home and still keeps the per-tab stacks", () => {
    render(<TabsLayout />);
    expect(capturedTabsProps[0]?.initialRouteName).toBe("dashboard");
    expect(capturedTabsProps[0]?.backBehavior).toBe("history");

    // One `_layout.tsx` per tab folder is what makes each tab a Stack, so a
    // detail route is a push inside its tab rather than a button on the bar.
    for (const route of TAB_ROUTES) {
      expect(
        fs.existsSync(
          path.join(EXPO_DIR, "app", "(app)", "(tabs)", route.name, "_layout.tsx"),
        ),
      ).toBe(true);
    }
  });

  it("gives every button the web's icon, at the web's size and weight", () => {
    render(<TabsLayout />);
    const byName = new Map(capturedScreens.map((s) => [s.name, s.options]));

    for (const { name, title } of TAB_ROUTES) {
      const options = byName.get(name) as {
        title?: string;
        tabBarIcon?: (p: {
          focused: boolean;
          color: string;
          size: number;
        }) => ReactElement;
      };
      expect(options.title).toBe(title);

      // The web's `<Icon className="h-[22px] w-[22px]" strokeWidth={active ?
      // 2.4 : 2} />`, one for one.
      const active = options.tabBarIcon?.({
        focused: true,
        color: "x",
        size: 22,
      });
      const inactive = options.tabBarIcon?.({
        focused: false,
        color: "x",
        size: 22,
      });
      expect(active?.props).toMatchObject({ size: 22, strokeWidth: 2.4 });
      expect(inactive?.props).toMatchObject({ size: 22, strokeWidth: 2 });
    }

    // And they are the web's lucide components, named in the source.
    const layout = readExpo("app/(app)/(tabs)/_layout.tsx");
    for (const icon of [
      "ClipboardList",
      "Brain",
      "Home",
      "UtensilsCrossed",
      "UserRound",
    ]) {
      expect(layout).toContain(icon);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The glass bar itself
// ---------------------------------------------------------------------------

interface FakeRoute {
  key: string;
  name: string;
}

interface BarHarness {
  emit: jest.Mock;
  navigate: jest.Mock;
  props: Parameters<typeof GlassTabBar>[0];
}

/**
 * The props bottom-tabs hands a custom `tabBar`: five visible routes plus the
 * two that are in the navigator with `href: null` (which expo-router turns
 * into `tabBarItemStyle: { display: "none" }`).
 */
function harness(focusedName = "dashboard", bottomInset = 34): BarHarness {
  const visible: string[] = TAB_ROUTES.map((r) => r.name);
  const names: string[] = [...visible, "chat", "calendar"];
  const routes: FakeRoute[] = names.map((name) => ({
    key: `${name}-key`,
    name,
  }));
  const index = names.indexOf(focusedName);

  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigate = jest.fn();

  const descriptors = Object.fromEntries(
    routes.map((route) => [
      route.key,
      {
        route,
        options: visible.includes(route.name)
          ? {
              title:
                TAB_ROUTES.find((r) => r.name === route.name)?.title ??
                route.name,
              tabBarIcon: ({ color, size, focused }: {
                color: string;
                size: number;
                focused: boolean;
              }) => (
                <View
                  testID={`icon-${route.name}`}
                  accessibilityLabel={`${color}|${size}|${focused}`}
                />
              ),
            }
          : { title: route.name, tabBarItemStyle: { display: "none" } },
      },
    ]),
  );

  return {
    emit,
    navigate,
    props: {
      state: {
        key: "tabs-key",
        index,
        routeNames: names,
        routes,
        type: "tab",
        stale: false,
        preloadedRouteKeys: [],
      },
      descriptors,
      navigation: { emit, navigate },
      insets: { top: 47, right: 0, bottom: bottomInset, left: 0 },
    } as unknown as Parameters<typeof GlassTabBar>[0],
  };
}

describe("(NP-351) the bar is the web's floating glass pill", () => {
  it("renders one button per visible tab and skips the hidden routes", () => {
    const { props } = harness();
    const r = render(<GlassTabBar {...props} />);

    for (const { name } of TAB_ROUTES) {
      expect(r.getByTestId(`glass-tab-${name}`)).toBeTruthy();
    }
    expect(r.queryByTestId("glass-tab-chat")).toBeNull();
    expect(r.queryByTestId("glass-tab-calendar")).toBeNull();
  });

  it("floats: absolute, inset from both edges, above the safe area", () => {
    const { props } = harness("dashboard", 34);
    const r = render(<GlassTabBar {...props} />);

    // The web's `bottom: calc(env(safe-area-inset-bottom, 0px) + 10px)`.
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-bar").props.style),
    ).toMatchObject({
      position: "absolute",
      left: TAB_BAR_SIDE_INSET,
      right: TAB_BAR_SIDE_INSET,
      bottom: 34 + TAB_BAR_GAP,
    });
    expect(tabBarBottomOffset(34)).toBe(34 + TAB_BAR_GAP);
    // A device with no home indicator still gets a gap under the pill rather
    // than dropping it onto the glass.
    expect(tabBarBottomOffset(0)).toBe(TAB_BAR_MIN_BOTTOM + TAB_BAR_GAP);
  });

  it("is a rounded-full capsule with a shadow, not an edge-attached strip", () => {
    const bar = readExpo("components/navigation/GlassTabBar.tsx");
    expect(bar).toContain("borderRadius: TAB_BAR_HEIGHT / 2");
    expect(bar).toContain('overflow: "hidden"');
    expect(bar).toContain("elevation: 8");
    expect(bar).toContain("shadowOpacity");
    // The two things the old bar had and this one must not.
    expect(bar).not.toContain("borderTopColor");
    expect(bar).not.toContain("borderTopWidth");
    expect(TAB_BAR_HEIGHT / 2).toBe(28);
  });

  it("uses expo-blur's systemChromeMaterial when there is no Liquid Glass", () => {
    jest.spyOn(GlassEffect, "isLiquidGlassAvailable").mockReturnValue(false);
    const { props } = harness();
    const r = render(<GlassTabBar {...props} />);

    const surface = r.getByTestId("glass-tab-bar-surface");
    expect(surface.props.tint).toBe("systemChromeMaterial");
    expect(surface.props.experimentalBlurMethod).toBe("none");
    // And the web's wash under it (`bg-white/80 dark:bg-zinc-900/80`), which is
    // also what gives Android's `elevation` something to cast a shadow from.
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-bar-pill").props.style)
        .backgroundColor,
    ).toBe(rgba(darkTokens.card, 0.6));
  });

  it("uses Apple's Liquid Glass on iOS 26+, with nothing washed over it", () => {
    jest.spyOn(GlassEffect, "isLiquidGlassAvailable").mockReturnValue(true);
    const { props } = harness();
    const r = render(<GlassTabBar {...props} />);

    const surface = r.getByTestId("glass-tab-bar-surface");
    // `GlassView`'s own prop, which the BlurView path does not have.
    expect(surface.props.glassEffectStyle).toBe("regular");
    expect(surface.props.tint).toBeUndefined();
    // Liquid Glass refracts what scrolls under it; a translucent wash in front
    // of that would flatten it back into a painted bar.
    expect(
      StyleSheet.flatten(r.getByTestId("glass-tab-bar-pill").props.style)
        .backgroundColor,
    ).toBe(rgba(darkTokens.card, 0));
  });

  it("falls back to a blurred translucent surface on Android", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { props } = harness();
    const r = render(<GlassTabBar {...props} />);

    const surface = r.getByTestId("glass-tab-bar-surface");
    // There is no system chrome material on Android, so the blur is the
    // experimental one; and because that blur can decline to render, the
    // translucent `card` wash plus `elevation` is what is left — which is a
    // translucent floating bar either way.
    expect(surface.props.experimentalBlurMethod).toBe("dimezisBlurView");
    expect(surface.props.tint).toBe("dark");
    const pill = StyleSheet.flatten(
      r.getByTestId("glass-tab-bar-pill").props.style,
    );
    expect(pill.backgroundColor).toBe(rgba(darkTokens.card, 0.6));
    expect(pill.elevation).toBe(8);
  });

  it("keeps the VoiceOver name the navigator used to compose", () => {
    const { props } = harness();
    const r = render(<GlassTabBar {...props} />);

    // "Home, tab, 3 of 7": the position among the BUTTONS is 3 of 5, but the
    // total is the navigator's screen count, hidden routes included — exactly
    // what bottom-tabs said before this card.
    expect(r.getByLabelText("Home, tab, 3 of 7")).toBeTruthy();
    expect(r.getByLabelText("Workout, tab, 1 of 7")).toBeTruthy();
    expect(r.getByLabelText("Profile, tab, 5 of 7")).toBeTruthy();
  });

  it("marks the focused button selected and gives it the active pill", () => {
    const { props } = harness("mind");
    const r = render(<GlassTabBar {...props} />);

    expect(r.getByTestId("glass-tab-mind").props.accessibilityState).toMatchObject(
      { selected: true },
    );
    expect(
      r.getByTestId("glass-tab-dashboard").props.accessibilityState,
    ).toMatchObject({ selected: false });

    // The web's `bg-zinc-900/10 dark:bg-white/15`, on the active tab only.
    expect(r.getByTestId("glass-tab-active-pill-Mind")).toBeTruthy();
    expect(r.queryByTestId("glass-tab-active-pill-Home")).toBeNull();
  });

  it("emits tabPress so a re-press can still scroll the tab to the top", () => {
    const { props, emit, navigate } = harness("dashboard");
    const r = render(<GlassTabBar {...props} />);

    // A press on the tab you are already on emits and does NOT navigate —
    // which is the event `useScrollToTop` listens for.
    fireEvent.press(r.getByTestId("glass-tab-dashboard"));
    expect(emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "dashboard-key",
      canPreventDefault: true,
    });
    expect(navigate).not.toHaveBeenCalled();

    // A press on another tab emits, then navigates.
    fireEvent.press(r.getByTestId("glass-tab-nutrition"));
    expect(emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "nutrition-key",
      canPreventDefault: true,
    });
    expect(navigate).toHaveBeenCalledWith("nutrition");
  });

  it("lets a screen preventDefault a tab change, as the default bar does", () => {
    const { props, emit, navigate } = harness("dashboard");
    emit.mockReturnValue({ defaultPrevented: true });
    const r = render(<GlassTabBar {...props} />);

    fireEvent.press(r.getByTestId("glass-tab-nutrition"));
    expect(emit).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("taps the phone on every press", () => {
    const { props } = harness("dashboard");
    const r = render(<GlassTabBar {...props} />);

    fireEvent.press(r.getByTestId("glass-tab-mind"));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light,
    );
  });

  it("gives every button a 44pt touch target", () => {
    const { props } = harness();
    const r = render(<GlassTabBar {...props} />);
    for (const { name } of TAB_ROUTES) {
      expect(
        StyleSheet.flatten(r.getByTestId(`glass-tab-${name}`).props.style),
      ).toMatchObject({ minWidth: 44, minHeight: 44 });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The neutral primary, in both modes
// ---------------------------------------------------------------------------

describe("(NP-351) the active tab is the neutral primary, never red", () => {
  it.each(["light", "dark"] as const)("in %s mode", (mode) => {
    setSystemScheme(mode);
    const tokens = mode === "dark" ? darkTokens : lightTokens;
    const { props } = harness("dashboard");
    const r = render(<GlassTabBar {...props} />);

    // The icon records what colour it was handed.
    const [active, size, focused] = r
      .getByTestId("icon-dashboard")
      .props.accessibilityLabel.split("|");
    expect(active).toBe(rgb(tokens.primary));
    expect(size).toBe("22");
    expect(focused).toBe("true");

    const [inactive] = r
      .getByTestId("icon-mind")
      .props.accessibilityLabel.split("|");
    expect(inactive).toBe(rgb(tokens["muted-foreground"]));

    // NP-313: `primary` is the web's neutral (zinc-900 / white), and the brand
    // red is a different token entirely.
    expect(active).not.toBe(rgb(tokens.brand));
  });
});

// ---------------------------------------------------------------------------
// 4. Nothing hides behind the bar
// ---------------------------------------------------------------------------

describe("(NP-351) content scrolls under the bar without hiding behind it", () => {
  it("reserves the bar's whole footprint, computed from the worst case", () => {
    expect(TAB_BAR_CONTENT_INSET).toBe(
      TAB_BAR_MIN_BOTTOM + TAB_BAR_GAP + TAB_BAR_HEIGHT + 12,
    );
    // Taller than the capsule plus its gap, which is the whole requirement.
    expect(TAB_BAR_CONTENT_INSET).toBeGreaterThan(
      TAB_BAR_HEIGHT + TAB_BAR_GAP + TAB_BAR_MIN_BOTTOM,
    );
  });

  it("is applied by every tab root, from the one constant", () => {
    // Five tab roots, five scroll containers. A number typed in by hand is a
    // number that drifts from the bar's height.
    for (const rel of [
      "components/DashboardScreen.tsx",
      "app/(app)/(tabs)/programming/index.tsx",
      "app/(app)/(tabs)/mind/index.tsx",
      "app/(app)/(tabs)/nutrition/index.tsx",
      "components/profile/ProfileScreen.tsx",
    ]) {
      const src = readExpo(rel);
      expect(src).toContain(
        'import { TAB_BAR_CONTENT_INSET } from "@/lib/navigation/tabBarInset"',
      );
      expect(src).toContain("paddingBottom: TAB_BAR_CONTENT_INSET");
    }
  });

  it("pads every PUSHED screen's container, and exempts the tab roots", () => {
    // The long tail inside a tab (a program's detail, Nutrition Goals, the
    // recipe editor, …) is two dozen screens that are not each carrying a
    // hand-typed number — they take the padding from the one Stack they all
    // share, and the five roots opt out so their content scrolls under instead.
    const stack = readExpo("components/navigation/TabStack.tsx");
    expect(stack).toContain("useTabBarScreenInset()");
    expect(stack).toContain("paddingBottom: tabBarInset");
    expect(stack).toContain('name="index"');
    expect(stack).toContain("contentStyle: { backgroundColor: colors.background }");

    // Measured from the bottom of the SCREEN, because a Stack's container is
    // not safe-area inset: it has to clear the capsule, its gap and the
    // indicator under it.
    expect(tabBarScreenInset(34)).toBe(34 + TAB_BAR_GAP + TAB_BAR_HEIGHT + 12);
    expect(tabBarScreenInset(34)).toBeGreaterThan(
      tabBarBottomOffset(34) + TAB_BAR_HEIGHT,
    );
    // …and still clears it on a device that reports no bottom inset at all.
    expect(tabBarScreenInset(0)).toBeGreaterThan(
      tabBarBottomOffset(0) + TAB_BAR_HEIGHT,
    );
  });

  it("does not ask the navigator to reserve the space as well", () => {
    // The old bar was in the layout flow, so bottom-tabs sized the scene
    // around it. This one is absolute: if the scene were ALSO padded the pill
    // would float over a dead band instead of over content.
    const bar = readExpo("components/navigation/GlassTabBar.tsx");
    expect(bar).toContain('position: "absolute"');
    expect(bar).toContain('pointerEvents="box-none"');
  });
});
