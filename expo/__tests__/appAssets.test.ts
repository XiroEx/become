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

/** The app's first paint: `app/_layout.tsx`'s Stack contentStyle. */
const FIRST_PAINT = "#0a0a0a";

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
  it("uses a dedicated image that exists and carries alpha", () => {
    const props = splashProps();
    expect(props.image).toBe("./assets/splash-icon.png");
    const header = readPngHeader(path.join(EXPO_DIR, "assets", "splash-icon.png"));
    expect([header.width, header.height]).toEqual([1024, 1024]);
    expect(hasAlpha(header)).toBe(true);
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
  it("the splash background is the app's first paint", () => {
    expect(splashProps().backgroundColor).toBe(FIRST_PAINT);
  });

  // NP-013 pinned `userInterfaceStyle` to `dark`, so the system can no longer
  // reach for the default WHITE launch screen. The `dark` block stays anyway:
  // it costs nothing, it is the same colour and image, and it is what keeps
  // this true if the pin is ever lifted (NP-123's light theme).
  it("the dark-mode splash is the same colour, and the style is pinned dark", () => {
    expect(config.expo.userInterfaceStyle).toBe("dark");
    const dark = splashProps().dark as
      | { backgroundColor?: string; image?: string }
      | undefined;
    expect(dark?.backgroundColor).toBe(FIRST_PAINT);
    expect(dark?.image).toBe(splashProps().image);
  });

  it("the root view background is the same colour", () => {
    expect(config.expo.backgroundColor).toBe(FIRST_PAINT);
  });

  it("expo-system-ui is installed, which is what applies that colour on iOS", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["expo-system-ui"]).toBeDefined();
  });

  it("and it is the colour the first screen actually paints", () => {
    const layout = fs.readFileSync(LAYOUT, "utf8");
    expect(layout).toMatch(
      new RegExp(`contentStyle:\\s*\\{\\s*backgroundColor:\\s*"${FIRST_PAINT}"`),
    );
  });
});
