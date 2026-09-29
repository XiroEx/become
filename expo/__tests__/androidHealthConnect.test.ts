/**
 * ─── The Health Connect build: module, manifest, and Play's declaration ──────
 *
 * Three lists have to say the same thing, and a build that ships them out of
 * step either crashes on a missing permission or is rejected by Play for
 * declaring one it cannot justify:
 *
 *   1. `HEALTH_CONNECT_PERMISSIONS`  — what the code asks Health Connect for,
 *   2. `app.json` → `android.permissions` — what the manifest declares,
 *   3. RELEASE.md → the health apps declaration — what Play is told, per
 *      permission, and what a reviewer reads.
 *
 * Play's "health apps declaration" is a hard gate: an app that requests any
 * `android.permission.health.*` cannot be released until the declaration is
 * completed and approved, and it must name the data types, whether each is read
 * or written, why, and where the policy lives.
 */
import * as fs from "fs";
import * as path from "path";
import {
  HEALTH_CONNECT_PERMISSIONS,
  androidManifestPermission,
} from "@/lib/health/healthConnect";
import {
  HEALTH_SYNC_ENABLED_ANDROID,
  HEALTH_SYNC_ENABLED_IOS,
  isHealthSyncEnabled,
} from "@/lib/health/enabled";

const EXPO_DIR = path.resolve(__dirname, "..");
const APP_JSON = path.join(EXPO_DIR, "app.json");
const PACKAGE_JSON = path.join(EXPO_DIR, "package.json");
const RELEASE_MD = path.join(EXPO_DIR, "RELEASE.md");
const ANDROID_QUIRKS = path.join(EXPO_DIR, "ANDROID_QUIRKS.md");

type PluginEntry = string | [string, Record<string, unknown>?];

const config = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
  expo: {
    android?: { permissions?: string[]; package?: string };
    plugins?: PluginEntry[];
  };
};
const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const release = fs.readFileSync(RELEASE_MD, "utf8");
const quirks = fs.readFileSync(ANDROID_QUIRKS, "utf8");

function pluginName(entry: PluginEntry): string {
  return typeof entry === "string" ? entry : entry[0];
}
function pluginProps(entry: PluginEntry): Record<string, unknown> {
  return typeof entry === "string" ? {} : (entry[1] ?? {});
}
const plugins = config.expo.plugins ?? [];

describe("the maintained module", () => {
  it("react-native-health-connect is a dependency", () => {
    expect(pkg.dependencies?.["react-native-health-connect"]).toBeTruthy();
  });

  // The plugin writes the rationale intent-filter the permission dialog links
  // to (through Android 13) and the Android 14+ activity-alias behind
  // START_VIEW_PERMISSION_USAGE. Without it Health Connect's sheet has no
  // privacy-policy destination and Play's declaration cannot be satisfied.
  it("its config plugin is declared, so the rationale intent lands in the manifest", () => {
    expect(plugins.map(pluginName)).toContain("react-native-health-connect");
  });

  // The Health Connect client requires API 26; Expo's default is lower, and the
  // manifest merge fails at build time rather than at runtime.
  it("minSdkVersion is raised to 26 via expo-build-properties", () => {
    const buildProps = plugins.find(
      (p) => pluginName(p) === "expo-build-properties",
    );
    expect(buildProps).toBeDefined();
    const android = pluginProps(buildProps as PluginEntry).android as
      | { minSdkVersion?: number }
      | undefined;
    expect(android?.minSdkVersion).toBe(26);
    expect(pkg.dependencies?.["expo-build-properties"]).toBeTruthy();
  });
});

describe("app.json declares exactly the health permissions the code asks for", () => {
  const declared = config.expo.android?.permissions ?? [];
  const expected = HEALTH_CONNECT_PERMISSIONS.map(androidManifestPermission);

  it("declares all three", () => {
    for (const permission of expected) {
      expect(declared).toContain(permission);
    }
  });

  it("declares no health permission the code never asks for", () => {
    const healthPermissions = declared.filter((p) =>
      p.startsWith("android.permission.health."),
    );
    expect(healthPermissions.sort()).toEqual([...expected].sort());
  });

  // Nothing reads steps or workouts out of Health Connect, so neither is asked
  // for. An unused health permission is a question Play will ask.
  it("asks for no READ_STEPS and no READ_EXERCISE", () => {
    expect(declared).not.toContain("android.permission.health.READ_STEPS");
    expect(declared).not.toContain("android.permission.health.READ_EXERCISE");
  });
});

describe("the platform gate", () => {
  it("is on for Android (NP-199) and off for iOS until NP-185", () => {
    expect(HEALTH_SYNC_ENABLED_ANDROID).toBe(true);
    expect(HEALTH_SYNC_ENABLED_IOS).toBe(false);
    expect(isHealthSyncEnabled("android")).toBe(true);
    expect(isHealthSyncEnabled("ios")).toBe(false);
    expect(isHealthSyncEnabled("web")).toBe(false);
  });
});

describe("Play's health apps declaration (RELEASE.md)", () => {
  it("has its own section, named as Play names it", () => {
    expect(release).toMatch(/health apps declaration/i);
  });

  it("names every permission it declares, with read/write and a purpose", () => {
    for (const permission of HEALTH_CONNECT_PERMISSIONS) {
      expect(release).toContain(androidManifestPermission(permission));
    }
    expect(release).toMatch(/Health Connect/);
  });

  it("points at the published health-data policy the declaration has to link", () => {
    expect(release).toMatch(/become\.redbtn\.io\/health-data/);
  });

  it("says the data is not sold, shared with third parties or used for ads", () => {
    expect(release).toMatch(/not (sold|shared)/i);
    expect(release).toMatch(/advertis/i);
  });

  it("is on the Play Console checklist, so it is not discovered at submission", () => {
    const checklist = release.slice(
      release.indexOf("## Play Console (Android) checklist"),
    );
    expect(checklist.slice(0, 1200)).toMatch(/health apps declaration/i);
  });

  it("the Data safety answers cover weight AND workouts, both optional", () => {
    expect(release).toMatch(/Health & fitness.*Weight/s);
    expect(release).toMatch(/Health & fitness.*(Exercise|workout)/is);
  });
});

describe("ANDROID_QUIRKS.md documents the integration", () => {
  it("has a Health Connect section naming the switches and the next-launch rule", () => {
    expect(quirks).toMatch(/## Health Connect/);
    expect(quirks).toMatch(/next launch/i);
    expect(quirks).toMatch(/become\.sync\.health\.read/);
    expect(quirks).toMatch(/become\.sync\.health\.write/);
  });
});
