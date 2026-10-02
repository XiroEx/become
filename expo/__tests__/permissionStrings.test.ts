import * as fs from "fs";
import * as path from "path";
import {
  findUsageStringViolations,
  installedModules,
  resolveUsageString,
  PERMISSION_BEARING_MODULES,
  MIN_USAGE_STRING_LENGTH,
  type AppConfigLike,
  type UsageStringInput,
} from "@/lib/config/permissions";

/**
 * The rule every later feature inherits: a module that makes iOS ask a
 * question ships with the sentence iOS shows, or the build does not ship.
 *
 * The first block runs the rule against the REAL app.json + package.json, so
 * the day camera (NP-059), microphone and speech (NP-099), the photo library
 * (NP-162 / NP-163), Face ID (NP-187) or HealthKit (NP-185) is installed, this
 * test is what fails until the string arrives with it. The blocks after it
 * prove the rule actually fails — a green test that cannot go red is worth
 * nothing.
 */

const EXPO_DIR = path.resolve(__dirname, "..");

const realInput: UsageStringInput = {
  config: JSON.parse(
    fs.readFileSync(path.join(EXPO_DIR, "app.json"), "utf8"),
  ) as AppConfigLike,
  dependencies:
    (
      JSON.parse(
        fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
      ) as { dependencies?: Record<string, string> }
    ).dependencies ?? {},
};

function config(
  infoPlist: Record<string, unknown>,
  plugins: (string | [string, Record<string, unknown>?])[] = [],
): AppConfigLike {
  return { expo: { ios: { infoPlist }, plugins } };
}

const GOOD_CAMERA =
  "Become uses the camera to photograph a meal so it can log what is in it.";

describe("this app's usage strings", () => {
  it("has a string for every permission-bearing module it installs", () => {
    expect(findUsageStringViolations(realInput)).toEqual([]);
  });

  it("only carries usage strings for modules it actually installs", () => {
    const installed = installedModules(realInput);
    const keysInUse = new Set(
      PERMISSION_BEARING_MODULES.filter((e) => installed.has(e.module)).map(
        (e) => e.infoPlistKey,
      ),
    );
    const declared = Object.keys(
      realInput.config.expo.ios?.infoPlist ?? {},
    ).filter((k) => k.endsWith("UsageDescription"));
    expect(declared.filter((k) => !keysInUse.has(k))).toEqual([]);
  });

  it("every row names an Info.plist key iOS reads a sentence from", () => {
    for (const entry of PERMISSION_BEARING_MODULES) {
      expect(entry.infoPlistKey).toMatch(/UsageDescription$/);
      expect(entry.card).not.toBe("");
      expect(entry.what.length).toBeGreaterThan(10);
    }
  });

  // NP-099 installs expo-speech-recognition and turns the microphone on so the
  // app can follow along as the member speaks affirmations out loud.
  it("says what the microphone and speech recognition are FOR", () => {
    const infoPlist = realInput.config.expo.ios?.infoPlist ?? {};
    expect(String(infoPlist.NSMicrophoneUsageDescription)).toMatch(/\bBecome\b/);
    expect(String(infoPlist.NSMicrophoneUsageDescription)).toMatch(/speak/i);
    expect(String(infoPlist.NSSpeechRecognitionUsageDescription)).toMatch(
      /\bBecome\b/,
    );
    expect(String(infoPlist.NSSpeechRecognitionUsageDescription)).toMatch(
      /speak/i,
    );
  });

  it("says what the camera and the photo library are FOR", () => {
    const infoPlist = realInput.config.expo.ios?.infoPlist ?? {};
    expect(String(infoPlist.NSCameraUsageDescription)).toMatch(/\bBecome\b/);
    expect(String(infoPlist.NSCameraUsageDescription)).toMatch(/meal/i);
    expect(String(infoPlist.NSPhotoLibraryUsageDescription)).toMatch(
      /\bBecome\b/,
    );
    expect(String(infoPlist.NSPhotoLibraryUsageDescription)).toMatch(/photo/i);
  });

  it("covers every module the roadmap names", () => {
    const modules = new Set(PERMISSION_BEARING_MODULES.map((e) => e.module));
    for (const expected of [
      "expo-camera",
      "expo-image-picker",
      "expo-media-library",
      "expo-audio",
      "expo-speech-recognition",
      "expo-local-authentication",
      "react-native-health",
    ]) {
      expect([...modules]).toContain(expected);
    }
  });
});

describe("the rule fails when a permission-bearing plugin has no usage string", () => {
  it("a dependency with no string at all", () => {
    const violations = findUsageStringViolations({
      config: config({}),
      dependencies: { "expo-camera": "~17.0.0" },
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual(
      expect.arrayContaining([
        "NSCameraUsageDescription",
        "NSMicrophoneUsageDescription",
      ]),
    );
    expect(violations[0]?.problem).toMatch(/no usage string/);
  });

  it("a plugin with no string at all, even when it is not in dependencies", () => {
    const violations = findUsageStringViolations({
      config: config({}, ["expo-local-authentication"]),
      dependencies: {},
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual([
      "NSFaceIDUsageDescription",
    ]);
  });

  it("an empty string", () => {
    const violations = findUsageStringViolations({
      config: config({ NSFaceIDUsageDescription: "   " }),
      dependencies: { "expo-local-authentication": "~16.0.0" },
    });
    expect(violations[0]?.problem).toMatch(/empty/);
  });

  it("a string too short to say anything", () => {
    const violations = findUsageStringViolations({
      config: config({ NSFaceIDUsageDescription: "Become uses Face ID" }),
      dependencies: { "expo-local-authentication": "~16.0.0" },
    });
    expect(violations[0]?.problem).toMatch(
      new RegExp(`too short|min ${MIN_USAGE_STRING_LENGTH}`),
    );
  });

  it("boilerplate that never says what BECOME does with it", () => {
    const violations = findUsageStringViolations({
      config: config({
        NSCameraUsageDescription:
          "This app requires access to the camera to continue.",
        NSMicrophoneUsageDescription: GOOD_CAMERA,
      }),
      dependencies: { "expo-camera": "~17.0.0" },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.problem).toMatch(/never names Become/);
  });

  it("a placeholder somebody meant to come back to", () => {
    const violations = findUsageStringViolations({
      config: config({
        NSFaceIDUsageDescription: "TODO: Become uses Face ID for something.",
      }),
      dependencies: { "expo-local-authentication": "~16.0.0" },
    });
    expect(violations[0]?.problem).toMatch(/placeholder/);
  });

  it("a string left behind by a module that is gone", () => {
    const violations = findUsageStringViolations({
      config: config({ NSCameraUsageDescription: GOOD_CAMERA }),
      dependencies: {},
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.problem).toMatch(/no module behind it/);
  });
});

// A plugin prop set to `false` makes the plugin DELETE the key instead of
// writing its own placeholder (`@expo/config-plugins`
// `ios/Permissions.ts#applyPermissions`). That is the honest thing to ship for
// a resource the app does not use — and it has to be unanimous, or whichever
// plugin runs last decides what App Review reads.
describe("opting a key out is an answer too", () => {
  it("a module that opts out needs no sentence", () => {
    expect(
      findUsageStringViolations({
        config: config({ NSCameraUsageDescription: GOOD_CAMERA }, [
          ["expo-camera", { microphonePermission: false }],
        ]),
        dependencies: { "expo-camera": "~57.0.6" },
      }),
    ).toEqual([]);
  });

  it("the opt-out beats a string in ios.infoPlist, because the plugin deletes it", () => {
    const input = {
      config: config(
        {
          NSCameraUsageDescription: GOOD_CAMERA,
          NSMicrophoneUsageDescription:
            "Become records sound with any video you capture in the app.",
        },
        [["expo-camera", { microphonePermission: false }]],
      ),
      dependencies: { "expo-camera": "~57.0.6" },
    };
    expect(
      resolveUsageString(input, {
        module: "expo-camera",
        infoPlistKey: "NSMicrophoneUsageDescription",
        pluginProp: "microphonePermission",
        what: "record sound",
        card: "NP-059",
      }),
    ).toBe(false);
    const violations = findUsageStringViolations(input);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.problem).toMatch(/never ships/);
  });

  it("one module opting out while another still writes the key is a contradiction", () => {
    const violations = findUsageStringViolations({
      config: config(
        {
          NSPhotoLibraryUsageDescription:
            "Become opens your photo library when you pick a photo to attach.",
        },
        [
          ["expo-camera", { cameraPermission: false, microphonePermission: false }],
          ["expo-image-picker", { microphonePermission: false }],
        ],
      ),
      dependencies: {
        "expo-camera": "~57.0.6",
        "expo-image-picker": "~57.0.20",
      },
    });
    expect(violations.map((v) => v.infoPlistKey)).toEqual([
      "NSCameraUsageDescription",
    ]);
    expect(violations[0]?.problem).toMatch(/opts out of NSCameraUsageDescription/);
  });
});

describe("the rule passes when the string is there", () => {
  it("in ios.infoPlist", () => {
    expect(
      findUsageStringViolations({
        config: config({
          NSCameraUsageDescription: GOOD_CAMERA,
          NSMicrophoneUsageDescription:
            "Become records sound with any video you capture in the app.",
        }),
        dependencies: { "expo-camera": "~17.0.0" },
      }),
    ).toEqual([]);
  });

  it("or in the plugin prop that writes the same key", () => {
    const withProps: AppConfigLike = {
      expo: {
        plugins: [
          [
            "expo-local-authentication",
            {
              faceIDPermission:
                "Become uses Face ID to unlock the app without emailing you a new link.",
            },
          ],
        ],
      },
    };
    const input = { config: withProps, dependencies: {} };
    expect(findUsageStringViolations(input)).toEqual([]);
    expect(
      resolveUsageString(input, {
        module: "expo-local-authentication",
        infoPlistKey: "NSFaceIDUsageDescription",
        pluginProp: "faceIDPermission",
        what: "unlock the app",
        card: "NP-187",
      }),
    ).toMatch(/^Become uses Face ID/);
  });
});
