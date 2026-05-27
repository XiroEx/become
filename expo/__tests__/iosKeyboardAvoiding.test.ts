import * as fs from "fs";
import * as path from "path";

// Every screen that renders a `TextInput` (via our `Input` component or
// directly) must wrap its content in a KeyboardAvoidingView so the iOS
// keyboard doesn't cover the field.
const INPUT_SCREENS = [
  "app/login.tsx",
  "app/(tabs)/chat/[id].tsx",
  "app/(tabs)/nutrition/search.tsx",
  "app/(tabs)/nutrition/food/[id].tsx",
  "app/(tabs)/calendar/settings.tsx",
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
