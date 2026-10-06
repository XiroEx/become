/* eslint-disable import/first */
/**
 * NP-313 — THE NATIVE PRIMARY IS THE WEB'S NEUTRAL, NOT RED.
 *
 * `expo/global.css` shipped `--primary: 239 68 68` (red-500) in BOTH modes, and
 * `bg-primary` / `text-primary` / `colors.primary` is used ~250 times, so every
 * primary button, selected chip, active tab, toggle and FAB in the app was red.
 * The web is not: `webapp/components/AuthForm.tsx`'s submit is
 * `bg-zinc-900 dark:bg-white px-4 py-2 text-white dark:text-zinc-900`, and that
 * neutral pair is what ~790 `bg-zinc-900` / ~140 `dark:bg-white` uses draw.
 *
 * Red survives on the web in three places only, and each has a token here:
 *   - error / alert text and its tint → `destructive` (red-700 / red-400),
 *     the web's `text-red-600 dark:text-red-400` on `bg-red-50
 *     dark:bg-red-950/30`. UNCHANGED by this card.
 *   - notification accents the web paints `bg-red-500` (the food-reports badge
 *     and unread dot in `webapp/components/TopNav.tsx` /
 *     `FoodReportsPanel.tsx`) → the NEW `brand` token.
 *   - per-feature literals that already mirror the web (`bg-red-500/10`
 *     protocol cards in Mind, `bg-red-600` Incomplete calendar dots) → left
 *     exactly as they are.
 *
 * `themeFollowsSystem.test.tsx` owns the global.css ↔ tokens.ts drift check and
 * the contrast maths; this file is the card's own acceptance, screen-side.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import { act, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { UserRound } from "lucide-react-native";
import {
  darkTokens,
  getTokens,
  lightTokens,
  onDarkForeground,
  type ThemeMode,
  type TokenName,
} from "@/lib/theme/tokens";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { FoodReportsBadge } from "@/components/nutrition/FoodReportsBadge";
import { FoodReportsSheet } from "@/components/nutrition/FoodReportsSheet";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const MODES: ThemeMode[] = ["light", "dark"];

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

/** `"24 24 27"` → `[24, 24, 27]`. */
function channels(mode: ThemeMode, name: TokenName): number[] {
  return getTokens(mode)[name].split(" ").map(Number);
}

/** A grey has no hue: its three channels sit within a couple of points. */
function isNeutral(mode: ThemeMode, name: TokenName): boolean {
  const ch = channels(mode, name);
  return Math.max(...ch) - Math.min(...ch) <= 8;
}

/** Red: the red channel dominates both others by a wide margin. */
function isRed(mode: ThemeMode, name: TokenName): boolean {
  const [r = 0, g = 0, b = 0] = channels(mode, name);
  return r > 150 && r - g > 100 && r - b > 100;
}

// ─── 1. the token ────────────────────────────────────────────────────────────

describe("1. the primary token is the web's neutral pair", () => {
  it("is zinc-900 on white in light and white on zinc-900 in dark", () => {
    expect(lightTokens.primary).toBe("24 24 27"); // zinc-900
    expect(lightTokens["primary-foreground"]).toBe("255 255 255"); // white
    expect(darkTokens.primary).toBe("255 255 255"); // white
    expect(darkTokens["primary-foreground"]).toBe("24 24 27"); // zinc-900
  });

  it.each(MODES)("%s: primary has no hue at all — it cannot be red", (mode) => {
    expect(isNeutral(mode, "primary")).toBe(true);
    expect(isNeutral(mode, "primary-foreground")).toBe(true);
    expect(isRed(mode, "primary")).toBe(false);
  });

  it("inverts between the modes, the way the web's `dark:` variant does", () => {
    // The old token was the SAME red in both modes, which is what made a
    // light-mode phone draw the dark-mode button.
    expect(lightTokens.primary).not.toBe(darkTokens.primary);
    expect(lightTokens.primary).toBe(darkTokens["primary-foreground"]);
    expect(lightTokens["primary-foreground"]).toBe(darkTokens.primary);
  });

  it("global.css carries the same two values, per mode", () => {
    const css = readExpo("global.css");
    const light = css.slice(css.indexOf(":root {"), css.indexOf(".dark:root"));
    const dark = css.slice(css.indexOf(".dark:root"));
    expect(light).toMatch(/--primary:\s*24 24 27;/);
    expect(light).toMatch(/--primary-foreground:\s*255 255 255;/);
    expect(dark).toMatch(/--primary:\s*255 255 255;/);
    expect(dark).toMatch(/--primary-foreground:\s*24 24 27;/);
    // The red that was there in both blocks is gone from `--primary`.
    expect(css).not.toMatch(/--primary:\s*239 68 68;/);
  });
});

// ─── 2. the brand/danger red, on its own token ───────────────────────────────

describe("2. red lives on `brand` and `destructive`, not on `primary`", () => {
  it("brand is the web's red family, darker in light mode for contrast", () => {
    expect(lightTokens.brand).toBe("220 38 38"); // red-600 — `text-red-600`
    expect(darkTokens.brand).toBe("239 68 68"); // red-500 — flat `bg-red-500`
    // The web's red fills are `text-white` in both modes.
    expect(lightTokens["brand-foreground"]).toBe("255 255 255");
    expect(darkTokens["brand-foreground"]).toBe("255 255 255");
  });

  it.each(MODES)("%s: brand is red and destructive still is", (mode) => {
    expect(isRed(mode, "brand")).toBe(true);
    expect(isRed(mode, "destructive")).toBe(true);
  });

  it("destructive — the error/alert red — is untouched by this card", () => {
    expect(lightTokens.destructive).toBe("185 28 28"); // red-700
    expect(darkTokens.destructive).toBe("248 113 113"); // red-400
  });

  it("tailwind.config.js exposes brand as a class, both halves", () => {
    const config = readExpo("tailwind.config.js");
    expect(config).toContain("var(--brand)");
    expect(config).toContain("var(--brand-foreground)");
  });
});

// ─── 3. the screens ──────────────────────────────────────────────────────────

describe("3. the screens draw the neutral primary and keep red where the web has it", () => {
  it.each(MODES)(
    "%s: a primary Button is the neutral fill with its own ink",
    (mode) => {
      setSystemScheme(mode);
      const { getByTestId, getByText } = render(
        <Button testID="cta" onPress={() => {}}>
          Start workout
        </Button>,
      );
      const className = String(getByTestId("cta").props.className);
      expect(className).toContain("bg-primary");
      expect(String(getByText("Start workout").props.className)).toContain(
        "text-primary-foreground",
      );
      // …and what `bg-primary` resolves to in this mode is the web's neutral.
      expect(getTokens(mode).primary).toBe(
        mode === "light" ? "24 24 27" : "255 255 255",
      );
    },
  );

  it.each(MODES)(
    "%s: the food-reports count badge stays the web's red pill with white ink",
    async (mode) => {
      // `webapp/components/TopNav.tsx`: `rounded-full bg-red-500 px-1.5
      // text-[10px] font-bold text-white`.
      setSystemScheme(mode);
      const loadImpl = jest.fn().mockResolvedValue({
        status: "loaded",
        items: [],
        unreadCount: 2,
      });
      const { getByTestId, getByText } = render(
        <FoodReportsBadge
          token="test-jwt"
          onOpen={jest.fn()}
          loadImpl={loadImpl as never}
        />,
      );
      await waitFor(() => {
        expect(getByTestId("food-reports-badge-count")).toBeTruthy();
      });
      const pill = getByTestId("food-reports-badge-count");
      expect([pill.props.style].flat(Infinity)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: `rgb(${getTokens(mode).brand})`,
          }),
        ]),
      );
      // White ink in BOTH modes — `primary-foreground` is zinc-900 in dark now.
      expect([getByText("2").props.style].flat(Infinity)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: "rgb(255 255 255)" }),
        ]),
      );
    },
  );

  it.each(MODES)(
    "%s: the unread dot in the reports sheet is the brand red",
    async (mode) => {
      // `webapp/components/nutrition/FoodReportsPanel.tsx`: `h-1.5 w-1.5
      // rounded-full bg-red-500`.
      setSystemScheme(mode);
      const loadImpl = jest.fn().mockResolvedValue({
        status: "loaded",
        unreadCount: 1,
        items: [
          {
            id: "flag-1",
            foodId: "food-1",
            food: { name: "Protein Bar" },
            status: "confirmed",
            kinds: ["calories"],
            resolution: "We checked and did not change the record.",
            photoCount: 0,
            rounds: 1,
            escalated: false,
            unread: true,
            canAddEvidence: false,
          },
        ],
      });
      const { getByTestId } = render(
        <FoodReportsSheet
          visible
          onClose={jest.fn()}
          token="test-jwt"
          loadImpl={loadImpl as never}
          markReadImpl={jest.fn().mockResolvedValue({ status: "marked" }) as never}
        />,
      );
      await waitFor(() => {
        expect(getByTestId("food-reports-unread-flag-1")).toBeTruthy();
      });
      expect(
        [getByTestId("food-reports-unread-flag-1").props.style].flat(Infinity),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: `rgb(${getTokens(mode).brand})`,
          }),
        ]),
      );
    },
  );

  it.each(MODES)(
    "%s: an always-dark surface keeps WHITE ink — the avatar silhouette",
    (mode) => {
      // `primary-foreground` was white in both modes only because `primary` was
      // red; six call sites on surfaces that are dark in BOTH schemes (camera
      // viewfinder, photo scrim, program hero, avatar) leaned on that.
      setSystemScheme(mode);
      const { UNSAFE_getByType } = render(
        <Avatar icon="custom" imageUrl={undefined} size={32} />,
      );
      expect(UNSAFE_getByType(UserRound).props.color).toBe("rgb(255 255 255)");
      expect(onDarkForeground).toBe("rgb(255 255 255)");
    },
  );

  it("the program hero takes its ink from the dark palette it is pinned to", () => {
    const src = readExpo("components/programs/ProgramDetail.tsx");
    // The hero is dark in both modes (`heroTokens = getTokens("dark")`), so its
    // text is the dark `foreground`, never `primary-foreground`.
    expect(src).toContain('getTokens("dark")');
    expect(src).not.toContain('heroRgb("primary-foreground")');
    expect(src).not.toContain('heroTint("primary-foreground"');
    expect(src).toContain('heroRgb("foreground")');
    // The saved heart is the one brand accent on it.
    expect(src).toContain('heroRgb("brand")');
  });
});

// ─── 4. the colours that were already right ──────────────────────────────────

describe("4. per-feature colours that already matched the web are untouched", () => {
  it("keeps purple Plus, violet/green Mind, green success, teal and amber", () => {
    expect(lightTokens.mindset).toBe("147 51 234"); // purple-600
    expect(darkTokens.mindset).toBe("192 132 252"); // purple-400
    expect(lightTokens["mind-violet"]).toBe("139 92 246"); // violet-500
    expect(darkTokens["mind-violet"]).toBe("139 92 246");
    expect(lightTokens["mind-green"]).toBe("34 197 94"); // green-500
    expect(darkTokens["mind-green"]).toBe("34 197 94");
    expect(lightTokens.success).toBe("22 163 74"); // green-600
    expect(darkTokens.success).toBe("74 222 128"); // green-400
    expect(lightTokens.teal).toBe("20 184 166"); // teal-500, both modes
    expect(darkTokens.teal).toBe("20 184 166");
    expect(lightTokens.accent).toBe("217 119 6"); // amber-600
    expect(darkTokens.accent).toBe("251 191 36"); // amber-400
    expect(lightTokens.info).toBe("37 99 235"); // blue-600
    expect(darkTokens.info).toBe("96 165 250"); // blue-400
  });

  it("every token still resolves for every mode, old and new", () => {
    for (const mode of MODES) {
      for (const name of Object.keys(lightTokens) as TokenName[]) {
        expect(getTokens(mode)[name]).toMatch(/^\d+ \d+ \d+$/);
      }
    }
    expect(Object.keys(lightTokens)).toEqual(Object.keys(darkTokens));
  });
});
