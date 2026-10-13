import * as fs from "fs";
import * as path from "path";

// NP-338: the Android build had no Firebase config, so
// `getDevicePushTokenAsync()` could never hand back an FCM token — the
// member saw "Not reaching this device" forever and Repair did nothing
// (`[push] device token unavailable` in logcat). This pins the client-side
// wiring: `app.json` must point `android.googleServicesFile` at a real file
// that actually matches `io.redbtn.become`. The ACTUAL Firebase project
// values (project number, app id, api key) are not secrets this repo can
// fabricate — they come from the Firebase console, same category as the
// Play upload keystore in `RELEASE.md`'s prerequisites, and must be dropped
// in for real before a build that needs push to reach a device.

const APP_JSON = path.resolve(__dirname, "..", "app.json");
const EXPO_ROOT = path.resolve(__dirname, "..");

describe("Android config — Firebase / FCM wiring (NP-338)", () => {
  const parsed = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
    expo: {
      android?: { package?: string; googleServicesFile?: string };
    };
  };

  it("declares android.googleServicesFile", () => {
    expect(parsed.expo.android?.googleServicesFile).toBe(
      "./google-services.json",
    );
  });

  it("the referenced file exists relative to expo/", () => {
    const rel = parsed.expo.android?.googleServicesFile ?? "";
    const resolved = path.resolve(EXPO_ROOT, rel);
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it("the file is valid JSON shaped like a real google-services.json", () => {
    const resolved = path.resolve(
      EXPO_ROOT,
      parsed.expo.android?.googleServicesFile ?? "",
    );
    const config = JSON.parse(fs.readFileSync(resolved, "utf8")) as {
      project_info?: { project_id?: string };
      client?: {
        client_info?: {
          android_client_info?: { package_name?: string };
        };
        api_key?: { current_key?: string }[];
      }[];
    };
    expect(config.project_info).toBeDefined();
    expect(Array.isArray(config.client)).toBe(true);
    expect(config.client?.length).toBeGreaterThan(0);
  });

  it("the file's Android client is filed under io.redbtn.become, matching android.package", () => {
    const resolved = path.resolve(
      EXPO_ROOT,
      parsed.expo.android?.googleServicesFile ?? "",
    );
    const config = JSON.parse(fs.readFileSync(resolved, "utf8")) as {
      client?: {
        client_info?: { android_client_info?: { package_name?: string } };
      }[];
    };
    expect(parsed.expo.android?.package).toBe("io.redbtn.become");
    const packageNames = (config.client ?? []).map(
      (c) => c.client_info?.android_client_info?.package_name,
    );
    expect(packageNames).toContain("io.redbtn.become");
  });

  it("is the real Firebase export, not the REPLACE_WITH_* placeholder", () => {
    const resolved = path.resolve(
      EXPO_ROOT,
      parsed.expo.android?.googleServicesFile ?? "",
    );
    const raw = fs.readFileSync(resolved, "utf8");
    expect(raw).not.toMatch(/REPLACE_WITH_/);
    const config = JSON.parse(raw) as {
      project_info?: { project_number?: string };
      client?: { client_info?: { mobilesdk_app_id?: string } }[];
    };
    expect(config.project_info?.project_number).toMatch(/^\d+$/);
    expect(config.client?.[0]?.client_info?.mobilesdk_app_id).toMatch(
      /^1:\d+:android:[0-9a-f]+$/,
    );
  });
});
