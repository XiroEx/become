import * as fs from "fs";
import * as path from "path";

// Every screen that renders a `TextInput` (via our `Input` component or
// directly) must wrap its content in a KeyboardAvoidingView so the iOS
// keyboard doesn't cover the field.
const INPUT_SCREENS = [
  "app/(auth)/login.tsx",
  "app/(app)/(tabs)/chat/[id].tsx",
  "app/(app)/(tabs)/nutrition/search.tsx",
  "app/(app)/(tabs)/nutrition/food/[id].tsx",
  "app/(app)/(tabs)/calendar/settings.tsx",
  // NP-290: a centered Modal, not a top-level screen, but it carries a
  // TextInput the same way and was missing this — the keyboard covered
  // Confirm/Back/Skip the moment the workout-name field focused.
  "components/workout/QuickSessionNamePrompt.tsx",
];

describe("iOS keyboard-avoiding pass", () => {
  it.each(INPUT_SCREENS)("%s wraps content in KeyboardAvoidingView", (rel) => {
    const full = path.resolve(__dirname, "..", rel);
    const src = fs.readFileSync(full, "utf8");
    expect(src).toContain("KeyboardAvoidingView");
  });

  it.each(INPUT_SCREENS)(
    "%s sets behavior='padding' on iOS",
    (rel) => {
      const full = path.resolve(__dirname, "..", rel);
      const src = fs.readFileSync(full, "utf8");
      expect(src).toMatch(/Platform\.OS\s*===\s*["']ios["']\s*\?\s*["']padding["']/);
    },
  );
});
