/* eslint-disable import/first */
// ONE THEME, PINNED — the test for "a phone in light mode is readable".
//
// NativeWind resolves `bg-background` / `text-foreground` from whichever
// palette its colour scheme names, and left alone that is the SYSTEM setting.
// 39 files in this app hard-code `#0a0a0a` in a plain RN `style`, because a
// SafeAreaView or a StatusBar cannot read a Tailwind class. So a phone in light
// mode drew LIGHT-mode text — `--foreground: 24 24 27`, near-black — on those
// near-black surfaces, and the app was unreadable for exactly the members who
// do not keep their phone dark.
//
// v1 ships one theme. Three things have to agree, and this asserts all three:
//   1. NativeWind's scheme is `dark`, set at startup (before the first render);
//   2. `app.json` says `userInterfaceStyle: "dark"`, so the OS agrees;
//   3. the status bar stays LIGHT content, because the surface is dark.
//
// NP-123 is where a real light theme lands. It starts by deleting the literals.

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return null;
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({
      user: { _id: "u1", email: "jon@example.com" },
    })),
  };
});

import * as fs from "fs";
import * as path from "path";
import { colorScheme } from "nativewind";
import { PINNED_COLOR_SCHEME, pinDarkMode } from "@/lib/theme/colorScheme";
import { darkTokens, lightTokens } from "@/lib/theme/tokens";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("the pin itself", () => {
  it("sets NativeWind's colour scheme to dark", () => {
    colorScheme.set("light");
    pinDarkMode();
    expect(colorScheme.get()).toBe("dark");
    expect(PINNED_COLOR_SCHEME).toBe("dark");
  });

  it("is dark even when the SYSTEM asks for light", () => {
    // `system` is what NativeWind does by default and what this replaces.
    colorScheme.set("system");
    pinDarkMode();
    expect(colorScheme.get()).toBe("dark");
  });
});

describe("the root layout pins it at startup", () => {
  it("calls pinDarkMode when the module loads, not in an effect", () => {
    // Module scope, above the component: an effect runs AFTER the first paint,
    // which is one frame of the system's theme on every cold start.
    const layout = readExpo("app/_layout.tsx");
    const body = layout.slice(0, layout.indexOf("export default function"));
    expect(body).toMatch(/^pinDarkMode\(\);$/m);
    expect(layout).toMatch(
      /import \{ pinDarkMode \} from "@\/lib\/theme\/colorScheme"/,
    );
  });

  it("leaves the scheme dark after the real root layout is imported", () => {
    // The functional half of the assertion above: importing the module a device
    // imports at launch is enough, on its own, to put NativeWind in dark. No
    // render, no effect, no Appearance listener.
    //
    // Not `jest.isolateModules`: a fresh registry would hand the layout its own
    // copy of `nativewind`, and this file would then be reading a different
    // store from the one it set. The module cache is cold here because nothing
    // above this line requires the root layout.
    colorScheme.set("light");
    expect(colorScheme.get()).toBe("light");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../app/_layout");
    expect(colorScheme.get()).toBe("dark");
  });

  it("keeps the status bar light — light content on a dark surface", () => {
    expect(readExpo("app/_layout.tsx")).toContain('<StatusBar style="light" />');
  });
});

describe("app.json agrees with the pin", () => {
  const appJson = JSON.parse(readExpo("app.json")) as {
    expo: {
      userInterfaceStyle?: string;
      backgroundColor?: string;
      androidStatusBar?: { barStyle?: string; translucent?: boolean };
    };
  };

  it("declares userInterfaceStyle dark, not automatic", () => {
    // `automatic` is what shipped: the OS handed the app a light appearance and
    // every native surface it owns — keyboard, share sheet, launch screen —
    // came up light against a dark app.
    expect(appJson.expo.userInterfaceStyle).toBe("dark");
  });

  it("keeps the dark window background and the light-content status bar", () => {
    expect(appJson.expo.backgroundColor).toBe("#0a0a0a");
    expect(appJson.expo.androidStatusBar?.barStyle).toBe("light-content");
    expect(appJson.expo.androidStatusBar?.translucent).toBe(true);
  });
});

describe("why the pin is needed at all", () => {
  it("the hard-coded #0a0a0a is the DARK background, and light's is not close", () => {
    // `#0a0a0a` = rgb(10 10 10). This is the whole bug in two assertions: the
    // literal matches the dark palette exactly and sits 240 points away from
    // the light one, while light-mode text is 24 24 27.
    expect(darkTokens.background).toBe("10 10 10");
    expect(lightTokens.background).toBe("250 250 250");
    expect(lightTokens.foreground).toBe("24 24 27");
  });
});
