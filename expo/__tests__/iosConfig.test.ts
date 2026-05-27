import * as fs from "fs";
import * as path from "path";

const APP_JSON = path.resolve(__dirname, "..", "app.json");
const LAYOUT = path.resolve(__dirname, "..", "app", "_layout.tsx");

describe("iOS config — app.json", () => {
  const raw = fs.readFileSync(APP_JSON, "utf8");
  const parsed = JSON.parse(raw) as {
    expo: {
      ios?: { bundleIdentifier?: string; associatedDomains?: string[] };
      scheme?: string;
      userInterfaceStyle?: string;
    };
  };

  it("never declares statusBarStyle 'black-translucent'", () => {
    expect(raw.toLowerCase()).not.toContain("black-translucent");
  });

  it("uses an allowed userInterfaceStyle ('light' / 'dark' / 'automatic')", () => {
    const allowed = ["light", "dark", "automatic"];
    expect(allowed).toContain(parsed.expo.userInterfaceStyle);
  });

  it("declares scheme 'become' for deep links", () => {
    expect(parsed.expo.scheme).toBe("become");
  });

  it("declares ios.bundleIdentifier and associatedDomains for Universal Links", () => {
    expect(parsed.expo.ios?.bundleIdentifier).toBe("io.redbtn.become");
    expect(parsed.expo.ios?.associatedDomains).toContain(
      "applinks:become.redbtn.io",
    );
  });
});

describe("iOS config — _layout.tsx StatusBar", () => {
  const src = fs.readFileSync(LAYOUT, "utf8");

  it("renders a <StatusBar /> element", () => {
    expect(src).toMatch(/<StatusBar/);
  });

  it("StatusBar style is one of 'light' / 'dark' / 'auto', never 'black-translucent'", () => {
    expect(src).not.toMatch(/style="black-translucent"/);
    expect(src).toMatch(/style="(light|dark|auto)"/);
  });
});
