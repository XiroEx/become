/* eslint-disable import/first */
/**
 * NEW CUSTOM FOOD — NATIVE PARITY (NP-272).
 *
 * Full visual pass (native vs web) on `food/new` found three gaps:
 *
 *   1. The subtitle was shortened on native (`Add a food not in our
 *      database.`) while the web explains with an example
 *      (`… — Grandma's pancake mix, your homemade sauce, anything you eat
 *      that you can't find.`).
 *   2. The web collapses `Optional: weight / volume per serving` behind a
 *      disclosure and uses its own freeform bridge fields (`= 100 g`,
 *      `1 cup`); native always showed the section open with plain
 *      "Grams per serving" / "Millilitres per serving" number inputs.
 *   3. The `Save to My Foods` toggle and the disabled `Save food` button
 *      must stay on the native brand RED (`colors.primary`), never the
 *      web's green/grey — which they already do, because `primary` IS red
 *      in `global.css` for both platforms; this pins that so it cannot
 *      silently regress to a literal green/grey.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "member-1", role: "user" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import NewFoodRoute from "@/app/(app)/(tabs)/nutrition/food/new";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { hideUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { clearAll } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { getTokens } from "@/lib/theme/tokens";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function rgb(triplet: string): string {
  return `rgb(${triplet})`;
}

const UNENFORCED = {
  role: "user",
  tier: "free",
  enforced: false,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {
    "custom-foods": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: 3,
      used: 0,
      remaining: 3,
      resetsAt: null,
      window: "lifetime",
    },
  },
};

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (p: string) => {
    if (p === "/api/me/entitlements") return UNENFORCED;
    throw new Error(`unexpected fetch ${p}`);
  });
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken("test-jwt");
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
});

afterEach(async () => {
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  await clearAll(storage);
});

async function fillRequiredFields(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByTestId("food-new-name"), "Grandma's Pancake Mix");
  fireEvent.changeText(screen.getByTestId("food-new-macro-calories"), "300");
  fireEvent.changeText(screen.getByTestId("food-new-macro-protein"), "8");
  fireEvent.changeText(screen.getByTestId("food-new-macro-carbs"), "55");
  fireEvent.changeText(screen.getByTestId("food-new-macro-fats"), "6");
}

// ───────────────────────────────────────────────────────────────────────────
// 1. The full web subtitle, not the shortened native-only line.
// ───────────────────────────────────────────────────────────────────────────

describe("the subtitle matches the web's full copy", () => {
  it("explains with the web's example, not the shortened one-liner", () => {
    const screen = render(<NewFoodRoute />);
    const subtitle = screen.getByTestId("food-new-subtitle");
    expect(subtitle).toHaveTextContent(
      "Add a food not in our database — Grandma's pancake mix, your homemade sauce, anything you eat that you can't find.",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. The weight/volume block collapses behind the web's own disclosure and
//    fields.
// ───────────────────────────────────────────────────────────────────────────

describe("weight/volume per serving collapses behind the web's disclosure", () => {
  it("starts collapsed, with no bridge fields rendered", () => {
    const screen = render(<NewFoodRoute />);
    expect(screen.getByTestId("food-new-bridges-toggle")).toBeTruthy();
    expect(screen.queryByTestId("food-new-bridges-fields-weight")).toBeNull();
    expect(screen.queryByTestId("food-new-bridges-fields-volume")).toBeNull();
    // Not the native-only numeric fields this replaces.
    expect(screen.queryByTestId("food-new-grams-per-serving")).toBeNull();
    expect(screen.queryByTestId("food-new-ml-per-serving")).toBeNull();
  });

  it("opens on tap to the web's own freeform weight/volume fields", () => {
    const screen = render(<NewFoodRoute />);
    fireEvent.press(screen.getByTestId("food-new-bridges-toggle"));
    expect(screen.getByTestId("food-new-bridges-fields-weight")).toBeTruthy();
    expect(screen.getByTestId("food-new-bridges-fields-volume")).toBeTruthy();
  });

  it("parses a freeform entry to canonical grams and shows the readout, then submits it", async () => {
    mockApiFetch.mockImplementation(async (p: string) => {
      if (p === "/api/me/entitlements") return UNENFORCED;
      if (p === "/api/nutrition/foods") {
        return {
          success: true,
          created: true,
          food: {
            _id: "6512c0ffee1234567890abcd",
            name: "Grandma's Pancake Mix",
            authoredBy: "member-1",
            source: "manual",
          },
        };
      }
      if (String(p).startsWith("/api/me/foods")) return { saved: true };
      if (String(p).startsWith("/api/nutrition/foods/")) {
        return { food: { _id: "6512c0ffee1234567890abcd", name: "Grandma's Pancake Mix" } };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewFoodRoute />);
    fireEvent.press(screen.getByTestId("food-new-bridges-toggle"));
    fireEvent.changeText(screen.getByTestId("food-new-bridges-fields-weight"), "120 g");
    await act(async () => {
      fireEvent(screen.getByTestId("food-new-bridges-fields-weight"), "blur");
    });
    expect(screen.getByTestId("food-new-bridges-fields-weight-readout")).toHaveTextContent(
      "= 120 g",
    );

    await fillRequiredFields(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId("food-new-save"));
    });

    await waitFor(() => {
      const calls = mockApiFetch.mock.calls.filter(([p]) => p === "/api/nutrition/foods");
      expect(calls).toHaveLength(1);
    });
    const [, , init] = mockApiFetch.mock.calls.find(
      ([p]) => p === "/api/nutrition/foods",
    )!;
    const body = (init as { body: { variants: { gramsPerServing?: number }[] } }).body;
    expect(body.variants[0]?.gramsPerServing).toBe(120);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. The toggle and disabled Save button stay brand RED on native.
// ───────────────────────────────────────────────────────────────────────────

describe("the Save-to-My-Foods toggle and disabled Save button stay native red", () => {
  it("colours the bookmark toggle with the red primary token, on and off", () => {
    const screen = render(<NewFoodRoute />);
    const light = getTokens("light");
    const state = screen.getByTestId("food-new-bookmark-state");
    // On by default (the web's own default), and RED — never the web's
    // emerald.
    expect(state.props.style).toEqual(
      expect.objectContaining({ backgroundColor: rgb(light.primary) }),
    );

    fireEvent.press(screen.getByTestId("food-new-bookmark-toggle"));
    expect(screen.getByTestId("food-new-bookmark-state").props.style).toEqual(
      expect.objectContaining({ backgroundColor: rgb(light.muted) }),
    );
  });

  it("renders the disabled Save food button as a faded RED (bg-primary + opacity-50), never grey", () => {
    const screen = render(<NewFoodRoute />);
    // No name yet, so Save is disabled.
    const save = screen.getByTestId("food-new-save");
    expect(save.props.className).toContain("bg-primary");
    expect(save.props.className).toContain("opacity-50");

    fireEvent.changeText(screen.getByTestId("food-new-name"), "Oats");
    expect(screen.getByTestId("food-new-save").props.className).not.toContain(
      "opacity-50",
    );
    expect(screen.getByTestId("food-new-save").props.className).toContain(
      "bg-primary",
    );
  });
});
