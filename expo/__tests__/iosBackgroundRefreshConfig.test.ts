/**
 * ─── The background-task plugin entry: background mode + task identifier ────
 *
 * The iOS background refresh (NP-218) needs two Info.plist keys —
 * `UIBackgroundModes: [processing]` and a `BGTaskSchedulerPermittedIdentifiers`
 * entry — and both come from `expo-background-task`'s config plugin, never by
 * hand. What is pinned here:
 *
 *   • the plugin is mounted in `app.json` (a missing entry is a task the OS
 *     never wakes, with no error anywhere);
 *   • the dependency is the SDK 57 line (`~57.0.x`), an Expo library — not a
 *     hosted service, so it is fine under the NP-040 rules;
 *   • invoking the plugin's own `infoPlist` mod yields both keys (no prebuild
 *     needed to prove the resolved config carries them);
 *   • the app entry registers the refresh on iOS only.
 *
 * Mirrors `__tests__/iosWidgetsConfig.test.ts` on purpose: same shape, the
 * NP-218 half of the same contract.
 */
import * as fs from "fs";
import * as path from "path";

const EXPO_DIR = path.resolve(__dirname, "..");

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

const plugins = appJson.expo.plugins ?? [];
const hasBackgroundTaskPlugin = plugins.some((p) =>
  Array.isArray(p) ? p[0] === "expo-background-task" : p === "expo-background-task",
);

describe("the expo-background-task library", () => {
  it("declares expo-background-task on the SDK 57 line as a dependency", () => {
    expect(packageJson.dependencies?.["expo-background-task"]).toEqual(
      expect.stringMatching(/^~57\.0\./),
    );
  });

  it("declares expo-task-manager on the SDK 57 line as a dependency", () => {
    expect(packageJson.dependencies?.["expo-task-manager"]).toEqual(
      expect.stringMatching(/^~57\.0\./),
    );
  });

  it("mounts the config plugin in app.json", () => {
    expect(hasBackgroundTaskPlugin).toBe(true);
  });
});

describe("the resolved iOS config", () => {
  interface ModRequest {
    modResults: Record<string, unknown>;
    modRequest: { projectRoot: string; platform: string; introspect: boolean };
    config: { name: string; slug: string };
  }

  async function runInfoPlistMod(
    initial: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // The plugin's own mod, invoked directly — what `expo config` / prebuild
    // would fold into the Info.plist, without needing Xcode here (NP-219).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = require("expo-background-task/plugin/build/withBackgroundTask")
      .default as (config: { name: string; slug: string }) => {
      mods: { ios: { infoPlist: (args: ModRequest) => Promise<ModRequest> | ModRequest } };
    };
    const configured = plugin({ name: "Become", slug: "become" });
    const result = await configured.mods.ios.infoPlist({
      modResults: { ...initial },
      modRequest: { projectRoot: EXPO_DIR, platform: "ios", introspect: false },
      config: { name: "Become", slug: "become" },
    });
    return result.modResults;
  }

  it("carries the processing background mode", async () => {
    const modResults = await runInfoPlistMod({});
    expect(modResults.UIBackgroundModes).toContain("processing");
  });

  it("carries the background-task scheduler identifier", async () => {
    const modResults = await runInfoPlistMod({});
    expect(modResults.BGTaskSchedulerPermittedIdentifiers).toContain(
      "com.expo.modules.backgroundtask.processing",
    );
  });

  it("keeps keys a previous mod already wrote", async () => {
    const modResults = await runInfoPlistMod({
      UIBackgroundModes: ["fetch"],
      BGTaskSchedulerPermittedIdentifiers: ["io.redbtn.become.refresh"],
    });
    expect(modResults.UIBackgroundModes).toEqual(
      expect.arrayContaining(["fetch", "processing"]),
    );
    expect(modResults.BGTaskSchedulerPermittedIdentifiers).toEqual(
      expect.arrayContaining([
        "io.redbtn.become.refresh",
        "com.expo.modules.backgroundtask.processing",
      ]),
    );
  });
});

describe("the app entry", () => {
  it("registers the iOS refresh at start, on iOS only", () => {
    const entry = fs.readFileSync(path.join(EXPO_DIR, "index.js"), "utf8");
    expect(entry).toMatch(/registerIosWidgetsRefresh\(\)/);
    expect(entry).toMatch(/lib\/widgets\/iosBackgroundRefresh/);
    // Inside the iOS branch — Android keeps its headless task, nothing else
    // registers this one.
    const iosBlock = entry.slice(entry.indexOf('Platform.OS === "ios"'));
    expect(iosBlock).toMatch(/registerIosWidgetsRefresh/);
  });
});
