/* eslint-disable import/first */
// GEIST, THE WEB'S TYPEFACE, ON THE PHONE (NP-160).
//
// The web has set Geist and Geist Mono since the first commit
// (`webapp/app/layout.tsx`). Native loaded no font at all, so every screen drew
// in San Francisco or Roboto and the two clients read differently side by side.
//
// Four things have to hold, and this file asserts all four:
//   1. the faces are IN THE REPO — eight `.ttf`s under the OFL, the same
//      family and weights the web serves;
//   2. a `<Text>` resolves to the right FACE, because React Native names a
//      face and not a family+weight (`font-mono font-bold` is one file);
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
import { StyleSheet, View } from "react-native";
import type { TextStyle } from "react-native";
import { render } from "@testing-library/react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { RestTimerBar } from "@/components/live/RestTimerBar";
import { DayTotals } from "@/components/nutrition/DayTotals";
import { StreakBanner } from "@/components/StreakBanner";
import {
  GEIST_FACES,
  GEIST_FONTS,
  GEIST_WEIGHTS,
  geistFontFamily,
  geistFontFile,
  nearestGeistWeight,
} from "@/lib/theme/fonts";
import { useGeistFonts } from "@/lib/theme/loadFonts";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(EXPO_DIR, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");
const readRepo = (rel: string): string =>
  fs.readFileSync(path.join(REPO_DIR, rel), "utf8");

const ALL_FACES = [
  ...GEIST_WEIGHTS.map((w) => [GEIST_FACES.sans[w], w, "sans"] as const),
  ...GEIST_WEIGHTS.map((w) => [GEIST_FACES.mono[w], w, "mono"] as const),
];

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

describe("the Geist files are in the repo, not on a CDN", () => {
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

  it.each(ALL_FACES)("%s names itself Geist", (face) => {
    const fullName = readTtf(path.join(EXPO_DIR, geistFontFile(face))).fullName;
    expect(fullName).toMatch(/^Geist( Mono)? (Regular|Medium|SemiBold|Bold)$/);
  });

  it("ships the OFL licence beside them", () => {
    const licence = readExpo("assets/fonts/OFL.txt");
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licence).toContain("Geist");
  });

  it("hands every face to expo-font, and nothing else", () => {
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
  it("is the regular sans face when nothing asks for anything", () => {
    expect(geistFontFamily()).toBe("Geist-Regular");
  });

  it.each([
    ["font-medium", "Geist-Medium"],
    ["font-semibold", "Geist-SemiBold"],
    ["font-bold", "Geist-Bold"],
    ["text-foreground text-xl font-semibold", "Geist-SemiBold"],
  ])("%s → %s", (className, face) => {
    expect(geistFontFamily(className)).toBe(face);
  });

  it.each([
    ["font-mono", "GeistMono-Regular"],
    ["font-mono font-medium", "GeistMono-Medium"],
    ["font-mono font-semibold", "GeistMono-SemiBold"],
    ["font-mono font-bold", "GeistMono-Bold"],
  ])("%s → %s — the pair CSS cannot express", (className, face) => {
    // `font-family` and `font-weight` are two properties in CSS and one file on
    // a phone. This is why the family is resolved in JS and not by NativeWind.
    expect(geistFontFamily(className)).toBe(face);
  });

  it("snaps a weight with no file of its own to the nearest one bundled", () => {
    expect(geistFontFamily("font-light")).toBe("Geist-Regular");
    expect(geistFontFamily("font-extrabold")).toBe("Geist-Bold");
    expect(geistFontFamily("font-black")).toBe("Geist-Bold");
    expect(nearestGeistWeight(100)).toBe(400);
    expect(nearestGeistWeight(900)).toBe(700);
    expect(nearestGeistWeight(undefined)).toBe(400);
  });

  it("reads a variant's base token, so active:font-bold is still bold", () => {
    expect(geistFontFamily("active:font-bold")).toBe("Geist-Bold");
  });

  it("lets an inline weight win over a class — NativeWind's own order", () => {
    // react-native-css-interop sorts inline above className
    // (`specificityCompare`), so the resolver has to agree with it.
    expect(geistFontFamily("font-normal", { fontWeight: "bold" })).toBe(
      "Geist-Bold",
    );
    expect(geistFontFamily("font-bold", { fontWeight: 500 })).toBe(
      "Geist-Medium",
    );
    expect(geistFontFamily(undefined, { fontFamily: "GeistMono-Regular" })).toBe(
      "GeistMono-Regular",
    );
  });
});

describe("<Text> carries the face it resolved", () => {
  it("renders in Geist with no class at all", () => {
    const { getByTestId } = render(<Text testID="t">Hello</Text>);
    expect(styleOf(getByTestId("t")).fontFamily).toBe("Geist-Regular");
  });

  it("renders a bold class in the bold FILE, not a faked weight", () => {
    const { getByTestId } = render(
      <Text testID="t" className="text-foreground font-bold">
        Hello
      </Text>,
    );
    expect(styleOf(getByTestId("t")).fontFamily).toBe("Geist-Bold");
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
    expect(styleOf(getByTestId("i")).fontFamily).toBe("Geist-Regular");
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
    // is the assertion behind "every native screen renders in Geist".
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
  it("NativeWind's sans and mono are the Geist faces", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../tailwind.config.js") as {
      theme: { extend: { fontFamily: Record<string, string[]> } };
    };
    expect(config.theme.extend.fontFamily.sans).toEqual([GEIST_FACES.sans[400]]);
    expect(config.theme.extend.fontFamily.mono).toEqual([GEIST_FACES.mono[400]]);
  });

  it("is the typeface the web still loads", () => {
    // If the web ever changes typeface, this is the test that says so.
    const layout = readRepo("webapp/app/layout.tsx");
    expect(layout).toMatch(
      /import \{ Geist, Geist_Mono \} from "next\/font\/google"/,
    );
    const globals = readRepo("webapp/app/globals.css");
    expect(globals).toContain("--font-sans: var(--font-geist-sans)");
    expect(globals).toContain("--font-mono: var(--font-geist-mono)");
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
      GEIST_FACES.sans[600],
    );
  });

  it("puts the stat tiles in the family the web puts them in", () => {
    // `webapp/components/ui/StatTile.tsx` renders its value in the sans family
    // (`text-3xl font-extrabold`, no `font-mono`).
    const statTile = readRepo("webapp/components/ui/StatTile.tsx");
    expect(statTile).toContain("font-extrabold");
    expect(statTile).not.toContain("font-mono");

    const totals = render(
      <DayTotals
        date="2026-09-29"
        entries={[
          {
            id: "e1",
            date: "2026-09-29",
            mealType: "breakfast",
            foodName: "Oats",
            kcal: 320,
            protein: 12,
            carbs: 54,
            fat: 6,
          },
        ]}
      />,
    );
    expect(styleOf(totals.getByTestId("day-totals-kcal")).fontFamily).toBe(
      GEIST_FACES.sans[700],
    );

    const streak = render(<StreakBanner streakDays={7} />);
    expect(styleOf(streak.getByTestId("streak-banner-days")).fontFamily).toBe(
      GEIST_FACES.sans[600],
    );
  });
});
