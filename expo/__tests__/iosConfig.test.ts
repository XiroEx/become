import * as fs from "fs";
import * as path from "path";

const APP_JSON = path.resolve(__dirname, "..", "app.json");
const LAYOUT = path.resolve(__dirname, "..", "app", "_layout.tsx");

describe("iOS config — app.json", () => {
  const raw = fs.readFileSync(APP_JSON, "utf8");
  const parsed = JSON.parse(raw) as {
    expo: {
      ios?: { bundleIdentifier?: string; associatedDomains?: string[] };
      scheme?: string;
      userInterfaceStyle?: string;
    };
  };

  it("never declares statusBarStyle 'black-translucent'", () => {
    expect(raw.toLowerCase()).not.toContain("black-translucent");
  });

  it("uses an allowed userInterfaceStyle ('light' / 'dark' / 'automatic')", () => {
    const allowed = ["light", "dark", "automatic"];
    expect(allowed).toContain(parsed.expo.userInterfaceStyle);
  });

  it("declares scheme 'become' for deep links", () => {
    expect(parsed.expo.scheme).toBe("become");
  });

  it("declares ios.bundleIdentifier and associatedDomains for Universal Links", () => {
    expect(parsed.expo.ios?.bundleIdentifier).toBe("io.redbtn.become");
    expect(parsed.expo.ios?.associatedDomains).toContain(
      "applinks:become.redbtn.io",
    );
  });
});

// Two questions every upload asks. Answer them in the config and neither the
// TestFlight upload nor App Store Connect stops to ask a person.
describe("iOS submission — export compliance", () => {
  const parsed = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
    expo: { ios?: { infoPlist?: Record<string, unknown> } };
  };

  // Become talks to become.redbtn.io over HTTPS and uses nothing but the
  // system's own TLS, which is exempt. Declaring it here is what stops App
  // Store Connect asking "does your app use encryption?" on every build.
  it("answers ITSAppUsesNonExemptEncryption up front", () => {
    expect(parsed.expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(
      false,
    );
  });
});

describe("iOS submission — privacy manifest", () => {
  const manifest = (
    JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
      expo: {
        ios?: {
          privacyManifests?: {
            NSPrivacyTracking?: boolean;
            NSPrivacyTrackingDomains?: string[];
            NSPrivacyAccessedAPITypes?: {
              NSPrivacyAccessedAPIType: string;
              NSPrivacyAccessedAPITypeReasons: string[];
            }[];
            NSPrivacyCollectedDataTypes?: {
              NSPrivacyCollectedDataType: string;
              NSPrivacyCollectedDataTypeLinked: boolean;
              NSPrivacyCollectedDataTypeTracking: boolean;
              NSPrivacyCollectedDataTypePurposes: string[];
            }[];
          };
        };
      };
    }
  ).expo.ios?.privacyManifests;

  it("exists — without it the upload comes back as ITMS-91053", () => {
    expect(manifest).toBeDefined();
  });

  // The four required-reason categories the bundled modules touch:
  //   file timestamps + disk space — expo-file-system / the bundle loader,
  //   user defaults              — React Native + expo-constants,
  //   system boot time           — React Native's performance timers.
  it.each([
    ["NSPrivacyAccessedAPICategoryFileTimestamp", "C617.1"],
    ["NSPrivacyAccessedAPICategoryUserDefaults", "CA92.1"],
    ["NSPrivacyAccessedAPICategorySystemBootTime", "35F9.1"],
    ["NSPrivacyAccessedAPICategoryDiskSpace", "E174.1"],
  ])("declares %s with reason %s", (category, reason) => {
    const entry = (manifest?.NSPrivacyAccessedAPITypes ?? []).find(
      (e) => e.NSPrivacyAccessedAPIType === category,
    );
    expect(entry).toBeDefined();
    expect(entry?.NSPrivacyAccessedAPITypeReasons).toContain(reason);
  });

  it("every declared reason is an Apple reason code, not prose", () => {
    for (const entry of manifest?.NSPrivacyAccessedAPITypes ?? []) {
      expect(entry.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
      for (const reason of entry.NSPrivacyAccessedAPITypeReasons) {
        expect(reason).toMatch(/^[0-9A-Z]{4}\.\d+$/);
      }
    }
  });

  // Become has no ad SDK, no analytics SDK and never asks for ATT. This is the
  // claim that says so; if a tracking SDK ever lands it has to change here
  // first.
  it("claims no tracking, and no tracking domains", () => {
    expect(manifest?.NSPrivacyTracking).toBe(false);
    expect(manifest?.NSPrivacyTrackingDomains).toEqual([]);
  });

  // Same three types as the App Privacy answers drafted in RELEASE.md: email,
  // user ID, push token. Linked to the account, never used for tracking.
  it("declares the collected data types, all linked and none tracking", () => {
    const types = manifest?.NSPrivacyCollectedDataTypes ?? [];
    expect(types.map((t) => t.NSPrivacyCollectedDataType).sort()).toEqual([
      "NSPrivacyCollectedDataTypeDeviceID",
      "NSPrivacyCollectedDataTypeEmailAddress",
      "NSPrivacyCollectedDataTypeUserID",
    ]);
    for (const type of types) {
      expect(type.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(type.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(type.NSPrivacyCollectedDataTypePurposes).toEqual([
        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
      ]);
    }
  });
});

describe("iOS config — _layout.tsx StatusBar", () => {
  const src = fs.readFileSync(LAYOUT, "utf8");

  it("renders a <StatusBar /> element", () => {
    expect(src).toMatch(/<StatusBar/);
  });

  it("StatusBar style is one of 'light' / 'dark' / 'auto', never 'black-translucent'", () => {
    expect(src).not.toMatch(/style="black-translucent"/);
    expect(src).toMatch(/style="(light|dark|auto)"/);
  });
});
