import * as fs from "fs";
import * as path from "path";

/**
 * The icon / adaptive icon / splash, and the one colour that makes the launch
 * flash-free.
 *
 * Before this, `app.json` pointed the adaptive icon and the splash at
 * `./assets/icon.png` and `expo/assets/` did not exist, so `npx expo-doctor`
 * failed its asset check and no build could start. The first test here is that
 * check, run against every asset path the config names, so it cannot come back
 * silently.
 */

const EXPO_DIR = path.resolve(__dirname, "..");
const APP_JSON = path.join(EXPO_DIR, "app.json");
const LAYOUT = path.join(EXPO_DIR, "app", "_layout.tsx");

const raw = fs.readFileSync(APP_JSON, "utf8");
const config = JSON.parse(raw) as {
  expo: {
    icon?: string;
    backgroundColor?: string;
    userInterfaceStyle?: string;
    android?: {
      adaptiveIcon?: { foregroundImage?: string; backgroundColor?: string };
    };
    plugins?: (string | [string, Record<string, unknown>?])[];
  };
};

/**
 * The app's first paint in DARK, which is also the pre-JS window colour and the
 * icon plate. NP-123 made the theme follow the system, so the launch screen now
 * has two of these — `expo/__tests__/themeFollowsSystem.test.tsx` owns the pair
 * and the light mark's ink. This file keeps the dark side honest.
 */
const FIRST_PAINT = "#0a0a0a";
/** zinc-50: `lightTokens.background`, and the light launch screen. */
const FIRST_PAINT_LIGHT = "#fafafa";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** A palette PNG can still be transparent through a tRNS chunk. */
  hasTransparencyChunk: boolean;
  bytes: number;
}

function readPngHeader(file: string): PngHeader {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(buf.toString("ascii", 12, 16)).toBe("IHDR");
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colorType: buf.readUInt8(25),
    hasTransparencyChunk: buf.includes("tRNS"),
    bytes: buf.length,
  };
}

/** colorType 4 (grey+alpha) and 6 (RGBA) carry an alpha channel. */
function hasAlpha(header: PngHeader): boolean {
  return (
    header.colorType === 4 ||
    header.colorType === 6 ||
    header.hasTransparencyChunk
  );
}

function splashProps(): Record<string, unknown> {
  const entry = (config.expo.plugins ?? []).find(
    (p) => (typeof p === "string" ? p : p[0]) === "expo-splash-screen",
  );
  expect(Array.isArray(entry)).toBe(true);
  return (entry as [string, Record<string, unknown>])[1];
}

describe("expo/assets — every asset app.json names is on disk", () => {
  // This is expo-doctor's asset check: it reads the config and fails on the
  // first path that does not resolve.
  const referenced = [...raw.matchAll(/"(\.\/assets\/[^"]+)"/g)].map(
    (m) => m[1] as string,
  );

  it("app.json references at least the icon, the adaptive icon and the splash", () => {
    expect(new Set(referenced).size).toBeGreaterThanOrEqual(3);
  });

  it.each([...new Set(referenced)])("%s exists", (relative) => {
    expect(fs.existsSync(path.join(EXPO_DIR, relative))).toBe(true);
  });
});

describe("the store icon", () => {
  it("is declared at the top level as expo.icon", () => {
    expect(config.expo.icon).toBe("./assets/icon.png");
  });

  it("is a 1024x1024 png", () => {
    const header = readPngHeader(path.join(EXPO_DIR, "assets", "icon.png"));
    expect([header.width, header.height]).toEqual([1024, 1024]);
    expect(header.bitDepth).toBe(8);
  });

  it("has no alpha channel — App Store Connect rejects an icon that does", () => {
    const header = readPngHeader(path.join(EXPO_DIR, "assets", "icon.png"));
    expect(hasAlpha(header)).toBe(false);
  });
});

describe("the Android adaptive icon", () => {
  const foreground = () => {
    const file = config.expo.android?.adaptiveIcon?.foregroundImage;
    expect(file).toBe("./assets/adaptive-icon.png");
    return readPngHeader(path.join(EXPO_DIR, "assets", "adaptive-icon.png"));
  };

  it("has a 1024x1024 foreground", () => {
    const header = foreground();
    expect([header.width, header.height]).toEqual([1024, 1024]);
  });

  it("keeps its alpha — the launcher mask needs the corners transparent", () => {
    expect(hasAlpha(foreground())).toBe(true);
  });

  it("is NOT the store icon: that one is opaque and would fill the mask", () => {
    expect(config.expo.android?.adaptiveIcon?.foregroundImage).not.toBe(
      config.expo.icon,
    );
  });

  it("sits on the app's own background colour", () => {
    expect(config.expo.android?.adaptiveIcon?.backgroundColor).toBe(
      FIRST_PAINT,
    );
  });
});

describe("the splash screen", () => {
  it.each(["splash-icon.png", "splash-icon-light.png"])(
    "%s is a dedicated 1024px image that carries alpha",
    (file) => {
      const header = readPngHeader(path.join(EXPO_DIR, "assets", file));
      expect([header.width, header.height]).toEqual([1024, 1024]);
      expect(hasAlpha(header)).toBe(true);
    },
  );

  it("names the light mark at the top level and the dark one under `dark`", () => {
    const props = splashProps();
    expect(props.image).toBe("./assets/splash-icon-light.png");
    expect((props.dark as { image?: string }).image).toBe(
      "./assets/splash-icon.png",
    );
  });

  it("scales the mark rather than stretching it edge to edge", () => {
    const props = splashProps();
    expect(props.resizeMode).toBe("contain");
    expect(typeof props.imageWidth).toBe("number");
  });
});

// The white flash the card is about: it happens when any of these four
// colours disagrees, because whatever is painted between the launch screen and
// the first screen is whichever one the system reaches for.
describe("no white flash between the launch screen and the first screen", () => {
  // NP-123: there are two first paints now, one per scheme, and the launch
  // screen has to match the one the system asked for. A single splash colour is
  // the white flash (or the black one) for half the members.
  it("the light splash is the light theme's first paint", () => {
    expect(splashProps().backgroundColor).toBe(FIRST_PAINT_LIGHT);
  });

  it("the dark splash is the dark theme's first paint, and the OS decides which", () => {
    expect(config.expo.userInterfaceStyle).toBe("automatic");
    const dark = splashProps().dark as
      | { backgroundColor?: string; image?: string }
      | undefined;
    expect(dark?.backgroundColor).toBe(FIRST_PAINT);
    expect(dark?.image).not.toBe(splashProps().image);
  });

  it("the root view background is the dark first paint, before JS exists", () => {
    // One static value for a window with two colours; `expo-system-ui` repaints
    // it from the theme while the splash is still up (see
    // `useThemedWindowBackground`, asserted in themeFollowsSystem.test.tsx).
    expect(config.expo.backgroundColor).toBe(FIRST_PAINT);
  });

  it("expo-system-ui is installed, which is what applies that colour on iOS", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["expo-system-ui"]).toBeDefined();
  });

  it("and the first screen paints whichever one the theme resolves to", () => {
    // It used to be the literal `#0a0a0a` here. A literal has one value, and
    // that is the whole of NP-123: the Stack's surface is the token, which is
    // `#0a0a0a` in dark and `#fafafa` in light.
    const layout = fs.readFileSync(LAYOUT, "utf8");
    expect(layout).toMatch(
      /contentStyle:\s*\{\s*backgroundColor:\s*colors\.background\s*\}/,
    );
    expect(layout).toContain("useThemeTokens()");
  });
});
