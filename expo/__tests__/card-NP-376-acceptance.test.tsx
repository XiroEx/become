/* eslint-disable import/first */
// ─── NP-376 acceptance: floating bottom controls clear the glass tab bar ────
//
// Found by the real Builder/QA run on build 038c67f2: the Nutrition `+` FAB
// (`testID=nutrition-fab-add`) was pinned `position: absolute, bottom: 24`,
// which is exactly the band NP-351's floating glass tab bar now occupies
// (`tabBarBottomOffset(insets.bottom) + TAB_BAR_HEIGHT`). The FAB sat on top
// of the Profile tab button: icons overlapped and a tap opened Profile
// instead of the add-food sheet.
//
// Two pieces of evidence:
//
//   1. a REAL RENDER of the Nutrition Day view proves the FAB's `bottom` is
//      at or above `tabBarScreenInset(insets.bottom)` — i.e. it clears the
//      capsule's whole footprint, not just a hand-tuned guess at it;
//   2. a STATIC SCAN of every screen under `app/(app)/(tabs)/**` fails the
//      build if a future edit reintroduces a bare `position: "absolute"` +
//      a literal `bottom:` under the bar's height (`TAB_BAR_HEIGHT`, 62) on
//      anything that is not a `bottom: 0` full-screen overlay/backdrop —
//      which is exactly the shape of bug this card fixes in five places
//      (`nutrition/index.tsx`, `nutrition/recipes/index.tsx` ×2,
//      `nutrition/recipes/[id].tsx`, `programming/quick/index.tsx`) plus
//      `components/programs/ProgramBuilder.tsx`, which sits outside the
//      scanned tree but is covered by its own source assertion below.

const TODAY_MOCK = "2026-06-03";
const TEST_BOTTOM_INSET = 34;

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY_MOCK, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

// Everything downstream of `useTabBarScreenInset` reads ONE number off this
// hook — a real `SafeAreaProvider` gives the same value, this just pins it so
// the arithmetic below is against a known inset rather than whatever the test
// runner's default happens to be.
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    __esModule: true,
    ...actual,
    useSafeAreaInsets: () => ({
      top: 47,
      bottom: TEST_BOTTOM_INSET,
      left: 0,
      right: 0,
    }),
  };
});

import * as fs from "fs";
import * as path from "path";
import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import {
  TAB_BAR_HEIGHT,
  tabBarScreenInset,
} from "@/lib/navigation/tabBarInset";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const goalsFixture = { calories: 2000, protein: 150, carbs: 200, fats: 65 };
const sideTablesFixture = { water: { current: 0, goal: 64 }, quickAdds: [] };
const tagsFixture = { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };

function defaultApiHandler(url: string) {
  if (url.includes("/api/nutrition/goals")) return goalsFixture;
  if (url.includes("/api/goals")) return {};
  if (url.includes("/api/tags")) return tagsFixture;
  if (url.includes("/api/nutrition/meal-schedule")) return { windows: [] };
  if (url.includes("/api/profile")) return { profile: { planPromoteMode: "manual" } };
  if (url.includes("/api/nutrition/log")) return sideTablesFixture;
  if (url.includes("/api/meal-plans")) return { plans: [] };
  if (url.includes("/api/meal-logs")) {
    return { date: TODAY_MOCK, logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } };
  }
  return {};
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { view: "day" };
  mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
});

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("(NP-376) the Nutrition FAB clears the glass tab bar", () => {
  it("renders `nutrition-fab-add` with bottom >= tabBarScreenInset(insets.bottom)", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    let fab: ReturnType<typeof getByTestId>;
    await waitFor(() => {
      fab = getByTestId("nutrition-fab-add");
      expect(fab).toBeTruthy();
    });

    const style = StyleSheet.flatten(fab!.props.style);
    expect(style.position).toBe("absolute");

    const required = tabBarScreenInset(TEST_BOTTOM_INSET);
    // Pinned to the real geometry (34 + 10 + 62 + 12 = 118; the capsule is the
    // web's 62pt tall), so a drift in either this card's fix or the bar's own
    // numbers is caught.
    expect(required).toBe(118);
    expect(style.bottom).toBeGreaterThanOrEqual(required);
  });
});

// ---------------------------------------------------------------------------
// The static regression guard.
// ---------------------------------------------------------------------------

interface AbsoluteBottom {
  bottom: number;
  index: number;
}

/**
 * Finds every `bottom:` literal that sits in the SAME object literal as a
 * `position: "absolute"`, balancing braces from the `position` key forward
 * so a nested `shadowOffset: { width: 0, height: 4 }` does not end the scan
 * early. `depth` starts at 1 because the object's own opening brace already
 * happened before `position:` — the first unmatched `}` is that object's own
 * close.
 */
function scanAbsoluteBottoms(source: string): AbsoluteBottom[] {
  const results: AbsoluteBottom[] = [];
  const posRe = /position:\s*"absolute"/g;
  let m: RegExpExecArray | null;
  while ((m = posRe.exec(source))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const segment = source.slice(start, i);
    const bottomMatch = segment.match(/bottom:\s*(-?\d+(?:\.\d+)?)\b/);
    if (bottomMatch) {
      results.push({ bottom: Number(bottomMatch[1]), index: m.index });
    }
  }
  return results;
}

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { recursive: true } as unknown as undefined) as string[];
  return entries
    .filter((rel) => /\.tsx?$/.test(rel))
    .map((rel) => path.join(dir, rel));
}

describe("(NP-376) no (tabs) screen reintroduces an absolute control under the bar", () => {
  it("has zero bare `bottom:` literals under TAB_BAR_HEIGHT outside bottom:0 overlays", () => {
    expect(TAB_BAR_HEIGHT).toBe(62);

    const tabsDir = path.join(EXPO_DIR, "app", "(app)", "(tabs)");
    const files = listSourceFiles(tabsDir);
    expect(files.length).toBeGreaterThan(20); // sanity: the walk found the tree

    const violations: { file: string; bottom: number }[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const { bottom } of scanAbsoluteBottoms(src)) {
        // `bottom: 0` is a full-screen overlay/backdrop (sits flush with the
        // other three edges too) — explicitly out of this card's scope.
        // Anything else shorter than the capsule's own height is a control
        // the glass bar can sit on top of.
        if (bottom > 0 && bottom < TAB_BAR_HEIGHT) {
          violations.push({ file: path.relative(tabsDir, file), bottom });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("fixed every location the card named, each now reading off useTabBarScreenInset()", () => {
    const nutritionIndex = readExpo("app/(app)/(tabs)/nutrition/index.tsx");
    expect(nutritionIndex).toContain(
      'import { useTabBarScreenInset } from "@/lib/navigation/tabBarInset";',
    );
    expect(nutritionIndex).toContain("bottom: tabBarInset + 24");

    const recipesIndex = readExpo("app/(app)/(tabs)/nutrition/recipes/index.tsx");
    expect(recipesIndex.match(/bottom: tabBarInset \+ 24/g)).toHaveLength(2);

    const recipeDetail = readExpo("app/(app)/(tabs)/nutrition/recipes/[id].tsx");
    expect(recipeDetail).toContain("bottom: tabBarInset + 24");

    // The quick-session overview is a PUSHED screen, so `TabStack` already
    // pads its container by the full tab-bar band: its CTA floats on the
    // band instead of adding `tabBarInset` again
    // (which lifted it by a whole tab bar, over the middle of the list).
    const quickOverview = readExpo("app/(app)/(tabs)/programming/quick/index.tsx");
    expect(quickOverview).toContain("bottom: 0,");
    expect(quickOverview).not.toContain("useTabBarScreenInset");

    const programBuilder = readExpo("components/programs/ProgramBuilder.tsx");
    expect(programBuilder).toContain(
      'import { useTabBarScreenInset } from "@/lib/navigation/tabBarInset";',
    );
    expect(programBuilder).toContain("bottom: tabBarInset + 16");
  });
});
