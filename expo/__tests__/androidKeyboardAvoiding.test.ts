import * as fs from "fs";
import * as path from "path";

// NP-319 — root cause #1: all of these had
// `behavior={Platform.OS === "ios" ? "padding" : undefined}`, so Android got
// NO keyboard avoidance at all. `undefined` behavior is a silent no-op, not
// a fallback to something else — see `ANDROID_QUIRKS.md` → "Keyboard
// avoiding". `"height"` is computed from the native keyboard-show event, not
// a window resize, so it works both on a plain screen and inside a `Modal`
// sheet, where targetSdk 35's edge-to-edge resize never reaches.
const ANDROID_KAV_FILES = [
  // Sheets (rendered inside BottomSheet's Modal)
  "components/nutrition/EstimateSheet.tsx", // Describe your meal — NP-263's iOS twin
  "components/nutrition/BasketSheet.tsx", // "Name this sitting"
  "components/nutrition/EditLogItemSheet.tsx", // Custom amount
  "components/ai/CoachChat.tsx", // Mind coach chat + nutrition consultant chat
  // Plain screens
  "app/(app)/(tabs)/nutrition/goals.tsx", // Water Goal
  "app/(app)/(tabs)/mind/[section].tsx", // Vision editor's Environment field
];

describe("Android keyboard-avoiding pass (NP-319)", () => {
  it.each(ANDROID_KAV_FILES)("%s wraps content in KeyboardAvoidingView", (rel) => {
    const full = path.resolve(__dirname, "..", rel);
    const src = fs.readFileSync(full, "utf8");
    expect(src).toContain("KeyboardAvoidingView");
  });

  it.each(ANDROID_KAV_FILES)(
    "%s gives Android a real behavior ('height'), not undefined",
    (rel) => {
      const full = path.resolve(__dirname, "..", rel);
      const src = fs.readFileSync(full, "utf8");
      expect(src).toMatch(
        /Platform\.OS\s*===\s*["']ios["']\s*\?\s*["']padding["']\s*:\s*["']height["']/,
      );
      expect(src).not.toMatch(
        /Platform\.OS\s*===\s*["']ios["']\s*\?\s*["']padding["']\s*:\s*undefined/,
      );
    },
  );
});
