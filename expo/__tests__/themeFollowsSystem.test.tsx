/* eslint-disable import/first */
// LIGHT AND DARK, FROM THE SYSTEM — the test for "as the web does" (NP-123).
//
// The web follows `prefers-color-scheme`: `webapp/app/layout.tsx` toggles the
// `dark` class from the media query, live. Native shipped dark-only — 43
// `#0a0a0a` literals in plain RN styles and 20 `resolveToken(…, "dark")` calls —
// and NP-013 pinned NativeWind to dark so the two halves could not disagree.
//
// This suite is what replaces that pin (`darkModePin.test.tsx`). Five things have
// to be true, and it asserts all five:
//
//   1. the scheme is the SYSTEM's — no pin, and the OS is told there is no
//      override (`Appearance.setColorScheme`);
//   2. `useThemeTokens()` returns the mode's palette, and a LIVE flip of the
//      system setting re-renders what is already on screen;
//   3. the surfaces RN owns and Tailwind cannot reach — the window, the status
//      bar, the navigators — take their colour from the same hook;
//   4. `app.json` agrees: `userInterfaceStyle: "automatic"`, and the launch
//      screen has a light variant whose mark is dark ink (a white mark on
//      #fafafa is an empty splash);
//   5. every surface is legible in BOTH modes — contrast, computed, not eyeballed.
//
// `expo/__tests__/noHexColorLiterals.test.ts` is the other half: no literal can
// come back.

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return null;
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

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
import * as zlib from "zlib";
import { Appearance, View } from "react-native";
import { act, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import * as SystemUI from "expo-system-ui";
import {
  COLOR_SCHEME_SOURCE,
  followSystemColorScheme,
} from "@/lib/theme/colorScheme";
import {
  darkTokens,
  getTokens,
  lightTokens,
  resolveToken,
  scrimByMode,
  tintToken,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";
import {
  themeModeFrom,
  useThemeTokens,
  useThemedWindowBackground,
} from "@/lib/theme/useThemeTokens";
import { DashboardScreen } from "@/components/DashboardScreen";
import { StreakBanner } from "@/components/StreakBanner";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const rgb = (triplet: string) => `rgb(${triplet})`;

type RGB = [number, number, number];

/** A token's three channels as numbers — `"10 10 10"` → `[10, 10, 10]`. */
function channels(mode: ThemeMode, name: TokenName): RGB {
  const [r = 0, g = 0, b = 0] = getTokens(mode)[name].split(" ").map(Number);
  return [r, g, b];
}

/** The whole point: what NativeWind reports is what the phone is set to. */
function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

function Probe() {
  const { mode, colors, statusBarStyle, scrim, isDark } = useThemeTokens();
  return (
    <View
      testID="probe"
      accessibilityLabel={`${mode}|${statusBarStyle}|${isDark}|${scrim}`}
      style={{ backgroundColor: colors.background, borderColor: colors.border }}
    />
  );
}

/** The loading state: the SafeAreaView surface plus three skeleton blocks. */
const dashboardProps = {
  loading: true,
  userName: "Jon",
  streakDays: 3,
  todayWorkout: null,
  onStartWorkout: () => {},
  onOpenCalendar: () => {},
  onSubmitCheckIn: () => {},
};

function WindowProbe() {
  useThemedWindowBackground();
  return <View testID="window-probe" />;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── 1. the system decides ───────────────────────────────────────────────────

describe("the scheme is the system's, not a pin", () => {
  it("tells the OS there is no override", () => {
    const spy = jest.spyOn(Appearance, "setColorScheme");
    followSystemColorScheme();
    expect(COLOR_SCHEME_SOURCE).toBe("system");
    // `null` / `"unspecified"` is React Native's "follow the device" — the
    // argument NativeWind passes for `"system"`. Anything else is a pin.
    expect(spy).toHaveBeenCalledTimes(1);
    expect([null, "unspecified"]).toContain(spy.mock.calls[0]?.[0] ?? null);
    spy.mockRestore();
  });

  it("does not force dark when the system asks for light", () => {
    // This is exactly what NP-013 did and what this card undoes.
    setSystemScheme("light");
    followSystemColorScheme();
    expect(colorScheme.get()).not.toBe("dark");
  });

  it("the root layout says so at module load, not in an effect", () => {
    // Module scope, above the component: an effect runs after the first paint,
    // which is one frame in the wrong theme on every cold start.
    const layout = readExpo("app/_layout.tsx");
    const body = layout.slice(0, layout.indexOf("export default function"));
    expect(body).toMatch(/^followSystemColorScheme\(\);$/m);
    expect(layout).toMatch(
      /import \{ followSystemColorScheme \} from "@\/lib\/theme\/colorScheme"/,
    );
    expect(layout).not.toContain("pinDarkMode");
  });

  it("importing the real root layout leaves the scheme following the system", () => {
    const spy = jest.spyOn(Appearance, "setColorScheme");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../app/_layout");
    expect(spy).toHaveBeenCalled();
    expect([null, "unspecified"]).toContain(spy.mock.calls[0]?.[0] ?? null);
    spy.mockRestore();
  });
});

// ─── 2. the hook, and a live flip ────────────────────────────────────────────

describe("useThemeTokens() reads the live scheme", () => {
  it("hands out the light palette in light mode", () => {
    setSystemScheme("light");
    const { getByTestId } = render(<Probe />);
    const probe = getByTestId("probe");
    expect(probe.props.style).toMatchObject({
      backgroundColor: rgb(lightTokens.background),
      borderColor: rgb(lightTokens.border),
    });
    expect(probe.props.accessibilityLabel).toBe(
      `light|dark|false|${scrimByMode.light}`,
    );
  });

  it("hands out the dark palette in dark mode", () => {
    setSystemScheme("dark");
    const { getByTestId } = render(<Probe />);
    const probe = getByTestId("probe");
    expect(probe.props.style).toMatchObject({
      backgroundColor: rgb(darkTokens.background),
      borderColor: rgb(darkTokens.border),
    });
    expect(probe.props.accessibilityLabel).toBe(
      `dark|light|true|${scrimByMode.dark}`,
    );
  });

  it("switches what is ALREADY on screen when the system flips", () => {
    // The live case, which is the one a member sees at sunset: no remount, no
    // navigation — the same element repaints.
    setSystemScheme("dark");
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe").props.style.backgroundColor).toBe(
      rgb(darkTokens.background),
    );

    setSystemScheme("light");
    expect(getByTestId("probe").props.style.backgroundColor).toBe(
      rgb(lightTokens.background),
    );

    setSystemScheme("dark");
    expect(getByTestId("probe").props.style.backgroundColor).toBe(
      rgb(darkTokens.background),
    );
  });

  it("falls back to dark when the platform reports no scheme", () => {
    // The launch surface, the splash and the icon plate are all #0a0a0a, so an
    // unknown scheme paints what was already on screen.
    expect(themeModeFrom(undefined)).toBe("dark");
    expect(themeModeFrom(null)).toBe("dark");
    expect(themeModeFrom("light")).toBe("light");
    expect(themeModeFrom("dark")).toBe("dark");
  });

  it("resolveToken refuses to guess a mode", () => {
    // The old default was `"dark"`, and that default is what painted dark-mode
    // colours on a light-mode phone in 20 places.
    expect(resolveToken.length).toBe(2);
    expect(resolveToken("background", "light")).toBe(rgb(lightTokens.background));
    expect(resolveToken("background", "dark")).toBe(rgb(darkTokens.background));
  });
});

// ─── 3. the surfaces Tailwind cannot reach ───────────────────────────────────

describe("the window, the status bar and the navigators follow it too", () => {
  it("repaints the window background from the theme, and again on a flip", async () => {
    const setBackground = SystemUI.setBackgroundColorAsync as jest.Mock;
    setSystemScheme("light");
    render(<WindowProbe />);
    await act(async () => {});
    expect(setBackground).toHaveBeenCalledWith(rgb(lightTokens.background));

    setSystemScheme("dark");
    await act(async () => {});
    expect(setBackground).toHaveBeenLastCalledWith(rgb(darkTokens.background));
  });

  it("derives the status bar CONTENT from the mode", () => {
    // `style` names the glyphs: light glyphs on a dark surface and the reverse.
    // Hard-coded `style="light"` was invisible on a light-mode phone.
    const layout = readExpo("app/_layout.tsx");
    expect(layout).toContain("<StatusBar style={statusBarStyle} />");
    expect(layout).not.toContain('<StatusBar style="light" />');
    expect(layout).toContain("useThemedWindowBackground()");
  });

  it("gives the tab bar and every Stack a themed surface", () => {
    for (const rel of [
      "app/_layout.tsx",
      "app/(app)/_layout.tsx",
      "app/(auth)/_layout.tsx",
      "components/navigation/TabStack.tsx",
    ]) {
      expect(readExpo(rel)).toContain(
        "contentStyle: { backgroundColor: colors.background }",
      );
    }
    const tabs = readExpo("app/(app)/(tabs)/_layout.tsx");
    expect(tabs).toContain("tabBarActiveTintColor: colors.primary");
    expect(tabs).toContain('tabBarInactiveTintColor: colors["muted-foreground"]');
    expect(tabs).toContain("sceneStyle: { backgroundColor: colors.background }");

    // The bar's own SURFACE moved out of here with NP-351: it is no longer an
    // opaque `backgroundColor` + `borderTopColor` on `tabBarStyle` but a
    // floating glass capsule, which gets its material from the platform and
    // its border/active-pill washes from `tint()` — the same hook, so a system
    // flip still re-renders them.
    const bar = readExpo("components/navigation/GlassTabBar.tsx");
    expect(bar).toContain("useThemeTokens()");
    expect(bar).toContain('tint("border", 0.7)');
    expect(bar).toContain('tint("card", liquidGlass ? 0 : 0.6)');
    expect(bar).toContain('colorScheme={isDark ? "dark" : "light"}');
    expect(bar).not.toContain("borderTopColor");
  });

  it("renders a real screen in both modes, spinner and skeleton included", () => {
    // DashboardScreen is the screen with the most non-class colour in it: the
    // SafeAreaView surface, three skeleton blocks and the settings icon.
    setSystemScheme("light");
    const light = render(<DashboardScreen {...dashboardProps} />);
    expect(light.getByTestId("dashboard-screen").props.style).toMatchObject({
      backgroundColor: rgb(lightTokens.background),
    });
    light.unmount();

    setSystemScheme("dark");
    const dark = render(<DashboardScreen {...dashboardProps} />);
    expect(dark.getByTestId("dashboard-screen").props.style).toMatchObject({
      backgroundColor: rgb(darkTokens.background),
    });
  });

  it("gives a lucide icon the mode's colour, live", () => {
    setSystemScheme("light");
    const { getByTestId, UNSAFE_getByType } = render(
      <StreakBanner streakDays={4} />,
    );
    expect(getByTestId("streak-banner")).toBeTruthy();
    const flameLight = UNSAFE_getByType(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("lucide-react-native").Flame,
    );
    expect(flameLight.props.color).toBe(rgb(lightTokens.primary));

    setSystemScheme("dark");
    const flameDark = UNSAFE_getByType(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("lucide-react-native").Flame,
    );
    expect(flameDark.props.color).toBe(rgb(darkTokens.primary));
  });
});

// ─── 4. app.json, and the launch screen ──────────────────────────────────────

describe("app.json and the launch screen agree", () => {
  const config = JSON.parse(readExpo("app.json")) as {
    expo: {
      userInterfaceStyle?: string;
      backgroundColor?: string;
      plugins?: (string | [string, Record<string, unknown>?])[];
    };
  };

  const splash = (): Record<string, unknown> => {
    const entry = (config.expo.plugins ?? []).find(
      (p) => (typeof p === "string" ? p : p[0]) === "expo-splash-screen",
    ) as [string, Record<string, unknown>];
    return entry[1];
  };

  it("hands the OS back the decision", () => {
    // `dark` (NP-013) meant every native surface the app does not draw — the
    // keyboard, the share sheet, the launch screen — stayed dark on a light
    // phone.
    expect(config.expo.userInterfaceStyle).toBe("automatic");
  });

  it("has a light launch screen and a dark one", () => {
    const props = splash();
    const dark = props.dark as { backgroundColor?: string; image?: string };
    expect(props.backgroundColor).toBe(hexFor(lightTokens.background));
    expect(dark.backgroundColor).toBe(hexFor(darkTokens.background));
    // Different backgrounds AND different marks: same artwork, opposite ink.
    expect(props.image).not.toBe(dark.image);
    expect(props.image).toBe("./assets/splash-icon-light.png");
    expect(dark.image).toBe("./assets/splash-icon.png");
  });

  it("every splash asset it names is on disk", () => {
    for (const rel of [splash().image, (splash().dark as { image: string }).image]) {
      expect(fs.existsSync(path.join(EXPO_DIR, rel as string))).toBe(true);
    }
  });

  it("paints the light mark in dark ink — a white mark on #fafafa is nothing", () => {
    const lightMark = readMarkInk("assets/splash-icon-light.png");
    const darkMark = readMarkInk("assets/splash-icon.png");
    expect(lightMark).toEqual([24, 24, 27]); // zinc-900, the light foreground
    expect(darkMark).toEqual([255, 255, 255]);
  });

  it("keeps a pre-JS window colour, which the theme then repaints", () => {
    // One static value for a window that has two colours: it is the frame
    // before JS exists. `useThemedWindowBackground()` corrects it while the
    // splash is still up (asserted above).
    expect(config.expo.backgroundColor).toBe(hexFor(darkTokens.background));
  });
});

// ─── 5. legibility, in both modes ────────────────────────────────────────────

describe("every surface is legible in both modes", () => {
  const CHANNEL = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const luminance = ([r, g, b]: RGB) =>
    0.2126 * CHANNEL(r) + 0.7152 * CHANNEL(g) + 0.0722 * CHANNEL(b);

  const contrast = (a: RGB, b: RGB) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  /** `tintToken` over a surface, the way the phone composites it. */
  const over = (
    mode: ThemeMode,
    name: TokenName,
    alpha: number,
    surface: TokenName,
  ): RGB => {
    const [fr, fg, fb] = channels(mode, name);
    const [br, bg, bb] = channels(mode, surface);
    const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
    return [mix(fr, br), mix(fg, bg), mix(fb, bb)];
  };

  const modes: ThemeMode[] = ["light", "dark"];

  it.each(modes)("%s: body text clears 4.5:1 on the screen and on a card", (mode) => {
    for (const surface of ["background", "card", "muted"] as TokenName[]) {
      expect(
        contrast(channels(mode, "foreground"), channels(mode, surface)),
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ["background", "card"] as TokenName[]) {
      expect(
        contrast(channels(mode, "muted-foreground"), channels(mode, surface)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(modes)("%s: the error banner is readable on its own tint", (mode) => {
    // `tint("destructive", 0.18)` is the banner's surface (the web's
    // `bg-red-50 dark:bg-red-950/30`), and the text on it is `text-destructive`.
    expect(
      contrast(
        channels(mode, "destructive"),
        over(mode, "destructive", 0.18, "background"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(channels(mode, "destructive"), channels(mode, "background")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(modes)("%s: the PR banner is readable on its own tint", (mode) => {
    expect(
      contrast(
        channels(mode, "foreground"),
        over(mode, "success", 0.18, "background"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(modes)("%s: icons and spinners clear 3:1 as graphics", (mode) => {
    for (const name of ["primary", "brand", "accent", "success"] as TokenName[]) {
      for (const surface of ["background", "card"] as TokenName[]) {
        expect(
          contrast(channels(mode, name), channels(mode, surface)),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(modes)("%s: a filled button's label stays on its pair", (mode) => {
    // The primary pair is the web's own neutral one now (NP-313) —
    // `bg-zinc-900 text-white` / `dark:bg-white dark:text-black` — so its label
    // clears the TEXT bar, not merely the graphics bar it used to when the
    // button was red-500 and white on it was 3.76:1.
    expect(
      contrast(channels(mode, "primary-foreground"), channels(mode, "primary")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(channels(mode, "accent-foreground"), channels(mode, "accent")),
    ).toBeGreaterThanOrEqual(3);
    // White on the brand red is 4.8:1 in light (red-600) and 3.95:1 in dark
    // (red-500) — the web's `bg-red-500/600 text-white`, byte for byte, so the
    // bar is the graphics bar and the dark shortfall is recorded, not hidden.
    expect(
      contrast(channels(mode, "brand-foreground"), channels(mode, "brand")),
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(modes)("%s: the modal scrim actually darkens the page", (mode) => {
    // Enough of a wash to read as a modal in both modes — the web's `--backdrop`
    // is 0.5 on dark, and light needs more than its 0.2 on a phone.
    const alpha = Number(/([\d.]+)\)$/.exec(scrimByMode[mode])?.[1] ?? "0");
    expect(alpha).toBeGreaterThanOrEqual(0.3);
    expect(alpha).toBeLessThanOrEqual(0.6);
  });

  it("a sheet is an elevated surface in both modes, not the page colour", () => {
    // In light mode a #fafafa sheet on a #fafafa page has no edge at all, so
    // both sheets take `card` (white / zinc-900) and the scrim behind them.
    for (const rel of [
      "components/schedule/RescheduleModal.tsx",
      "components/live/ExerciseSwapModal.tsx",
    ]) {
      const src = readExpo(rel);
      expect(src).toContain("backgroundColor: colors.card");
      expect(src).toContain("backgroundColor: scrim");
    }
  });
});

// ─── the two files that hold the palette cannot drift ────────────────────────

describe("global.css and lib/theme/tokens.ts are the same palette", () => {
  const css = readExpo("global.css");

  const blockFor = (mode: ThemeMode): string => {
    const start = mode === "light" ? css.indexOf(":root {") : css.indexOf(".dark {");
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it.each<ThemeMode>(["light", "dark"])(
    "%s: every token in the CSS has the same triplet in TS",
    (mode) => {
      const block = blockFor(mode);
      const declared = [...block.matchAll(/--([a-z-]+):\s*([\d ]+);/g)];
      expect(declared.length).toBe(Object.keys(getTokens(mode)).length);
      for (const match of declared) {
        const name = match[1] as TokenName;
        const value = (match[2] ?? "").trim();
        expect(getTokens(mode)[name]).toBe(value);
      }
    },
  );

  it("tailwind.config.js exposes every token as a class", () => {
    const config = readExpo("tailwind.config.js");
    for (const name of Object.keys(lightTokens)) {
      expect(config).toContain(`var(--${name})`);
    }
  });

  it("the web's zinc palette, where the web is the one that defined it", () => {
    // Spot-checks against `webapp/`'s classes, which is where these values come
    // from: zinc-50 / zinc-900 surfaces, white cards, zinc text, and a NEUTRAL
    // primary action (NP-313) with red kept for `brand` / `destructive`.
    expect(lightTokens.background).toBe("250 250 250"); // zinc-50
    expect(lightTokens.card).toBe("255 255 255"); // white
    expect(lightTokens.foreground).toBe("24 24 27"); // zinc-900
    expect(darkTokens.card).toBe("24 24 27"); // zinc-900
    expect(darkTokens["muted-foreground"]).toBe("161 161 170"); // zinc-400
    // `bg-zinc-900 text-white dark:bg-white dark:text-black`
    expect(lightTokens.primary).toBe("24 24 27");
    expect(lightTokens["primary-foreground"]).toBe("255 255 255");
    expect(darkTokens.primary).toBe("255 255 255");
    expect(darkTokens["primary-foreground"]).toBe("24 24 27");
    // The brand red is still mode-aware red, on its own token.
    expect(lightTokens.brand).toBe("220 38 38"); // red-600
    expect(darkTokens.brand).toBe("239 68 68"); // red-500
    expect(tintToken("destructive", "dark", 0.18)).toBe("rgba(248, 113, 113, 0.18)");
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function hexFor(triplet: string): string {
  return `#${triplet
    .split(" ")
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The RGB of the first opaque pixel of a splash mark.
 *
 * `scripts/generate-app-assets.mjs` writes 8-bit RGBA with filter 0 on every
 * row, which is why 12 lines of zlib is a decoder here: inflate, then skip one
 * filter byte per row.
 */
function readMarkInk(rel: string): RGB {
  const buf = fs.readFileSync(path.join(EXPO_DIR, rel));
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); // bit depth
      expect(data[9]).toBe(6); // RGBA — the mark needs its alpha
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(0); // filter: none
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < width; x++) {
      if (row[x * 4 + 3] === 255) {
        return [row[x * 4] ?? 0, row[x * 4 + 1] ?? 0, row[x * 4 + 2] ?? 0];
      }
    }
  }
  throw new Error(`${rel} has no opaque pixel — is the mark there at all?`);
}
