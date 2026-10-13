// Card NP-317: Android — Streaks "Super streak" number invisible in dark mode
// (and plain black in light mode) because `FireNumber` used
// `text-orange-500 dark:text-orange-400`, classes `tailwind.config.js`
// cannot produce since it overrides `orange` with a single flat CSS-var
// colour (no `-100`…`-900` shade scale). NativeWind silently drops both,
// so the Text fell back to the default (near-black) ink in both modes —
// same class of bug as the onboarding Lose Weight tile (NP-310).
//
// Full visual pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9), build 24f4e34d.

import * as fs from "fs";
import * as path from "path";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { FireNumber } from "@/components/streaks/FireNumber";
import { lightTokens, darkTokens } from "@/lib/theme/tokens";

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-317: FireNumber draws the orange flame colour, not the dead *-orange-<n> classes", () => {
  it("(id: np317-01) the 'orange' token is flat (same RGB in both modes) — a precondition for FireNumber's fix", () => {
    // If this ever diverges, FireNumber needs a mode-aware colour instead of
    // a single module-level constant.
    expect(lightTokens.orange).toBe(darkTokens.orange);
    expect(lightTokens.orange).toBe("249 115 22"); // orange-500
  });

  it("(id: np317-02) renders with an inline orange colour, not the non-existent tailwind classes", () => {
    const { getByTestId } = render(<FireNumber>4</FireNumber>);
    const node = getByTestId("fire-number");

    // `tailwind.config.js` overrides `orange` with one flat colour, so the
    // old `text-orange-500 dark:text-orange-400` classes do not exist and
    // must be gone from the className entirely.
    expect(node.props.className).not.toContain("orange");

    // The fix: an inline `color` resolves the (correctly flat) `orange`
    // token, so the number is never the default near-black ink.
    expect(flat(node.props.style)).toEqual(
      expect.objectContaining({ color: `rgb(${lightTokens.orange})` }),
    );
  });

  it("(id: np317-03) stays orange regardless of caller className (no accidental text-foreground override)", () => {
    const { getByTestId } = render(
      <FireNumber className="text-3xl font-extrabold tracking-tight">7</FireNumber>,
    );
    const node = getByTestId("fire-number");
    expect(node.props.className).not.toContain("orange");
    expect(node.props.className).toContain("font-extrabold");
    expect(flat(node.props.style)).toEqual(
      expect.objectContaining({ color: `rgb(${lightTokens.orange})` }),
    );
  });

  it("(id: np317-04) an explicit caller style can still override the colour (style wins over the default)", () => {
    const { getByTestId } = render(
      <FireNumber style={{ color: "rgb(1 2 3)" }}>1</FireNumber>,
    );
    const node = getByTestId("fire-number");
    expect(flat(node.props.style).color).toBe("rgb(1 2 3)");
  });

  it("(id: np317-05) StreaksScreen's Super streak value renders through FireNumber, so it inherits the fix", () => {
    const src = readExpo("components/streaks/StreaksScreen.tsx");
    const fireBlock = src.slice(
      src.indexOf("function StreakValue"),
      src.indexOf("function StreakValue") + 800,
    );
    expect(fireBlock).toContain("<FireNumber");
  });
});
