import {
  darkTokens,
  getTokens,
  lightTokens,
  resolveToken,
} from "../lib/theme/tokens";

describe("theme tokens", () => {
  it("exposes primary as a space-separated RGB triplet (no commas, no rgb wrapper)", () => {
    // NP-313: the web's primary action is `bg-zinc-900 text-white
    // dark:bg-white dark:text-black`, so native's `primary` is that pair and
    // NOT red-500 in both modes the way it shipped.
    expect(lightTokens.primary).toBe("24 24 27"); // zinc-900
    expect(darkTokens.primary).toBe("255 255 255"); // white
    expect(lightTokens.primary).not.toMatch(/,/);
    expect(lightTokens.primary).not.toMatch(/rgb/i);
  });

  it("keeps the web's red on its own token, not on primary", () => {
    // Red is the exception on the web (destructive, errors, a few accents),
    // so it has its own token and `primary` is neutral.
    expect(lightTokens.brand).toBe("220 38 38"); // red-600
    expect(darkTokens.brand).toBe("239 68 68"); // red-500
    expect(lightTokens["brand-foreground"]).toBe("255 255 255");
    expect(darkTokens["brand-foreground"]).toBe("255 255 255");
    expect(lightTokens.primary).not.toBe(lightTokens.brand);
    expect(darkTokens.primary).not.toBe(darkTokens.brand);
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
    expect(resolveToken("brand", "dark")).toBe("rgb(239 68 68)");
    expect(resolveToken("primary", "dark")).toBe("rgb(255 255 255)");
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
