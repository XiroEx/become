/**
 * Permission usage strings — the rule, and the one place the strings live.
 *
 * THE STRINGS THEMSELVES LIVE IN `app.json`, under `expo.ios.infoPlist`. That
 * is the one place. This file is the rule about them: which module makes iOS
 * show a prompt, which Info.plist key that prompt reads its sentence from, and
 * what a usable sentence looks like. `__tests__/permissionStrings.test.ts`
 * runs the rule against the real `app.json` + `package.json`, so a feature
 * that installs a permission-bearing module and forgets the sentence fails CI
 * instead of failing App Review (ITMS-90683, "Missing purpose string").
 *
 * Adding a permission with your feature:
 *   1. install the module,
 *   2. add the sentence to `expo.ios.infoPlist` in `app.json` — or to the
 *      plugin's own prop (`cameraPermission`, `photosPermission`, ...), which
 *      writes the same key,
 *   3. the row below already exists for every module the roadmap names; add
 *      one if yours is new.
 *
 * NOT ASKING IS ALSO AN ANSWER. A permission-bearing plugin writes ITS OWN
 * placeholder sentence for every key it knows about unless you say otherwise —
 * `expo-camera` and `expo-image-picker` both add "Allow $(PRODUCT_NAME) to
 * access your microphone" whether or not anything in the app records audio. A
 * prop set to `false` (`microphonePermission: false`) makes the plugin DELETE
 * that key instead (`@expo/config-plugins` `ios/Permissions.ts#applyPermissions`),
 * which is the honest thing to ship for a feature that does not use the
 * resource: no key, no prompt, and nothing for App Review to ask about. So
 * `false` is a legitimate resolution here — see `findUsageStringViolations`,
 * which requires it to be unanimous and to agree with `ios.infoPlist`.
 *
 * What a sentence has to say: what BECOME does with the resource, in the app's
 * voice, as a sentence a person reading a system alert would understand. Not
 * "This app requires access to the camera." The rules below are the mechanical
 * part of that (it names Become, it is a sentence, it is not a placeholder);
 * the judgement part is yours.
 *
 * Android is deliberately absent: Android has no equivalent of a usage string
 * in the manifest — the rationale is a screen the app shows before it asks, so
 * it belongs with the feature, not here.
 */

export interface PermissionBearingModule {
  /** npm package that makes iOS prompt. Usually also the config-plugin name. */
  module: string;
  /** Info.plist key iOS reads the sentence from. */
  infoPlistKey: string;
  /** Config-plugin prop that writes the same key, when the plugin takes one. */
  pluginProp?: string;
  /** What the app does with the resource — the sentence has to say this. */
  what: string;
  /** The board card that turns this row on. */
  card: string;
}

/**
 * Every module the native roadmap installs that makes iOS ask a question.
 * A row does nothing until its module is actually a dependency (or a plugin)
 * of this app — so the list can run ahead of the code.
 */
export const PERMISSION_BEARING_MODULES: readonly PermissionBearingModule[] = [
  {
    module: "expo-camera",
    infoPlistKey: "NSCameraUsageDescription",
    pluginProp: "cameraPermission",
    what: "photograph a meal so Become can log what is in it",
    card: "NP-059",
  },
  {
    module: "expo-camera",
    infoPlistKey: "NSMicrophoneUsageDescription",
    pluginProp: "microphonePermission",
    what: "record sound alongside video captured in the app",
    card: "NP-059",
  },
  {
    module: "expo-image-picker",
    infoPlistKey: "NSPhotoLibraryUsageDescription",
    pluginProp: "photosPermission",
    what: "choose an existing photo of a meal, a progress shot or an avatar",
    card: "NP-059 / NP-162 / NP-163",
  },
  {
    module: "expo-image-picker",
    infoPlistKey: "NSCameraUsageDescription",
    pluginProp: "cameraPermission",
    what: "take the photo instead of picking one",
    card: "NP-059",
  },
  {
    module: "expo-media-library",
    infoPlistKey: "NSPhotoLibraryUsageDescription",
    what: "read progress photos the person picks",
    card: "NP-162",
  },
  {
    module: "expo-media-library",
    infoPlistKey: "NSPhotoLibraryAddUsageDescription",
    pluginProp: "savePhotosPermission",
    what: "save a shared image back to the camera roll",
    card: "NP-162",
  },
  {
    module: "expo-audio",
    infoPlistKey: "NSMicrophoneUsageDescription",
    pluginProp: "microphonePermission",
    what: "hear what is dictated into a check-in or a chat message",
    card: "NP-099",
  },
  {
    module: "expo-av",
    infoPlistKey: "NSMicrophoneUsageDescription",
    pluginProp: "microphonePermission",
    what: "hear what is dictated into a check-in or a chat message",
    card: "NP-099",
  },
  {
    module: "expo-speech-recognition",
    infoPlistKey: "NSSpeechRecognitionUsageDescription",
    pluginProp: "speechRecognitionPermission",
    what: "turn speech into the text of a log or a message",
    card: "NP-099",
  },
  {
    module: "expo-speech-recognition",
    infoPlistKey: "NSMicrophoneUsageDescription",
    pluginProp: "microphonePermission",
    what: "hear what is being said while dictation is running",
    card: "NP-099",
  },
  {
    module: "expo-local-authentication",
    infoPlistKey: "NSFaceIDUsageDescription",
    pluginProp: "faceIDPermission",
    what: "unlock the app with Face ID instead of a magic link",
    card: "NP-187",
  },
  // The iOS health bridge `lib/health/adapter.ts` is written against
  // `react-native-health`; `@kingstinct/react-native-healthkit` is the other
  // candidate and asks for the same two strings, so both rows are here and
  // whichever gets installed is the one that fires.
  {
    module: "react-native-health",
    infoPlistKey: "NSHealthShareUsageDescription",
    what: "read weight and steps that were already recorded in Apple Health",
    card: "NP-185",
  },
  {
    module: "react-native-health",
    infoPlistKey: "NSHealthUpdateUsageDescription",
    what: "write a weigh-in back to Apple Health",
    card: "NP-185",
  },
  {
    module: "@kingstinct/react-native-healthkit",
    infoPlistKey: "NSHealthShareUsageDescription",
    what: "read weight and steps that were already recorded in Apple Health",
    card: "NP-185",
  },
  {
    module: "@kingstinct/react-native-healthkit",
    infoPlistKey: "NSHealthUpdateUsageDescription",
    what: "write a weigh-in back to Apple Health",
    card: "NP-185",
  },
];

/** A plugin entry in `expo.plugins`: a name, or a name with props. */
export type PluginEntry = string | [string, Record<string, unknown>?];

export interface AppConfigLike {
  expo: {
    ios?: { infoPlist?: Record<string, unknown> };
    plugins?: PluginEntry[];
  };
}

export interface UsageStringInput {
  config: AppConfigLike;
  /** `dependencies` from package.json (the installed modules). */
  dependencies: Record<string, string>;
}

export interface UsageStringViolation {
  module: string;
  infoPlistKey: string;
  problem: string;
}

/** The shortest sentence that can plausibly say what Become does with something. */
export const MIN_USAGE_STRING_LENGTH = 25;
/** Longer than this and iOS truncates it in the alert. */
export const MAX_USAGE_STRING_LENGTH = 200;

const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX|lorem|placeholder|your app)\b/i;

function pluginName(entry: PluginEntry): string {
  return typeof entry === "string" ? entry : entry[0];
}

function pluginProps(entry: PluginEntry): Record<string, unknown> {
  return typeof entry === "string" ? {} : (entry[1] ?? {});
}

/** Modules this app actually has: dependencies plus anything in `plugins`. */
export function installedModules(input: UsageStringInput): Set<string> {
  const plugins = input.config.expo.plugins ?? [];
  return new Set([
    ...Object.keys(input.dependencies),
    ...plugins.map(pluginName),
  ]);
}

/** What this module's plugin prop says about the key, if it says anything. */
function pluginPropValue(
  input: UsageStringInput,
  entry: PermissionBearingModule,
): unknown {
  if (!entry.pluginProp) return undefined;
  for (const plugin of input.config.expo.plugins ?? []) {
    if (pluginName(plugin) !== entry.module) continue;
    const value = pluginProps(plugin)[entry.pluginProp];
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Resolve the sentence iOS would show for `infoPlistKey`: the value in
 * `ios.infoPlist`, or the prop the module's config plugin writes it from.
 * `false` means the plugin OPTS OUT of the key.
 *
 * The opt-out wins over `ios.infoPlist`, because that is what actually happens:
 * the plugin's mod runs on the assembled Info.plist and DELETES the key it was
 * told to skip, whatever `app.json` put there.
 */
export function resolveUsageString(
  input: UsageStringInput,
  entry: PermissionBearingModule,
): unknown {
  const fromPlugin = pluginPropValue(input, entry);
  if (fromPlugin === false) return false;
  const fromInfoPlist = input.config.expo.ios?.infoPlist?.[entry.infoPlistKey];
  if (fromInfoPlist !== undefined) return fromInfoPlist;
  return fromPlugin;
}

/** The mechanical half of "says what Become does with it, in the app's voice". */
function judgeSentence(value: unknown): string | null {
  if (value === undefined) {
    return "has no usage string — iOS shows an empty prompt and App Review rejects the build (ITMS-90683)";
  }
  if (typeof value !== "string" || value.trim() === "") {
    return "has an empty usage string";
  }
  const text = value.trim();
  if (text.length < MIN_USAGE_STRING_LENGTH) {
    return `usage string is ${text.length} characters — too short to say what Become does with it (min ${MIN_USAGE_STRING_LENGTH})`;
  }
  if (text.length > MAX_USAGE_STRING_LENGTH) {
    return `usage string is ${text.length} characters — iOS truncates past ${MAX_USAGE_STRING_LENGTH}`;
  }
  if (PLACEHOLDER.test(text)) {
    return "usage string is a placeholder";
  }
  if (!/\bBecome\b/.test(text)) {
    return "usage string never names Become — it has to say what BECOME does with the resource, in the app's voice";
  }
  return null;
}

/**
 * Every reason this app's usage strings are not shippable. Empty means
 * shippable. Four rules:
 *
 *  1. a permission-bearing module that is installed must have its sentence,
 *  2. a sentence must not be there for a module that is not installed — an
 *     unexplained prompt string is a question from App Review,
 *  3. opting a key out (`prop: false`) has to be UNANIMOUS across the installed
 *     modules that write it, or the plugin that runs last decides whether the
 *     app ships Expo's placeholder sentence,
 *  4. an opted-out key must not also be declared in `ios.infoPlist` — the
 *     plugin deletes it, so the declaration is a lie about what ships.
 */
export function findUsageStringViolations(
  input: UsageStringInput,
): UsageStringViolation[] {
  const installed = installedModules(input);
  const violations: UsageStringViolation[] = [];
  const declared = input.config.expo.ios?.infoPlist ?? {};

  // Grouped by KEY, because two installed modules can write the same one —
  // `expo-camera` and `expo-image-picker` both write NSCameraUsageDescription
  // and NSMicrophoneUsageDescription — and one of them opting out deletes what
  // the other wrote.
  const byKey = new Map<string, PermissionBearingModule[]>();
  for (const entry of PERMISSION_BEARING_MODULES) {
    if (!installed.has(entry.module)) continue;
    const rows = byKey.get(entry.infoPlistKey) ?? [];
    rows.push(entry);
    byKey.set(entry.infoPlistKey, rows);
  }

  for (const [key, rows] of byKey) {
    const optedOut = rows.filter(
      (entry) => resolveUsageString(input, entry) === false,
    );
    if (optedOut.length > 0) {
      for (const entry of rows) {
        if (optedOut.includes(entry)) continue;
        violations.push({
          module: entry.module,
          infoPlistKey: key,
          problem: `${optedOut[0]?.module} opts out of ${key} while ${entry.module} still writes it — whichever plugin runs last decides, and one of the outcomes is Expo's own placeholder sentence`,
        });
      }
      if (key in declared) {
        violations.push({
          module: optedOut[0]?.module ?? "(opted out)",
          infoPlistKey: key,
          problem: `declared in ios.infoPlist while ${optedOut[0]?.module} opts out of it — the plugin deletes the key, so this sentence never ships`,
        });
      }
      continue;
    }
    for (const entry of rows) {
      const problem = judgeSentence(resolveUsageString(input, entry));
      if (problem) {
        violations.push({
          module: entry.module,
          infoPlistKey: key,
          problem: `${problem} (${entry.card}: ${entry.what})`,
        });
      }
    }
  }

  const expected = new Set(
    PERMISSION_BEARING_MODULES.filter((e) => installed.has(e.module)).map(
      (e) => e.infoPlistKey,
    ),
  );
  for (const key of Object.keys(input.config.expo.ios?.infoPlist ?? {})) {
    if (!key.endsWith("UsageDescription")) continue;
    if (expected.has(key)) continue;
    violations.push({
      module: "(none installed)",
      infoPlistKey: key,
      problem:
        "usage string with no module behind it — either the module went away and the string should too, or the module is missing from PERMISSION_BEARING_MODULES",
    });
  }

  return violations;
}
