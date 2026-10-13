/* eslint-disable import/first */
// NP-340 — SCREEN TRANSITIONS JITTER AND FLASH WHITE ON THE LEFT EDGE
// (push, back and tab switches).
//
// George, 10/7, on his Pixel (build 488e7d2e): "The screen sliding/changing is
// pretty weird in terms of animation. Just kinda jitters and shows a flash of
// white on the left edge of the screen."
//
// THE WHITE WAS NEVER A SCREEN. expo-router's `ExpoRoot` renders a
// `NavigationContainer` whose `theme` defaults to React Navigation's
// `DefaultTheme` — the LIGHT one, `background: rgb(242, 242, 242)` — and
// nothing in this app ever provided a different one, in either colour scheme.
// Two navigator surfaces are painted from that theme and from NOTHING else, so
// no amount of `contentStyle` reached them:
//
//   • native-stack's `ScreenStack` `nativeContainerStyle` — the native view
//     BEHIND the two sliding screens of a push or a back. That is the left-edge
//     flash, frame for frame.
//   • bottom-tabs' `elements/Background`, the wrapper every tab scene renders
//     into — the same near-white on a tab switch.
//
// AND THE JITTER WAS THE DEFAULT ANIMATION. Every Stack left `animation`
// unset, which is `presentation: "card"`'s default, which react-native-screens
// documents as varying "depending on the OS version and theme" on Android. On
// Android 15 that is the Material predictive-back transition, whose outgoing
// screen travels further than the incoming one covers — so it uncovers the
// container colour above, with a curve that matches nothing else in the app.
//
// So this suite pins all three halves of the fix, rendered against the REAL
// route tree wherever it can be:
//
//   1. `app/_layout.tsx` provides a `ThemeProvider` built from OUR tokens, so
//      the native stack container and the tab scene are the page colour in
//      both modes and on a live flip;
//   2. every Stack asks for ONE explicit animation (`ios_from_right`), and
//      `"none"` when the OS asks for reduced motion;
//   3. the tab navigator paints its scene container, and the two plain
//      containers above the router carry the theme background too.

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
    __reset(): void {
      mem.clear();
    },
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({
      user: { _id: "u1", email: "jon@example.com" },
    })),
  };
});

import * as fs from "fs";
import * as path from "path";
import { AccessibilityInfo } from "react-native";
import { colorScheme } from "nativewind";
import { DarkTheme, DefaultTheme, router } from "expo-router";
import { act, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { appRouteMap, savedJwt, screenId } from "../test-support/appRoutes";
import { TAB_STACK_SCREEN_OPTIONS } from "@/components/navigation/TabStack";
import { navigationThemeFor } from "@/lib/theme/navigationTheme";
import {
  PUSH_ANIMATION,
  stackAnimation,
} from "@/lib/navigation/screenAnimation";
import {
  darkTokens,
  lightTokens,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const rgb = (triplet: string) => `rgb(${triplet})`;
const tokens = (mode: ThemeMode) => (mode === "dark" ? darkTokens : lightTokens);
const token = (mode: ThemeMode, name: TokenName) => rgb(tokens(mode)[name]);

/** The four files that declare a navigator. */
const NAVIGATOR_FILES = [
  "app/_layout.tsx",
  "app/(app)/_layout.tsx",
  "app/(auth)/_layout.tsx",
  "components/navigation/TabStack.tsx",
];

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

/** Every rendered node whose component is named `name`. */
function nodesNamed(name: string): { props: Record<string, unknown> }[] {
  return screen.UNSAFE_root.findAll((n) => {
    const type = n.type as unknown as { displayName?: string; name?: string };
    const named =
      typeof n.type === "string"
        ? String(n.type)
        : (type?.displayName ?? type?.name ?? "");
    return named === name;
  }) as unknown as { props: Record<string, unknown> }[];
}

/** Every `backgroundColor` inside a possibly-nested RN style prop. */
function backgroundsIn(style: unknown): string[] {
  if (Array.isArray(style)) return style.flatMap(backgroundsIn);
  if (style && typeof style === "object") {
    const value = (style as { backgroundColor?: unknown }).backgroundColor;
    return typeof value === "string" ? [value] : [];
  }
  return [];
}

/**
 * The real signed-in shell, pushed one screen deep inside the Workout tab.
 *
 * `mode` is applied AFTER the first render on purpose: importing the real
 * `app/_layout.tsx` runs `followSystemColorScheme()` at module scope (NP-123),
 * which hands the scheme back to the OS — so a scheme set before the router
 * mounts is overwritten by the layout's own module body.
 */
async function renderPushedDetail(mode: ThemeMode = "dark"): Promise<void> {
  await SecureStore.setItemAsync("become.session", savedJwt());
  renderRouter(appRouteMap() as never, { initialUrl: "/(tabs)/programming" });
  expect(
    await screen.findByTestId(screenId("(app)/(tabs)/programming/index")),
  ).toBeTruthy();
  setSystemScheme(mode);
  act(() => {
    router.push("/(tabs)/programming/p1" as never);
  });
  expect(
    await screen.findByTestId(screenId("(app)/(tabs)/programming/[id]/index")),
  ).toBeTruthy();
}

beforeEach(() => {
  fake.__reset();
  setSystemScheme("dark");
});

// ─── 1. the theme the navigators read is OURS ────────────────────────────────

describe("(NP-340) React Navigation's theme is built from our tokens", () => {
  it.each<ThemeMode>(["light", "dark"])(
    "%s: background and card are the page colour, not the default theme's",
    (mode) => {
      const theme = navigationThemeFor(mode);

      expect(theme.dark).toBe(mode === "dark");
      expect(theme.colors.background).toBe(token(mode, "background"));
      // `card` is our BACKGROUND on purpose: React Navigation's `card` is the
      // colour of the surfaces IT draws (its header, its tab bar), and in this
      // app those are hidden or already overridden to the page colour. Our
      // elevated `card` token there would reintroduce the seam.
      expect(theme.colors.card).toBe(token(mode, "background"));
      expect(theme.colors.text).toBe(token(mode, "foreground"));
      expect(theme.colors.border).toBe(token(mode, "border"));
      expect(theme.colors.primary).toBe(token(mode, "primary"));
      expect(theme.colors.notification).toBe(token(mode, "brand"));

      // And it is not what shipped: the default theme is the same near-white
      // in BOTH schemes, which is the colour George filmed.
      const base = mode === "dark" ? DarkTheme : DefaultTheme;
      expect(theme.colors.background).not.toBe(base.colors.background);
      expect(theme.colors.card).not.toBe(base.colors.card);
      expect(DefaultTheme.colors.background).not.toBe(
        token("light", "background"),
      );
    },
  );

  it("keeps the base theme's fonts — the typeface is not this card", () => {
    expect(navigationThemeFor("dark").fonts).toBe(DarkTheme.fonts);
    expect(navigationThemeFor("light").fonts).toBe(DefaultTheme.fonts);
  });

  it("is provided ABOVE every navigator, in the root layout", () => {
    // The mechanism, named in the one file that can own it: a ThemeProvider
    // inside a single navigator would leave the other ten on the default.
    const layout = readExpo("app/_layout.tsx");
    expect(layout).toContain("<ThemeProvider value={navigationTheme}>");
    expect(layout).toContain(
      'import { useNavigationTheme } from "@/lib/theme/navigationTheme"',
    );
  });
});

// ─── 2. the native container behind a push, rendered ─────────────────────────

describe("(NP-340) the surface a sliding screen uncovers", () => {
  it("paints the native stack container the page colour, not near-white", async () => {
    await renderPushedDetail("dark");

    // `nativeContainerStyle` is the ONLY thing painting the view behind the two
    // screens of a push; native-stack takes it straight from the theme's
    // `colors.background`. There is one per Stack in the tree (root, (app) and
    // the tab's own), and every one of them has to be ours.
    const stacks = nodesNamed("ScreenStack");
    expect(stacks.length).toBeGreaterThanOrEqual(3);
    for (const stack of stacks) {
      expect(stack.props.nativeContainerStyle).toEqual({
        backgroundColor: token("dark", "background"),
      });
      expect(stack.props.nativeContainerStyle).not.toEqual({
        backgroundColor: DefaultTheme.colors.background,
      });
    }
  });

  it("repaints it when the system flips to light, with the push still open", async () => {
    await renderPushedDetail("dark");

    setSystemScheme("light");
    for (const stack of nodesNamed("ScreenStack")) {
      expect(stack.props.nativeContainerStyle).toEqual({
        backgroundColor: token("light", "background"),
      });
    }

    setSystemScheme("dark");
    for (const stack of nodesNamed("ScreenStack")) {
      expect(stack.props.nativeContainerStyle).toEqual({
        backgroundColor: token("dark", "background"),
      });
    }
  });

  it("gives the bottom-tabs scene container the page colour too", async () => {
    await renderPushedDetail("dark");

    // The tab scene is rendered into react-navigation's `elements/Screen`,
    // which wraps it in a themed `Background` and then applies the navigator's
    // `sceneStyle`. The tab navigator had no `sceneStyle` at all, so a switch
    // showed whatever the theme said — the near-white above.
    const scenes = nodesNamed("Screen").filter(
      (n) => "focused" in n.props && "route" in n.props,
    );
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    for (const scene of scenes) {
      expect(backgroundsIn(scene.props.style)).toContain(
        token("dark", "background"),
      );
    }
  });

  it("names sceneStyle in the tab navigator, and keeps the switch a cut", () => {
    const tabs = readExpo("app/(app)/(tabs)/_layout.tsx");
    expect(tabs).toContain("sceneStyle: { backgroundColor: colors.background }");
    // bottom-tabs' default, said out loud: a tab switch is instant, so there
    // is no cross-fade to flash through.
    expect(tabs).toContain('animation: "none"');
  });
});

// ─── 3. one explicit animation, on every Stack ───────────────────────────────

describe("(NP-340) one explicit push animation", () => {
  it("is ios_from_right — the same motion on Android and iOS", () => {
    // Android: react-native-screens' own iOS-style push, so the outgoing
    // screen parallaxes to -30% and the pair covers the frame throughout.
    // iOS: resolves to the platform default, which IS that push.
    expect(PUSH_ANIMATION).toBe("ios_from_right");
    expect(
      (TAB_STACK_SCREEN_OPTIONS as { animation?: string }).animation,
    ).toBe(PUSH_ANIMATION);
  });

  it("is asked for by every navigator file — none is left on the default", () => {
    for (const rel of NAVIGATOR_FILES) {
      const src = readExpo(rel);
      expect(src).toMatch(/animation,?\n/);
      expect(src).toContain("screenAnimation");
    }
  });

  it("reaches every screen of a real push", async () => {
    await renderPushedDetail();

    // One RNSScreen per stack entry; `stackAnimation` is what the native side
    // reads. Unset, it is `undefined` and Android picks its own.
    const animations = nodesNamed("RNSScreen")
      .map((n) => n.props.stackAnimation)
      .filter((value) => value !== undefined);
    expect(animations.length).toBeGreaterThanOrEqual(2);
    expect(animations.every((value) => value === "ios_from_right")).toBe(true);
  });
});

// ─── 4. reduced motion cuts instead of sliding ───────────────────────────────

describe("(NP-340) Reduce Motion / Remove animations", () => {
  it("resolves to a cut, and to the push otherwise", () => {
    expect(stackAnimation(true)).toBe("none");
    expect(stackAnimation(false)).toBe(PUSH_ANIMATION);
  });

  it("cuts a real push when the OS asks for it", async () => {
    const read = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockImplementation(() => Promise.resolve(true));
    try {
      await renderPushedDetail();

      // `useReducedMotion()` starts false and lands on the system's answer on
      // the first tick, so the navigator re-renders with `animation: "none"`.
      await waitFor(() => {
        const animations = nodesNamed("RNSScreen")
          .map((n) => n.props.stackAnimation)
          .filter((value) => value !== undefined);
        expect(animations.length).toBeGreaterThanOrEqual(2);
        expect(animations.every((value) => value === "none")).toBe(true);
      });
    } finally {
      read.mockRestore();
    }
  });
});

// ─── 5. the containers above the router ──────────────────────────────────────

describe("(NP-340) nothing above the router is transparent", () => {
  it("paints the gesture root and the banner container from the theme", () => {
    // Both were `{ flex: 1 }`. Transparent, they showed the native window
    // colour through any frame a screen did not cover — and the window colour
    // is set asynchronously (`SystemUI.setBackgroundColorAsync`), so during a
    // cold start or a live scheme flip it is briefly the other mode's.
    const layout = readExpo("app/_layout.tsx");
    expect(layout).toContain("<GestureHandlerRootView style={rootStyle}>");
    expect(layout).toContain("<View style={rootStyle}>");
    expect(layout).toContain("backgroundColor: colors.background");
    expect(layout).not.toContain("<GestureHandlerRootView style={{ flex: 1 }}>");
    // …and the window itself is still repainted from the theme (NP-123).
    expect(layout).toContain("useThemedWindowBackground()");
  });
});
