/**
 * The expo-widgets plugin entry, declared once and declared everywhere.
 *
 * The iOS home-screen surface is a WidgetKit extension declared at BUILD
 * time: `app.json`'s `expo-widgets` plugin block creates the App Group, the
 * `ExpoWidgetsTarget` in the Xcode project, and one widget per row of
 * `IOS_WIDGETS`. So there are three lists that have to be the same list, and
 * three ways for them to drift in silence:
 *
 *   • a widget in `app.json` with no row in `IOS_WIDGETS` — an extension
 *     entry no `createWidget` call (NP-182) can paint;
 *   • a row in `IOS_WIDGETS` with no widget in `app.json` — a push for a
 *     widget the extension does not declare;
 *   • a `feedKey` the server does not send — a tile permanently empty, with
 *     nothing anywhere reporting an error.
 *
 * Mirrors `__tests__/androidWidgets.test.ts` on purpose: same shape, iOS
 * half of the same contract.
 */
import * as fs from "fs";
import * as path from "path";
import {
  IOS_WIDGETS,
  IOS_WIDGET_BUNDLE_IDENTIFIER,
  IOS_WIDGET_GROUP_IDENTIFIER,
} from "@/lib/widgets/iosWidgets";
import { WidgetKeySchema } from "@become/api-client";

const EXPO_DIR = path.resolve(__dirname, "..");

interface PluginWidget {
  name: string;
  displayName?: string;
  description?: string;
  supportedFamilies?: string[];
}

const appJson = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "app.json"), "utf8"),
) as {
  expo: {
    plugins?: (string | [string, Record<string, unknown>])[];
  };
};

const packageJson = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

const pluginEntry = (appJson.expo.plugins ?? []).find(
  (p): p is [string, Record<string, unknown>] =>
    Array.isArray(p) && p[0] === "expo-widgets",
);
const pluginParams = (pluginEntry?.[1] ?? {}) as {
  bundleIdentifier?: string;
  groupIdentifier?: string;
  enableAndroid?: boolean;
  widgets?: PluginWidget[];
};
const pluginWidgets = pluginParams.widgets ?? [];

describe("the expo-widgets library", () => {
  it("declares expo-widgets on the SDK 57 line as a dependency", () => {
    expect(packageJson.dependencies?.["expo-widgets"]).toEqual(
      expect.stringMatching(/^~57\.0\./),
    );
  });

  it("mounts the config plugin, with the App Group entry", () => {
    expect(pluginEntry).toBeDefined();
    expect(pluginParams.groupIdentifier).toBe(IOS_WIDGET_GROUP_IDENTIFIER);
    expect(pluginParams.bundleIdentifier).toBe(IOS_WIDGET_BUNDLE_IDENTIFIER);
    expect(pluginParams.enableAndroid).toBe(false);
  });
});

describe("the five iOS widgets, declared once and declared everywhere", () => {
  it("declares one widget per feed key, in WidgetKeySchema order", () => {
    expect(IOS_WIDGETS.map((w) => w.feedKey)).toEqual(
      WidgetKeySchema.options,
    );
  });

  it("names the plugin widgets exactly IOS_WIDGETS, in order", () => {
    expect(pluginWidgets.map((w) => w.name)).toEqual(
      IOS_WIDGETS.map((w) => w.name),
    );
  });

  it("gives every widget a displayName, a one-line description and systemSmall", () => {
    expect(pluginWidgets.length).toBe(5);
    for (const w of pluginWidgets) {
      expect(w.displayName).toEqual(expect.stringMatching(/\S/));
      expect(w.description).toEqual(expect.stringMatching(/\S/));
      expect(w.supportedFamilies).toEqual(["systemSmall"]);
    }
  });

  it("keeps the displayName and description in sync with IOS_WIDGETS", () => {
    for (const def of IOS_WIDGETS) {
      const pluginWidget = pluginWidgets.find((w) => w.name === def.name);
      expect(pluginWidget?.displayName).toBe(def.displayName);
      expect(pluginWidget?.description).toBe(def.description);
    }
  });
});

describe("the background refresh — app.json mounts the plugin", () => {
  it("declares expo-background-task on the SDK 57 line as a dependency", () => {
    expect(packageJson.dependencies?.["expo-background-task"]).toEqual(
      expect.stringMatching(/^~57\.0\./),
    );
  });

  it("mounts the expo-background-task config plugin", () => {
    expect(appJson.expo.plugins ?? []).toContain("expo-background-task");
  });

  // The library's plugin writes these into the Info.plist at prebuild time —
  // never by hand in app.json. Pinned here so the refresh cannot silently
  // lose its background mode or its task identifier.
  it("resolves UIBackgroundModes + BGTaskSchedulerPermittedIdentifiers", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pluginModule = require("expo-background-task/plugin/build/withBackgroundTask") as {
      default?: (
        config: Record<string, unknown>,
      ) => Record<string, { ios?: { infoPlist?: unknown } }>;
      withBackgroundTask?: (
        config: Record<string, unknown>,
      ) => Record<string, { ios?: { infoPlist?: unknown } }>;
    };
    const withBackgroundTask =
      pluginModule.default ?? pluginModule.withBackgroundTask;
    expect(typeof withBackgroundTask).toBe("function");
    const config = withBackgroundTask!({ name: "Become", slug: "become" });
    const mod = config.mods?.ios?.infoPlist as
      | ((args: {
          modResults: Record<string, unknown>;
        }) => Promise<{ modResults: Record<string, unknown> }>)
      | undefined;
    expect(typeof mod).toBe("function");
    const { modResults } = await mod?.({ modResults: {} })!;
    expect(modResults.UIBackgroundModes).toContain("processing");
    expect(modResults.BGTaskSchedulerPermittedIdentifiers).toContain(
      "com.expo.modules.backgroundtask.processing",
    );
  });
});
