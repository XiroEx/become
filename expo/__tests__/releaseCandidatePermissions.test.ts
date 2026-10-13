import * as fs from "fs";
import * as path from "path";
import {
  findUsageStringViolations,
  V1_ANDROID_INSTALL_TIME_PERMISSIONS,
  V1_ANDROID_RUNTIME_PERMISSIONS,
  V1_IOS_USAGE_STRING_KEYS,
  type AppConfigLike,
  type UsageStringInput,
} from "@/lib/config/permissions";

/**
 * The v1 release-candidate permission audit (NP-206).
 *
 * NP-014 built the rule for iOS usage strings; NP-059 (camera + photos),
 * NP-099 (microphone + speech) and NP-065 (notifications) landed their
 * strings and their timing with their code. This suite is the gate before
 * submission: it pins the WHOLE v1 surface on both platforms, so a later
 * ticket that adds a permission-bearing module — or an unused permission —
 * fails CI instead of failing App Review (guideline 5.1.1, ITMS-90683) or
 * Play review.
 *
 * What it pins:
 *   1. iOS ships exactly the five v1 usage strings, each specific and honest.
 *   2. Android declares exactly the six v1 runtime permissions, plus only the
 *      install-time normal permissions — nothing v1 does not use.
 *   3. Every Android runtime permission has its reason in the member's
 *      language, anchored to the in-app surface that states it.
 *   4. Notifications are asked at the considered moment, never at first launch.
 *   5. No permission is a condition of using the app — every refusal degrades.
 *   6. A permission-bearing module without its string still fails (NP-014's
 *      rule, re-asserted against the real config so it cannot rot).
 */

const EXPO_DIR = path.resolve(__dirname, "..");

const appJson = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "app.json"), "utf8"),
) as AppConfigLike & {
  expo: {
    android?: { permissions?: string[] };
    plugins?: (string | [string, Record<string, unknown>?])[];
  };
};
const pkg = JSON.parse(
  fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

const realInput: UsageStringInput = {
  config: appJson,
  dependencies: pkg.dependencies ?? {},
};

const infoPlist = appJson.expo.ios?.infoPlist ?? {};
const androidPermissions = appJson.expo.android?.permissions ?? [];

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(EXPO_DIR, relativePath), "utf8");
}

describe("iOS ships exactly the v1 usage strings (NP-206)", () => {
  it("declares the five v1 keys and no other *UsageDescription", () => {
    const declared = Object.keys(infoPlist).filter((k) =>
      k.endsWith("UsageDescription"),
    );
    expect(declared.sort()).toEqual([...V1_IOS_USAGE_STRING_KEYS].sort());
  });

  it("names no resource v1 does not touch", () => {
    const text = V1_IOS_USAGE_STRING_KEYS.map((k) => String(infoPlist[k])).join(
      " ",
    );
    for (const phantom of [
      /progress/i,
      /location/i,
      /contacts/i,
      /calendar/i,
      /tracking/i,
      /bluetooth/i,
    ]) {
      expect(text).not.toMatch(phantom);
    }
  });

  it("the camera string names the barcode scanner, the heaviest camera use", () => {
    expect(String(infoPlist.NSCameraUsageDescription)).toMatch(/barcode/i);
  });

  it("the camera string names the meal photo and the Mind mirror", () => {
    expect(String(infoPlist.NSCameraUsageDescription)).toMatch(/meal/i);
    expect(String(infoPlist.NSCameraUsageDescription)).toMatch(/mirror|mind/i);
  });

  it("the photo-library string names the avatar and the feedback screenshot", () => {
    expect(String(infoPlist.NSPhotoLibraryUsageDescription)).toMatch(/avatar/i);
    expect(String(infoPlist.NSPhotoLibraryUsageDescription)).toMatch(
      /feedback/i,
    );
  });

  it("the microphone and speech strings name speaking the affirmation", () => {
    expect(String(infoPlist.NSMicrophoneUsageDescription)).toMatch(/speak/i);
    expect(String(infoPlist.NSSpeechRecognitionUsageDescription)).toMatch(
      /speak/i,
    );
  });

  it("the Face ID string names unlocking instead of a fresh sign-in link", () => {
    expect(String(infoPlist.NSFaceIDUsageDescription)).toMatch(/unlock/i);
  });

  it("every string names Become, reads as a sentence, and fits the alert", () => {
    for (const key of V1_IOS_USAGE_STRING_KEYS) {
      const sentence = String(infoPlist[key] ?? "");
      expect(sentence).toMatch(/\bBecome\b/);
      expect(sentence.length).toBeGreaterThanOrEqual(25);
      expect(sentence.length).toBeLessThanOrEqual(200);
    }
  });

  it("the encryption exemption flag is set, so uploads never ask", () => {
    expect(infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it("no HealthKit strings ship before NP-185 installs its module", () => {
    expect(infoPlist.NSHealthShareUsageDescription).toBeUndefined();
    expect(infoPlist.NSHealthUpdateUsageDescription).toBeUndefined();
  });

  it("no photo-library ADD string ships — v1 never saves to the library", () => {
    expect(infoPlist.NSPhotoLibraryAddUsageDescription).toBeUndefined();
  });
});

describe("Android declares only the permissions v1 uses (NP-206)", () => {
  const expectedRuntime = V1_ANDROID_RUNTIME_PERMISSIONS.map((p) => p.permission);

  it("declares every v1 runtime permission", () => {
    for (const permission of expectedRuntime) {
      expect(androidPermissions).toContain(permission);
    }
  });

  it("declares the biometric install-time permissions and nothing else extra", () => {
    // `app.json` declares exactly the six runtime permissions. The two
    // install-time normal permissions (`USE_BIOMETRIC`, `USE_FINGERPRINT`)
    // arrive via the `expo-local-authentication` config plugin — verified by
    // resolving the plugin chain (see the audit notes) — so they must NOT be
    // hand-declared here, and nothing else may be either.
    const extra = androidPermissions.filter(
      (p) => !expectedRuntime.includes(p),
    );
    expect(extra).toEqual([]);
    expect(androidPermissions.length).toBe(expectedRuntime.length);
  });

  it("declares no location, contacts, calendar, media or exact-alarm permission", () => {
    for (const banned of [
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.READ_CONTACTS",
      "android.permission.READ_CALENDAR",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.RECORD_VIDEO",
      "android.permission.BODY_SENSORS",
      "android.permission.ACTIVITY_RECOGNITION",
    ]) {
      expect(androidPermissions).not.toContain(banned);
    }
  });

  it("asks for no health permission the code never asks for", () => {
    const health = androidPermissions.filter((p) =>
      p.startsWith("android.permission.health."),
    );
    expect(health.sort()).toEqual(
      [
        "android.permission.health.READ_WEIGHT",
        "android.permission.health.WRITE_WEIGHT",
        "android.permission.health.WRITE_EXERCISE",
      ].sort(),
    );
  });

  it("the table and the manifest agree, entry for entry", () => {
    expect(new Set(androidPermissions).size).toBe(androidPermissions.length);
    expect(androidPermissions.sort()).toEqual([...expectedRuntime].sort());
  });

  it("the resolved config adds only the biometric install-time permissions", async () => {
    // The plugin chain (`expo-local-authentication`) contributes exactly the
    // two normal permissions on top of what `app.json` declares. Anything
    // else appearing here — a new plugin smuggling a dangerous permission —
    // fails the build.
    const { getConfig } = jest.requireActual("@expo/config") as {
      getConfig: (
        root: string,
        opts?: Record<string, unknown>,
      ) => { exp: { plugins?: unknown[] } };
    };
    const pluginFns = jest.requireActual("@expo/config-plugins") as {
      withPlugins: (
        config: Record<string, unknown>,
        plugins: unknown[],
      ) => Promise<{ android?: { permissions?: string[] } }>;
    };
    const { exp } = getConfig(EXPO_DIR, { skipSDKVersionRequirement: true });
    let config: Record<string, unknown> = {
      ...exp,
      _internal: { projectRoot: EXPO_DIR },
    };
    config = (await pluginFns.withPlugins(
      config,
      ((exp.plugins ?? []) as (string | [string, unknown?])[]).map((p) =>
        Array.isArray(p)
          ? [
              p[0].startsWith("./")
                ? path.join(EXPO_DIR, p[0])
                : (p[0] as string),
              p[1],
            ]
          : [p],
      ),
    )) as unknown as Record<string, unknown>;
    const resolved = (
      config as { android?: { permissions?: string[] } }
    ).android?.permissions?.sort();
    expect(resolved).toEqual(
      [...expectedRuntime, ...V1_ANDROID_INSTALL_TIME_PERMISSIONS].sort(),
    );
  });
});

describe("every Android runtime permission has its reason in the app (NP-206)", () => {
  it("each row names its reason, its card and its timing", () => {
    for (const row of V1_ANDROID_RUNTIME_PERMISSIONS) {
      expect(row.reason.length).toBeGreaterThan(25);
      expect(row.reason).toMatch(/Become|member|your/i);
      expect(row.card).not.toBe("");
      expect(row.timing).toMatch(/never at (first )?launch|only after the member/i);
      expect(row.rationaleAnchors.length).toBeGreaterThan(0);
    }
  });

  it("each rationale anchor exists in the source it names", () => {
    for (const row of V1_ANDROID_RUNTIME_PERMISSIONS) {
      for (const anchor of row.rationaleAnchors) {
        const [file, symbol] = anchor.split("#") as [string, string];
        expect(`${row.permission} → ${anchor}`).toBeTruthy();
        expect(readSource(file)).toContain(symbol);
      }
    }
  });

  it("the camera rationale covers the scanner, the plate photo and the mirror", () => {
    const camera = V1_ANDROID_RUNTIME_PERMISSIONS.find(
      (p) => p.permission === "android.permission.CAMERA",
    );
    expect(camera?.rationaleAnchors.join(" ")).toMatch(/BarcodeScanner/);
    expect(camera?.rationaleAnchors.join(" ")).toMatch(/EstimateSheet/);
    expect(camera?.rationaleAnchors.join(" ")).toMatch(/MirrorScene/);
  });

  it("the notification rationale is the Home card plus the considered moment", () => {
    const push = V1_ANDROID_RUNTIME_PERMISSIONS.find(
      (p) => p.permission === "android.permission.POST_NOTIFICATIONS",
    );
    expect(push?.rationaleAnchors.join(" ")).toMatch(/PushOptInCard/);
    expect(push?.rationaleAnchors.join(" ")).toMatch(/afterOnboarding/);
  });
});

describe("notifications are asked at the considered moment, never at first launch (NP-065)", () => {
  it("the launch layouts never request the notification permission", () => {
    for (const layout of ["app/_layout.tsx", "app/(app)/_layout.tsx"]) {
      const src = readSource(layout);
      expect(src).not.toMatch(/requestPermissionsAsync/);
      expect(src).not.toMatch(/askNotificationPermissionAfterOnboarding/);
    }
  });

  it("the foreground bridge only probes — it never requests", () => {
    expect(readSource("components/push/PushSyncBridge.tsx")).not.toMatch(
      /requestPermissionsAsync/,
    );
    expect(readSource("lib/push/nativePush.ts")).toMatch(
      /ensurePushRegistration/,
    );
    // The request path exists exactly once in the push seam — the explicit
    // "Turn on" action — plus its interface declaration. Every other flow
    // (launch, foreground, onboarding) only ever probes.
    const seam = readSource("lib/push/nativePush.ts");
    const requestSites = seam
      .split("\n")
      .filter((line) => line.includes("await deps.requestPermission()"));
    expect(requestSites.length).toBe(1);
    expect(seam).toMatch(/enablePushFromExplicitAction/);
  });

  it("the considered moment is end-of-onboarding, before Home", () => {
    expect(readSource("app/onboarding.tsx")).toContain(
      "askNotificationPermissionAfterOnboarding",
    );
  });

  it("the Home card explains before it asks, and offers Not now", () => {
    const card = readSource("components/push/PushOptInCard.tsx");
    expect(card).toMatch(/Never miss a workout/);
    expect(card).toMatch(/Not now/);
  });
});

describe("no permission is a condition of using the app (NP-206)", () => {
  it("a denied barcode scan falls back to manual entry", () => {
    expect(readSource("components/nutrition/BarcodeScanner.tsx")).toMatch(
      /Enter code manually/,
    );
  });

  it("a denied mirror camera still completes over a black stage", () => {
    expect(readSource("components/mind/session/scenes/MirrorScene.tsx")).toMatch(
      /Camera off/,
    );
  });

  it("a blocked microphone falls back to hold-to-affirm and writing", () => {
    const speak = readSource("components/mind/session/scenes/SpeakScene.tsx");
    expect(speak).toMatch(/Hold &amp; say it|Hold while you say it/);
    expect(speak).toMatch(/Prefer to write it/);
  });

  it("a denied capture resolves permission-denied, never a throw", () => {
    const capture = readSource("lib/media/capture.ts");
    expect(capture).toMatch(/status: "permission-denied"/);
    expect(capture).toMatch(/permissionDeniedMessage/);
  });

  it("a refused health sheet syncs nothing and reports denied, never a throw", () => {
    const sync = readSource("lib/health/sync.ts");
    expect(sync).toMatch(/reason: "denied"/);
    expect(sync).toMatch(/nothing here ever throws/i);
  });

  it("a refused notification ask never blocks landing Home", () => {
    const seam = readSource("lib/push/afterOnboarding.ts");
    expect(seam).toMatch(/never blocks landing Home/i);
  });

  it("biometric misses degrade to the dashboard, never a lockout", () => {
    const bio = readSource("lib/auth/biometrics.ts");
    expect(bio).toMatch(/gracefully degrades|gracefully degrade/i);
  });
});

describe("a permission-bearing module without its string still fails (NP-014, re-asserted)", () => {
  it("the rule passes against the real app.json + package.json", () => {
    expect(findUsageStringViolations(realInput)).toEqual([]);
  });

  it("a newly installed camera module with no string fails", () => {
    const violations = findUsageStringViolations({
      config: { expo: { ios: { infoPlist: {} }, plugins: [] } },
      dependencies: { "expo-camera": "~57.0.6" },
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual(
      expect.arrayContaining([
        "NSCameraUsageDescription",
        "NSMicrophoneUsageDescription",
      ]),
    );
  });

  it("a newly installed speech module with no string fails", () => {
    const violations = findUsageStringViolations({
      config: { expo: { ios: { infoPlist: {} }, plugins: [] } },
      dependencies: { "expo-speech-recognition": "^57.1.0" },
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual(
      expect.arrayContaining([
        "NSSpeechRecognitionUsageDescription",
        "NSMicrophoneUsageDescription",
      ]),
    );
  });

  it("a newly installed biometric module with no string fails", () => {
    const violations = findUsageStringViolations({
      config: { expo: { ios: { infoPlist: {} }, plugins: [] } },
      dependencies: { "expo-local-authentication": "~57.0.3" },
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual([
      "NSFaceIDUsageDescription",
    ]);
  });

  it("a future health module with no strings fails", () => {
    const violations = findUsageStringViolations({
      config: { expo: { ios: { infoPlist: {} }, plugins: [] } },
      dependencies: { "react-native-health": "^1.0.0" },
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual(
      expect.arrayContaining([
        "NSHealthShareUsageDescription",
        "NSHealthUpdateUsageDescription",
      ]),
    );
  });
});
