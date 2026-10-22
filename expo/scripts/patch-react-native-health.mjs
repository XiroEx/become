// postinstall: make react-native-health 1.19.0 compile on React Native 0.86.
//
// RN 0.86 removed `-[RCTCallableJSModules setBridge:]`, and react-native-health
// still calls it in `emitEventInternal:` — the iOS build fails with "no visible
// @interface for 'RCTCallableJSModules' declares the selector 'setBridge:'".
// The call only wires HealthKit BACKGROUND-OBSERVER events to JS, which Become
// does not use (the weight sync reads and writes directly, lib/health/). The
// line is dropped; `sendEventWithName:` beside it is unchanged.
//
// Idempotent, and a no-op when the package is absent or already fixed upstream,
// so `npm ci` never fails because of it. Found on a device build, 2026-10-22:
// CI's `expo export` bundles JS only and cannot see a native compile error.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(
  root,
  "node_modules/react-native-health/RCTAppleHealthKit/RCTAppleHealthKit.m",
);
const CALL = "[self.callableJSModules setBridge:self.bridge];";

if (existsSync(file)) {
  const source = readFileSync(file, "utf8");
  if (source.includes(CALL)) {
    writeFileSync(
      file,
      source.replace(CALL, "/* setBridge: removed in RN 0.86 (scripts/patch-react-native-health.mjs) */"),
    );
    console.log("patch-react-native-health: removed setBridge: call");
  }
}
