/**
 * ─── The four widgets, declared once and declared everywhere ─────────────────
 *
 * An Android App Widget is a BUILD-time declaration: `app.json`'s config-plugin
 * block writes one `AppWidgetProvider` receiver per widget into the manifest, and
 * the headless task the OS wakes hands the receiver's class name back to JS. So
 * there are three lists that have to be the same list, and three ways for them
 * to drift in silence:
 *
 *   • a widget in `app.json` with no row in `ANDROID_WIDGETS` — a receiver the
 *     task handler does not recognise, so the tile never draws anything;
 *   • a row in `ANDROID_WIDGETS` with no widget in `app.json` — a draw call for
 *     a provider that does not exist, which fails inside the library;
 *   • a `feedKey` the server does not send — a tile permanently in its "open
 *     Become" state, with nothing anywhere reporting an error.
 *
 * And one more that is not a list: if `index.js` stops registering the task
 * handler, every widget keeps its manifest entry and simply stops updating.
 */
import * as fs from "fs";
import * as path from "path";
import {
  ANDROID_WIDGETS,
  ANDROID_WIDGET_NAMES,
  ANDROID_WIDGET_UPDATE_PERIOD_MS,
  androidWidgetByFeedKey,
  androidWidgetByName,
} from "@/lib/widgets/androidWidgets";
import { WIDGET_FONTS } from "@/lib/widgets/render";

const EXPO_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(EXPO_DIR, "..");

interface PluginWidget {
  name: string;
  label?: string;
  description?: string;
  minWidth?: string;
  minHeight?: string;
  targetCellWidth?: number;
  targetCellHeight?: number;
  resizeMode?: string;
  updatePeriodMillis?: number;
}

const appJson = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "app.json"), "utf8"),
) as {
  expo: {
    scheme?: string;
    plugins?: (string | [string, Record<string, unknown>])[];
  };
};

const packageJson = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
) as { main?: string; dependencies?: Record<string, string> };

const pluginEntry = (appJson.expo.plugins ?? []).find(
  (p): p is [string, Record<string, unknown>] =>
    Array.isArray(p) && p[0] === "react-native-android-widget",
);
const pluginParams = (pluginEntry?.[1] ?? {}) as {
  widgets?: PluginWidget[];
  fonts?: string[];
};
const pluginWidgets = pluginParams.widgets ?? [];

describe("the widget library and its entry point", () => {
  // The maintained one: sAleksovski's, which ships its own Expo config plugin,
  // renders RemoteViews from React elements and needs no custom Kotlin here.
  it("declares react-native-android-widget as a dependency", () => {
    expect(packageJson.dependencies?.["react-native-android-widget"]).toEqual(
      expect.stringMatching(/\d+\.\d+\.\d+/),
    );
  });

  it("mounts the config plugin, with the widgets block", () => {
    expect(pluginEntry).toBeDefined();
    expect(pluginWidgets.length).toBeGreaterThan(0);
  });

  // The registration cannot live in a component: a headless task renders none.
  it("registers the task handler from the app entry, not from a screen", () => {
    expect(packageJson.main).toBe("index.js");
    const entry = fs.readFileSync(path.join(EXPO_DIR, "index.js"), "utf8");
    expect(entry).toMatch(/import\s+"expo-router\/entry"/);
    expect(entry).toMatch(/registerWidgetTaskHandler\(widgetTaskHandler\)/);
    expect(entry).toMatch(/lib\/widgets\/taskHandler/);
    // Android's mechanism; iOS's widgets are a WidgetKit extension (NP-181).
    expect(entry).toMatch(/Platform\.OS === "android"/);
  });

  it("taps can reach the app: the custom scheme is declared", () => {
    expect(appJson.expo.scheme).toBe("become");
  });
});

describe("ANDROID_WIDGETS is app.json's widget list", () => {
  it("is the four widgets that were asked for", () => {
    expect(ANDROID_WIDGET_NAMES).toEqual([
      "Streak",
      "Nutrition",
      "Mind",
      "Becoming",
    ]);
  });

  it("names exactly what app.json declares", () => {
    expect(pluginWidgets.map((w) => w.name).sort()).toEqual(
      [...ANDROID_WIDGET_NAMES].sort(),
    );
  });

  it("carries the same label and description in both places", () => {
    for (const definition of ANDROID_WIDGETS) {
      const declared = pluginWidgets.find((w) => w.name === definition.name);
      expect(declared).toBeDefined();
      expect(declared?.label).toBe(definition.label);
      expect(declared?.description).toBe(definition.description);
    }
  });

  // `name` becomes a Java class and a lowercased XML resource file name, so a
  // space, a dash or two names differing only in case break the build.
  it("every name is a legal Java identifier, unique case-insensitively", () => {
    const lowered = ANDROID_WIDGET_NAMES.map((n) => n.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
    for (const name of ANDROID_WIDGET_NAMES) {
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });

  it("every widget is sizeable and has a minimum size the launcher can place", () => {
    for (const declared of pluginWidgets) {
      expect(declared.minWidth).toMatch(/^\d+dp$/);
      expect(declared.minHeight).toMatch(/^\d+dp$/);
      expect(declared.targetCellWidth).toBeGreaterThanOrEqual(2);
      expect(declared.targetCellHeight).toBeGreaterThanOrEqual(1);
      expect(declared.resizeMode).toBe("horizontal|vertical");
    }
  });

  // Android clamps `updatePeriodMillis` to 30 minutes. Writing the feed's 900s
  // here would be writing a number the OS ignores; the app's own redraw at each
  // open is what covers the gap (`lib/widgets/handoff.ts`).
  it("asks the OS for updates no faster than the platform floor", () => {
    expect(ANDROID_WIDGET_UPDATE_PERIOD_MS).toBe(1_800_000);
    for (const declared of pluginWidgets) {
      expect(declared.updatePeriodMillis).toBe(ANDROID_WIDGET_UPDATE_PERIOD_MS);
    }
  });

  it("looks up by name and by feed key, and says null for anything else", () => {
    expect(androidWidgetByName("Streak")?.feedKey).toBe("streak");
    expect(androidWidgetByName("Training")).toBeNull();
    expect(androidWidgetByName(null)).toBeNull();
    expect(androidWidgetByFeedKey("becoming")?.name).toBe("Becoming");
    expect(androidWidgetByFeedKey("training")).toBeNull();
  });
});

describe("the feed rows the widgets draw", () => {
  const feedSource = fs.readFileSync(
    path.join(REPO_DIR, "webapp", "lib", "widgets", "feed.ts"),
    "utf8",
  );

  // Read from the SERVER's own source: a key renamed over there fails here
  // rather than showing up as a tile stuck on "open Become".
  const serverKeys = (
    feedSource.match(/export type WidgetKey =([^\n]+)/)?.[1] ?? ""
  )
    .split("|")
    .map((part) => part.trim().replace(/['"]/g, ""))
    .filter(Boolean);

  it("reads the five keys the server ships", () => {
    expect(serverKeys).toEqual([
      "streak",
      "nutrition",
      "mind",
      "becoming",
      "training",
    ]);
  });

  it("every widget draws a row the server actually sends", () => {
    for (const definition of ANDROID_WIDGETS) {
      expect(serverKeys).toContain(definition.feedKey);
    }
  });

  // Deliberate, and worth a test so it is a decision and not an omission: the
  // ask was streak, nutrition, Mind and Becoming. `training` stays in the feed
  // for the app-icon badge, and is not a fifth tile.
  it("does not draw `training` as a widget of its own", () => {
    expect(ANDROID_WIDGETS.some((w) => w.feedKey === "training")).toBe(false);
  });
});

describe("the widget draws in the app's typeface", () => {
  it("hands the plugin the exact faces the renderer names", () => {
    const declaredFiles = (pluginParams.fonts ?? []).map((f) =>
      path.basename(f, ".ttf"),
    );
    for (const face of Object.values(WIDGET_FONTS)) {
      expect(declaredFiles).toContain(face);
    }
  });

  it("ships those faces in the repo", () => {
    for (const font of pluginParams.fonts ?? []) {
      expect(fs.existsSync(path.resolve(EXPO_DIR, font))).toBe(true);
    }
  });
});
