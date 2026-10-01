// Store-only distribution, and the guard that keeps it that way (NP-040).
//
// This file replaces `easConfig.test.ts`, which asserted an `eas.json` with
// three build profiles and named update channels. George's 2026-09-30 decision
// took every Expo-HOSTED service off the table — EAS Build, EAS Submit, EAS
// Update, Expo Push, expo.dev — so for v1 there is no OTA at all: a JS change
// and a native change ship the same way, as a store build, and an urgent one is
// a store build plus the minimum-version gate (NP-041).
//
// What stays from the old file is everything that was about the STORE rather
// than about EAS: the identifiers that cannot change without breaking install
// upgrades, and the release doc. What is new is the inverse of the old
// assertions — eas.json must NOT exist, `expo-updates` must NOT be in the
// dependency tree — plus a run of `scripts/check-no-ota.mjs` in both
// directions, so a guard that has silently stopped detecting anything fails
// here instead of passing forever.

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const EXPO_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(EXPO_DIR, "..");
const APP_JSON = path.join(EXPO_DIR, "app.json");
const RELEASE_MD = path.join(EXPO_DIR, "RELEASE.md");
const README_MD = path.join(EXPO_DIR, "README.md");
const GUARD = path.join(EXPO_DIR, "scripts", "check-no-ota.mjs");

interface AppJson {
  expo: {
    version?: string;
    owner?: string;
    runtimeVersion?: unknown;
    updates?: unknown;
    extra?: { eas?: unknown };
    ios?: { bundleIdentifier?: string; buildNumber?: string };
    android?: { package?: string; versionCode?: number };
    [key: string]: unknown;
  };
}

const appJson = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as AppJson;
const pkg = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** `node scripts/check-no-ota.mjs --root <dir>`; returns the exit code + output. */
function runGuard(root: string): { code: number; output: string } {
  try {
    const output = execFileSync("node", [GUARD, "--root", root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

/** A minimal repo tree the guard can be pointed at. */
function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "no-ota-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

const CLEAN_FIXTURE = {
  "expo/package.json": JSON.stringify({
    dependencies: { expo: "~57.0.26" },
    scripts: { start: "expo start" },
  }),
  "expo/package-lock.json": JSON.stringify({
    packages: { "node_modules/expo": { version: "57.0.26" } },
  }),
  "expo/app.json": JSON.stringify({ expo: { name: "Become" } }),
};

describe("no OTA, no Expo-hosted services (George, 2026-09-30)", () => {
  it("has no eas.json anywhere in the repo", () => {
    const stack = [REPO_DIR];
    const skip = new Set([
      "node_modules",
      ".git",
      ".next",
      "dist",
      "build",
      "ios",
      "android",
      "coverage",
      "playwright-report",
      "test-results",
      "__MACOSX",
    ]);
    const found: string[] = [];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) stack.push(path.join(dir, entry.name));
        } else if (entry.name === "eas.json") {
          found.push(path.relative(REPO_DIR, path.join(dir, entry.name)));
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("does not depend on expo-updates, directly or in the lockfile", () => {
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(declared).not.toContain("expo-updates");

    // The lockfile is where a TRANSITIVE copy would appear — a native module
    // pulled in by a preset ships in the binary just the same.
    const lock = fs.readFileSync(
      path.join(EXPO_DIR, "package-lock.json"),
      "utf8",
    );
    expect(lock).not.toMatch(/"node_modules\/expo-updates"/);
  });

  it("has no EAS script in package.json", () => {
    for (const body of Object.values(pkg.scripts ?? {})) {
      expect(body).not.toMatch(/(^|[^\w-])eas(\s|$)/);
    }
  });

  it("app.json carries no OTA or expo.dev keys", () => {
    expect(appJson.expo.updates).toBeUndefined();
    expect(appJson.expo.runtimeVersion).toBeUndefined();
    expect(appJson.expo.owner).toBeUndefined();
    expect(appJson.expo.extra?.eas).toBeUndefined();
  });
});

describe("the CI guard actually guards", () => {
  it("passes on this repo", () => {
    const { code, output } = runGuard(REPO_DIR);
    expect(output).toMatch(/No-OTA guard OK/);
    expect(code).toBe(0);
  });

  it("passes on a clean fixture", () => {
    const { code } = runGuard(fixture(CLEAN_FIXTURE));
    expect(code).toBe(0);
  });

  it("fails when an eas.json reappears", () => {
    const root = fixture({
      ...CLEAN_FIXTURE,
      "expo/eas.json": JSON.stringify({ build: { production: {} } }),
    });
    const { code, output } = runGuard(root);
    expect(code).toBe(1);
    expect(output).toMatch(/eas\.json exists/);
  });

  it("fails when expo-updates is added as a dependency", () => {
    const root = fixture({
      ...CLEAN_FIXTURE,
      "expo/package.json": JSON.stringify({
        dependencies: { expo: "~57.0.26", "expo-updates": "~57.0.0" },
      }),
    });
    const { code, output } = runGuard(root);
    expect(code).toBe(1);
    expect(output).toMatch(/declares expo-updates/);
  });

  it("fails when expo-updates arrives only through the lockfile", () => {
    const root = fixture({
      ...CLEAN_FIXTURE,
      "expo/package-lock.json": JSON.stringify({
        packages: {
          "node_modules/expo": { version: "57.0.26" },
          "node_modules/expo-updates": { version: "57.0.0" },
        },
      }),
    });
    const { code, output } = runGuard(root);
    expect(code).toBe(1);
    expect(output).toMatch(/resolves node_modules\/expo-updates/);
  });

  it("fails on an updates / runtimeVersion / extra.eas block in app.json", () => {
    const root = fixture({
      ...CLEAN_FIXTURE,
      "expo/app.json": JSON.stringify({
        expo: {
          name: "Become",
          runtimeVersion: { policy: "appVersion" },
          updates: { url: "https://u.expo.dev/abc" },
          extra: { eas: { projectId: "abc" } },
        },
      }),
    });
    const { code, output } = runGuard(root);
    expect(code).toBe(1);
    expect(output).toMatch(/expo\.runtimeVersion/);
    expect(output).toMatch(/expo\.updates/);
    expect(output).toMatch(/expo\.extra\.eas/);
  });

  it("fails on an eas script in package.json", () => {
    const root = fixture({
      ...CLEAN_FIXTURE,
      "expo/package.json": JSON.stringify({
        dependencies: { expo: "~57.0.26" },
        scripts: { release: "eas build --platform all --profile production" },
      }),
    });
    const { code, output } = runGuard(root);
    expect(code).toBe(1);
    expect(output).toMatch(/runs the EAS CLI/);
  });
});

describe("app.json — store identifiers and version counters", () => {
  it("ios.bundleIdentifier is io.redbtn.become", () => {
    expect(appJson.expo.ios?.bundleIdentifier).toBe("io.redbtn.become");
  });

  it("android.package is io.redbtn.become", () => {
    expect(appJson.expo.android?.package).toBe("io.redbtn.become");
  });

  // EAS used to own these two counters remotely (`cli.appVersionSource:
  // "remote"` + `autoIncrement: true`). With eas.json gone they are OURS, and a
  // store upload is rejected outright for reusing a build number — so they are
  // written down here, where `expo prebuild` reads them, and bumped by hand.
  it("ios.buildNumber and android.versionCode are declared, so an upload can be bumped", () => {
    expect(typeof appJson.expo.ios?.buildNumber).toBe("string");
    expect(appJson.expo.ios?.buildNumber).toMatch(/^\d+$/);
    expect(typeof appJson.expo.android?.versionCode).toBe("number");
  });
});

describe("RELEASE.md — store-only release docs", () => {
  const md = fs.readFileSync(RELEASE_MD, "utf8");

  it("documents prerequisites and a local store build, not EAS", () => {
    expect(md).toMatch(/Prerequisites/i);
    expect(md).toMatch(/npx expo prebuild/);
    expect(md).toMatch(/gradlew\s+bundleRelease/);
    expect(md).not.toMatch(/eas build/);
    expect(md).not.toMatch(/eas submit/);
    expect(md).not.toMatch(/eas update/);
  });

  it("documents the rollback strategy for both platforms", () => {
    expect(md).toMatch(/Rollback/i);
    expect(md).toMatch(/Apple/i);
    expect(md).toMatch(/Play/i);
  });

  it("includes the Apple App Privacy + Google Data Safety form drafts", () => {
    expect(md).toMatch(/App Privacy/i);
    expect(md).toMatch(/Data Safety/i);
    // Push token + email + JWT (the three declared types) all mentioned
    expect(md).toMatch(/Push notification token/);
    expect(md).toMatch(/Email/);
    expect(md).toMatch(/JWT/);
  });

  it("has a Releasing a fix section: store build + the minimum-version gate, no OTA", () => {
    expect(md).toMatch(/## Releasing a fix/);
    const section = md.slice(md.indexOf("## Releasing a fix"));
    expect(section).toMatch(/NP-041/);
    expect(section).toMatch(/minVersion|minimum[- ]version/);
    expect(section).toMatch(/over-the-air|OTA/);
  });
});

describe("README.md — points at the store-only release path", () => {
  const md = fs.readFileSync(README_MD, "utf8");

  it("mentions no OTA and links the release doc", () => {
    expect(md).toMatch(/RELEASE\.md/);
    expect(md).toMatch(/no over-the-air updates|No over-the-air updates/);
  });

  it("does not tell anyone to run the EAS CLI", () => {
    expect(md).not.toMatch(/eas build/);
    expect(md).not.toMatch(/eas submit/);
    expect(md).not.toMatch(/eas update/);
  });
});
