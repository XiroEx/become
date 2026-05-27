import {
  darkTokens,
  getTokens,
  lightTokens,
  resolveToken,
} from "../lib/theme/tokens";

describe("theme tokens", () => {
  it("exposes primary as a space-separated RGB triplet (no commas, no rgb wrapper)", () => {
    expect(lightTokens.primary).toBe("239 68 68");
    expect(darkTokens.primary).toBe("239 68 68");
    expect(lightTokens.primary).not.toMatch(/,/);
    expect(lightTokens.primary).not.toMatch(/rgb/i);
  });

  it("differs background between light and dark", () => {
    expect(lightTokens.background).toBe("250 250 250");
    expect(darkTokens.background).toBe("10 10 10");
    expect(lightTokens.background).not.toEqual(darkTokens.background);
  });

  it("getTokens('dark') returns the dark palette", () => {
    expect(getTokens("dark")).toBe(darkTokens);
    expect(getTokens("light")).toBe(lightTokens);
  });

  it("resolveToken wraps the triplet in rgb()", () => {
    expect(resolveToken("primary", "dark")).toBe("rgb(239 68 68)");
    expect(resolveToken("background", "light")).toBe("rgb(250 250 250)");
    expect(resolveToken("foreground", "dark")).toBe("rgb(255 255 255)");
  });

  it("every token resolves for every mode", () => {
    const modes = ["light", "dark"] as const;
    const names = Object.keys(lightTokens) as (keyof typeof lightTokens)[];
    for (const mode of modes) {
      for (const name of names) {
        const value = resolveToken(name, mode);
        expect(value).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
      }
    }
  });
});
