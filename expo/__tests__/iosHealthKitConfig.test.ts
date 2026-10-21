/**
 * ─── The HealthKit build: module, entitlement, usage strings ─────────────────
 *
 * Three things have to agree, same shape as `androidHealthConnect.test.ts`:
 *
 *   1. `react-native-health` is installed,
 *   2. its bundled Expo config plugin is declared, so `expo prebuild` writes
 *      the `com.apple.developer.healthkit` entitlement,
 *   3. `app.json` → `ios.infoPlist` carries the two usage strings the plugin
 *      falls back to when it finds no prop of its own — manually verified
 *      with a real `npx expo prebuild --platform ios` (not run in CI): the
 *      generated `Become.entitlements` gets `com.apple.developer.healthkit =
 *      true` + an empty `com.apple.developer.healthkit.access` array, and
 *      `Info.plist` carries these exact sentences, not the plugin's own
 *      placeholder ("Allow $(PRODUCT_NAME) to check health info").
 */
import * as fs from "fs";
import * as path from "path";
import {
  HEALTH_SYNC_ENABLED_IOS,
  isHealthSyncEnabled,
} from "@/lib/health/enabled";

const EXPO_DIR = path.resolve(__dirname, "..");
const APP_JSON = path.join(EXPO_DIR, "app.json");
const PACKAGE_JSON = path.join(EXPO_DIR, "package.json");

type PluginEntry = string | [string, Record<string, unknown>?];

const config = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
  expo: {
    ios?: { infoPlist?: Record<string, unknown>; bundleIdentifier?: string };
    plugins?: PluginEntry[];
  };
};
const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")) as {
  dependencies?: Record<string, string>;
};

function pluginName(entry: PluginEntry): string {
  return typeof entry === "string" ? entry : entry[0];
}
const plugins = config.expo.plugins ?? [];

describe("the maintained module", () => {
  it("react-native-health is a dependency", () => {
    expect(pkg.dependencies?.["react-native-health"]).toBeTruthy();
  });

  // Its bundled plugin (`node_modules/react-native-health/app.plugin.js`)
  // writes `com.apple.developer.healthkit` + `.access` into the entitlements
  // and falls back to whatever is already in `ios.infoPlist` for the two
  // usage-string keys — so declaring it is what turns our sentences below
  // into the real entitlement and Info.plist, not a hand-rolled plugin.
  it("its config plugin is declared, so the entitlement lands in the build", () => {
    expect(plugins.map(pluginName)).toContain("react-native-health");
  });
});

describe("app.json carries the two HealthKit usage strings", () => {
  const infoPlist = config.expo.ios?.infoPlist ?? {};

  it("both keys are present", () => {
    expect(infoPlist.NSHealthShareUsageDescription).toBeTruthy();
    expect(infoPlist.NSHealthUpdateUsageDescription).toBeTruthy();
  });

  it("both name Become and say what it does with the resource", () => {
    expect(String(infoPlist.NSHealthShareUsageDescription)).toMatch(/\bBecome\b/);
    expect(String(infoPlist.NSHealthShareUsageDescription)).toMatch(/weigh-in/i);
    expect(String(infoPlist.NSHealthUpdateUsageDescription)).toMatch(/\bBecome\b/);
    expect(String(infoPlist.NSHealthUpdateUsageDescription)).toMatch(/weigh-in/i);
  });

  it("neither is the plugin's own placeholder sentence", () => {
    expect(String(infoPlist.NSHealthShareUsageDescription)).not.toMatch(
      /check health info/i,
    );
    expect(String(infoPlist.NSHealthUpdateUsageDescription)).not.toMatch(
      /update health info/i,
    );
  });

  it("both name the direction it gates — Settings, not at launch", () => {
    expect(String(infoPlist.NSHealthShareUsageDescription)).toMatch(/Settings/);
    expect(String(infoPlist.NSHealthUpdateUsageDescription)).toMatch(/Settings/);
  });
});

describe("the platform gate", () => {
  it("is on for iOS (NP-185)", () => {
    expect(HEALTH_SYNC_ENABLED_IOS).toBe(true);
    expect(isHealthSyncEnabled("ios")).toBe(true);
  });
});
