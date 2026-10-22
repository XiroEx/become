/* eslint-disable import/first */
// ARIAL, THE WEB'S BODY TYPEFACE, ON THE PHONE.
//
// The web loads Geist but never uses it for body text: `webapp/app/globals.css`
// sets `body { font-family: Arial, Helvetica, sans-serif; }`, unlayered, so it
// overrides redstyle's `var(--font-geist-sans, …)`. Native drew all sans text
// in Geist, which was the visible mismatch across the whole app.
//
// Four things have to hold, and this file asserts all four:
//   1. the faces are IN THE REPO — Arimo (the metric-compatible Arial clone,
//      OFL) for Android's sans, and the four Geist Mono faces — plus iOS's
//      system Arial, which needs no file;
//   2. a `<Text>` resolves to the right FACE, because React Native names a
//      face and not a family+weight (`font-mono font-bold` is one file), with
//      the browser's Arial snap (100-500 → regular, 600-900 → bold, since
//      Arial ships only 400 and 700);
//   3. every screen and component goes through the app's Text, because React
//      Native has no cascade and an unstyled `<Text>` is the system font;
//   4. the launch screen is held until the faces are registered, so there is
//      no frame of the system font — a frame that never repaints, since React
//      Native does not re-render a `<Text>` when a font arrives.

jest.mock("expo-font", () => ({
  __esModule: true,
  useFonts: jest.fn(() => [true, null]),
}));

import * as fs from "fs";
import * as path from "path";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Platform, StyleSheet, View } from "react-native";
import type { TextStyle } from "react-native";
import { render } from "@testing-library/react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { RestTimerBar } from "@/components/live/RestTimerBar";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { StreakBanner } from "@/components/StreakBanner";
import {
  ANDROID_SANS_FACES,
  GEIST_FONTS,
  IOS_SANS_FACES,
  MONO_FACES,
  MONO_WEIGHTS,
  appFontFamily,
  geistFontFile,
  nearestGeistWeight,
  nearestSansWeight,
  sansFaceFor,
} from "@/lib/theme/fonts";
import { useGeistFonts } from "@/lib/theme/loadFonts";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(EXPO_DIR, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");
const readRepo = (rel: string): string =>
  fs.readFileSync(path.join(REPO_DIR, rel), "utf8");

const MONO_FILE_FACES = MONO_WEIGHTS.map(
  (w) => [MONO_FACES[w], w, "mono"] as const,
);
const SANS_FILE_FACES = [
  [ANDROID_SANS_FACES.regular, 400, "sans"],
  [ANDROID_SANS_FACES.bold, 700, "sans"],
] as const;
const ALL_FACES = [...SANS_FILE_FACES, ...MONO_FILE_FACES];

/** The style React Native actually receives, after the array is flattened. */
function styleOf(node: { props: { style?: unknown } }): TextStyle {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as TextStyle;
}

// ── 1. The files ───────────────────────────────────────────────────────────

/**
 * Enough of the sfnt container to prove the file is a real TrueType font and
 * to read the weight it declares — the same trick `appAssets.test.ts` plays on
 * the PNG headers. A 404 page saved as `.ttf` would sail past `existsSync`.
 */
function readTtf(file: string) {
  const buf = fs.readFileSync(file);
  const numTables = buf.readUInt16BE(4);
  let nameOffset: number | null = null;
  let os2Offset: number | null = null;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const tag = buf.toString("ascii", record, record + 4);
    const offset = buf.readUInt32BE(record + 8);
    if (tag === "name") nameOffset = offset;
    if (tag === "OS/2") os2Offset = offset;
  }
  const readNameId = (wanted: number): string | null => {
    if (nameOffset === null) return null;
    const count = buf.readUInt16BE(nameOffset + 2);
    const storage = nameOffset + buf.readUInt16BE(nameOffset + 4);
    for (let i = 0; i < count; i++) {
      const record = nameOffset + 6 + i * 12;
      const platform = buf.readUInt16BE(record);
      const encoding = buf.readUInt16BE(record + 2);
      const nameId = buf.readUInt16BE(record + 6);
      const length = buf.readUInt16BE(record + 8);
      const offset = buf.readUInt16BE(record + 10);
      if (nameId !== wanted || platform !== 3 || encoding !== 1) continue;
      return Buffer.from(buf.subarray(storage + offset, storage + offset + length))
        .swap16()
        .toString("utf16le");
    }
    return null;
  };
  return {
    sfntVersion: buf.readUInt32BE(0),
    bytes: buf.length,
    usWeightClass: os2Offset === null ? null : buf.readUInt16BE(os2Offset + 4),
    fullName: readNameId(4),
  };
}

describe("the faces are in the repo, not on a CDN", () => {
  it.each(ALL_FACES)("%s is a TrueType file on disk", (face) => {
    const file = path.join(EXPO_DIR, geistFontFile(face));
    expect(fs.existsSync(file)).toBe(true);
    // 0x00010000 is the sfnt version every TrueType outline font carries.
    expect(readTtf(file).sfntVersion).toBe(0x00010000);
  });

  it.each(ALL_FACES)("%s declares weight %s", (face, weight) => {
    expect(readTtf(path.join(EXPO_DIR, geistFontFile(face))).usWeightClass).toBe(
      weight,
    );
  });

  it.each(MONO_FILE_FACES)("%s names itself Geist Mono", (face) => {
    const fullName = readTtf(path.join(EXPO_DIR, geistFontFile(face))).fullName;
    expect(fullName).toMatch(/^Geist Mono (Regular|Medium|SemiBold|Bold)$/);
  });

  it.each(SANS_FILE_FACES)("%s names itself Arimo", (face) => {
    const fullName = readTtf(path.join(EXPO_DIR, geistFontFile(face))).fullName;
    expect(fullName).toMatch(/^Arimo (Regular|Bold)$/);
  });

  it("ships the OFL licences beside them", () => {
    const monoLicence = readExpo("assets/fonts/OFL.txt");
    expect(monoLicence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(monoLicence).toContain("Geist");
    const arimoLicence = readExpo("assets/fonts/Arimo-OFL.txt");
    expect(arimoLicence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(arimoLicence).toContain("Arimo");
  });

  it("hands every file-backed face to expo-font, and nothing else", () => {
    // iOS's Arial faces are system fonts — no file, nothing to register.
    expect(Object.keys(GEIST_FONTS).sort()).toEqual(
      ALL_FACES.map(([face]) => face).sort(),
    );
    for (const asset of Object.values(GEIST_FONTS)) {
      expect(asset).toBeDefined();
    }
  });

  it("declares expo-font as a dependency and a config plugin", () => {
    const pkg = JSON.parse(readExpo("package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["expo-font"]).toBeDefined();
    const appJson = JSON.parse(readExpo("app.json")) as {
      expo: { plugins?: (string | [string, unknown])[] };
    };
    const plugins = (appJson.expo.plugins ?? []).map((p) =>
      typeof p === "string" ? p : p[0],
    );
    expect(plugins).toContain("expo-font");
  });
});

// ── 2. The face a Text resolves to ─────────────────────────────────────────

describe("family × weight → one face", () => {
  it("is the iOS Arial regular face when nothing asks for anything", () => {
    expect(Platform.OS).toBe("ios");
    expect(appFontFamily()).toBe("ArialMT");
  });

  it.each([
    ["font-medium", "ArialMT"],
    ["font-semibold", "Arial-BoldMT"],
    ["font-bold", "Arial-BoldMT"],
    ["text-foreground text-xl font-semibold", "Arial-BoldMT"],
  ])("iOS: %s → %s", (className, face) => {
    expect(appFontFamily(className)).toBe(face);
  });

  it.each([
    ["font-medium", "Arimo-Regular"],
    ["font-semibold", "Arimo-Bold"],
    ["font-bold", "Arimo-Bold"],
    ["text-foreground text-xl font-semibold", "Arimo-Bold"],
  ])("Android: %s → %s", (className, face) => {
    expect(appFontFamily(className, undefined, "android")).toBe(face);
  });

  it.each([
    ["font-mono", "GeistMono-Regular"],
    ["font-mono font-medium", "GeistMono-Medium"],
    ["font-mono font-semibold", "GeistMono-SemiBold"],
    ["font-mono font-bold", "GeistMono-Bold"],
  ])("%s → %s — the pair CSS cannot express", (className, face) => {
    // `font-family` and `font-weight` are two properties in CSS and one file on
    // a phone. This is why the family is resolved in JS and not by NativeWind.
    expect(appFontFamily(className)).toBe(face);
    expect(appFontFamily(className, undefined, "android")).toBe(face);
  });

  it("snaps a weight with no file of its own to the nearest one bundled", () => {
    expect(appFontFamily("font-light")).toBe("ArialMT");
    expect(appFontFamily("font-extrabold")).toBe("Arial-BoldMT");
    expect(appFontFamily("font-black")).toBe("Arial-BoldMT");
    expect(nearestSansWeight(100)).toBe(400);
    expect(nearestSansWeight(500)).toBe(400);
    expect(nearestSansWeight(600)).toBe(700);
    expect(nearestSansWeight(900)).toBe(700);
    expect(nearestSansWeight(undefined)).toBe(400);
    expect(nearestGeistWeight(100)).toBe(400);
    expect(nearestGeistWeight(900)).toBe(700);
    expect(nearestGeistWeight(undefined)).toBe(400);
  });

  it("maps the sans weight per platform, pure in os", () => {
    expect(sansFaceFor("ios", null)).toBe(IOS_SANS_FACES.regular);
    expect(sansFaceFor("ios", null)).toBe("ArialMT");
    expect(sansFaceFor("ios", 500)).toBe("ArialMT");
    expect(sansFaceFor("ios", 600)).toBe("Arial-BoldMT");
    expect(sansFaceFor("android", null)).toBe(ANDROID_SANS_FACES.regular);
    expect(sansFaceFor("android", null)).toBe("Arimo-Regular");
    expect(sansFaceFor("android", 500)).toBe("Arimo-Regular");
    expect(sansFaceFor("android", 600)).toBe("Arimo-Bold");
  });

  it("reads a variant's base token, so active:font-bold is still bold", () => {
    expect(appFontFamily("active:font-bold")).toBe("Arial-BoldMT");
    expect(appFontFamily("active:font-bold", undefined, "android")).toBe(
      "Arimo-Bold",
    );
  });

  it("lets an inline weight win over a class — NativeWind's own order", () => {
    // react-native-css-interop sorts inline above className
    // (`specificityCompare`), so the resolver has to agree with it.
    expect(appFontFamily("font-normal", { fontWeight: "bold" })).toBe(
      "Arial-BoldMT",
    );
    expect(appFontFamily("font-bold", { fontWeight: 500 })).toBe("ArialMT");
    expect(appFontFamily(undefined, { fontFamily: "GeistMono-Regular" })).toBe(
      "GeistMono-Regular",
    );
  });
});

describe("<Text> carries the face it resolved", () => {
  it("renders in Arial with no class at all", () => {
    const { getByTestId } = render(<Text testID="t">Hello</Text>);
    expect(styleOf(getByTestId("t")).fontFamily).toBe("ArialMT");
  });

  it("renders a bold class in the bold FACE, not a faked weight", () => {
    const { getByTestId } = render(
      <Text testID="t" className="text-foreground font-bold">
        Hello
      </Text>,
    );
    expect(styleOf(getByTestId("t")).fontFamily).toBe("Arial-BoldMT");
  });

  it("renders in Arimo on Android", () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android" });
    try {
      const { getByTestId } = render(
        <Text testID="t" className="text-foreground font-semibold">
          Hello
        </Text>,
      );
      expect(styleOf(getByTestId("t")).fontFamily).toBe("Arimo-Bold");
    } finally {
      Object.defineProperty(Platform, "OS", { value: os });
    }
  });

  it("still lets a caller name its own font", () => {
    const { getByTestId } = render(
      <Text testID="t" style={{ fontFamily: "Courier" }}>
        Hello
      </Text>,
    );
    expect(styleOf(getByTestId("t")).fontFamily).toBe("Courier");
  });

  it("keeps the props it was given", () => {
    const { getByTestId } = render(
      <Text testID="t" numberOfLines={2} accessibilityLabel="greeting">
        Hello
      </Text>,
    );
    expect(getByTestId("t").props.numberOfLines).toBe(2);
    expect(getByTestId("t").props.accessibilityLabel).toBe("greeting");
  });

  it("puts it on the one TextInput too — a field is not a Text", () => {
    const { getByTestId } = render(<Input testID="i" label="Email" />);
    expect(styleOf(getByTestId("i")).fontFamily).toBe("ArialMT");
  });
});

// ── 3. Every screen, not just the ones that remembered ─────────────────────

describe("every screen, component and lib view goes through the app's Text", () => {
  const sourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
      }
    };
    walk(path.join(EXPO_DIR, dir));
    return out;
  };

  const files = [
    ...sourceFiles("app"),
    ...sourceFiles("components"),
    ...sourceFiles("lib"),
  ].filter((f) => f !== path.join(EXPO_DIR, "components", "Text.tsx"));

  it("finds the screens (guards against an empty sweep)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("imports Text from nowhere else", () => {
    // React Native's Text with no fontFamily is the system font, always. This
    // is the assertion behind "every native screen renders in Arial/Arimo".
    const offenders = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*"react-native"/.test(
        source,
      );
    });
    expect(offenders.map((f) => path.relative(EXPO_DIR, f))).toEqual([]);
  });

  it("and ESLint fails the next file that tries", () => {
    const config = readExpo("eslint.config.mjs");
    expect(config).toContain("no-restricted-imports");
    expect(config).toContain('importNames: ["Text"]');
  });
});

// ── 4. No flash of the system font ─────────────────────────────────────────

describe("the launch screen is held until the faces are in", () => {
  const mockedUseFonts = useFonts as unknown as jest.Mock;
  const splash = SplashScreen as unknown as {
    preventAutoHideAsync: jest.Mock;
    hideAsync: jest.Mock;
  };

  function Harness() {
    const { fontsReady } = useGeistFonts();
    return <View testID={fontsReady ? "ready" : "waiting"} />;
  }

  beforeEach(() => {
    splash.hideAsync.mockClear();
    splash.preventAutoHideAsync.mockClear();
  });

  it("keeps the splash up while the fonts load", () => {
    mockedUseFonts.mockReturnValue([false, null]);
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("waiting")).toBeTruthy();
    expect(splash.hideAsync).not.toHaveBeenCalled();
  });

  it("hides it once they are registered", () => {
    mockedUseFonts.mockReturnValue([true, null]);
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("ready")).toBeTruthy();
    expect(splash.hideAsync).toHaveBeenCalled();
  });

  it("hides it on a LOAD FAILURE too — a held splash is a dead app", () => {
    mockedUseFonts.mockReturnValue([false, new Error("no such asset")]);
    const { getByTestId } = render(<Harness />);
    expect(getByTestId("ready")).toBeTruthy();
    expect(splash.hideAsync).toHaveBeenCalled();
  });

  it("holds the splash at MODULE LOAD and renders nothing until ready", () => {
    // Both halves matter. An effect runs after the first paint, which is the
    // one frame this is about; and rendering the tree under the splash would
    // paint it in the system font, which React Native never repaints.
    const layout = readExpo("app/_layout.tsx");
    const body = layout.slice(0, layout.indexOf("export default function"));
    expect(body).toMatch(/^holdSplashForFonts\(\);$/m);
    expect(layout).toMatch(/if \(!fontsReady\) return null;/);
    expect(layout).toMatch(
      /import \{ holdSplashForFonts, useGeistFonts \} from "@\/lib\/theme\/loadFonts"/,
    );
  });
});

// ── The web is the source of truth ─────────────────────────────────────────

describe("the same families as the web", () => {
  it("NativeWind's sans is the iOS Arial regular; mono is the Geist Mono regular", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../tailwind.config.js") as {
      theme: { extend: { fontFamily: Record<string, string[]> } };
    };
    // The class can only name one family; the per-platform resolution
    // (ArialMT on iOS, bundled Arimo on Android) lives in `lib/theme/fonts.ts`
    // and is applied inline by `components/Text.tsx`, which outranks this.
    expect(config.theme.extend.fontFamily.sans).toEqual([
      IOS_SANS_FACES.regular,
    ]);
    expect(config.theme.extend.fontFamily.mono).toEqual([MONO_FACES[400]]);
  });

  it("is the typeface the web sets for its body", () => {
    // The web loads Geist but never uses it for body text: the unlayered
    // `body` rule wins over the Tailwind theme vars. If the web ever changes
    // its body typeface, this is the test that says so.
    const layout = readRepo("webapp/app/layout.tsx");
    expect(layout).toMatch(
      /import \{ Geist, Geist_Mono \} from "next\/font\/google"/,
    );
    const globals = readRepo("webapp/app/globals.css");
    expect(globals).toContain("--font-sans: var(--font-geist-sans)");
    expect(globals).toContain("--font-mono: var(--font-geist-mono)");
    expect(globals).toMatch(
      /body\s*\{\s*font-family:\s*Arial,\s*Helvetica,\s*sans-serif;/,
    );
  });

  it("puts the timer in the family the web puts it in", () => {
    // The web's rest timer is `text-5xl font-bold tabular-nums` — the sans
    // family, no `font-mono` — so the native bar is a sans face too.
    const web = readRepo(
      "webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx",
    );
    const restTimerLine = web
      .split("\n")
      .find((line) => line.includes("{formatTime(restTimeRemaining)}"));
    expect(restTimerLine).toBeDefined();
    expect(restTimerLine).not.toContain("font-mono");

    const { getByTestId } = render(
      <RestTimerBar
        remainingSec={65}
        totalSec={90}
        running
        onPause={() => {}}
        onResume={() => {}}
        onSkip={() => {}}
      />,
    );
    expect(styleOf(getByTestId("rest-timer-time")).fontFamily).toBe(
      "Arial-BoldMT",
    );
  });

  it("puts the stat tiles in the family the web puts them in", () => {
    // `webapp/components/ui/StatTile.tsx` renders its value in the sans family
    // (`text-3xl font-extrabold`, no `font-mono`).
    const statTile = readRepo("webapp/components/ui/StatTile.tsx");
    expect(statTile).toContain("font-extrabold");
    expect(statTile).not.toContain("font-mono");

    const totals = render(
      <CalorieRing
        consumed={320}
        goal={2000}
        protein={{ current: 12, goal: 150 }}
        carbs={{ current: 54, goal: 200 }}
        fats={{ current: 6, goal: 65 }}
      />,
    );
    expect(styleOf(totals.getByTestId("day-totals-kcal")).fontFamily).toBe(
      "Arial-BoldMT",
    );

    const streak = render(<StreakBanner streakDays={7} />);
    expect(styleOf(streak.getByTestId("streak-banner-days")).fontFamily).toBe(
      "Arial-BoldMT",
    );
  });
});
