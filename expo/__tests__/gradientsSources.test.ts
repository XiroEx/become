// Gradients on screens too heavy to render in a unit test (the session
// player's payoff, the AI estimate sheet, the quick session overview): the
// layer is asserted at the source, the way `card-NP-354` reads FireNumber.
// Each one is the web's class, ported through `WebGradient` with token stops.

import * as fs from "fs";
import * as path from "path";

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("gradient layers on heavy screens", () => {
  it("the session payoff's chapter button is amber-400 → amber-500 (`from-amber-400 to-amber-500`)", () => {
    const src = readExpo("components/mind/session/SessionPlayer.tsx");
    const at = src.indexOf("payoff-chapter-unlock-gradient");
    expect(at).toBeGreaterThan(-1);
    const layer = src.slice(at, at + 260);
    expect(layer).toContain('direction="r"');
    expect(layer).toContain("PLAYER_AMBER");
    expect(layer).toContain("webGradientTokens.amber500");
  });

  it("the estimate sheet's photos carry a bottom-up black scrim (30% on compose, 40% on review)", () => {
    const src = readExpo("components/nutrition/EstimateSheet.tsx");
    expect(src).toContain("photoScrim(0.3)");
    expect(src).toContain("photoScrim(0.4)");
    expect(src).toContain("compose-scrim");
    expect(src).toContain("review-scrim");
    expect(src.match(/direction="t"/g)).toHaveLength(2);
  });

  it("the quick session's Start CTA is green-600 → green-500, with white ink", () => {
    const src = readExpo("app/(app)/(tabs)/programming/quick/index.tsx");
    const at = src.indexOf("quick-session-overview-start-gradient");
    expect(at).toBeGreaterThan(-1);
    const layer = src.slice(at, at + 260);
    expect(layer).toContain('direction="r"');
    expect(layer).toContain("webGradientTokens.green600");
    expect(layer).toContain('colors["mind-green"]');
  });

  it("every gradient stop is a token — nothing here writes a hex or hsl() colour", () => {
    for (const rel of [
      "components/WebGradient.tsx",
      "components/mind/session/scenes/DoneBadge.tsx",
    ]) {
      const src = readExpo(rel);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/hsl\(/);
    }
  });
});
