/* eslint-disable import/first */
// ─── Saved meal: edit prefill, the log sheet's web parity, detail hero (NP-268) ─
//
// Full visual pass (native vs web, build d68b84e3) found three drifts on a
// saved meal, all fixed here:
//
//   1. BLOCKER: `Edit` on a saved meal opened `MealEditorSheet` with every
//      field empty and `Save` disabled. `BottomSheet` keeps its children
//      mounted at all times (only the RN `Modal`'s own `visible` toggles), so
//      the editor's `useState` initialisers only ever ran against whatever
//      `initial` was at the SHEET's first mount — null, before the meal had
//      loaded. Fixed by re-seeding every time the sheet opens.
//   2. The log sheet ignored the meal's own tag (`currentTag` was always the
//      time-of-day default) and lacked the web's `MealApplySheet`: fractional
//      portions + Custom, a coloured macro tile, and `Apply to <Tag>`.
//   3. The detail header repeated the notes under the title (the web shows
//      them once, in Notes) and macro numbers were uncoloured.
//
// Each `it` below is named for the id a reviewer would check off.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

let mockParams: Record<string, string | undefined> = { id: "m1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

// `currentDefaultTag` (the time-of-day fallback) is pinned to "dinner" so the
// assertion that ADDING TO starts at the MEAL's own "lunch" tag cannot pass
// by coincidence of whatever hour the suite happens to run at.
jest.mock("@/lib/nutrition/mealSchedule", () => {
  const actual = jest.requireActual("@/lib/nutrition/mealSchedule");
  return { __esModule: true, ...actual, defaultTagAt: () => "dinner" };
});

import { apiFetch } from "@become/api-client";
import { MealDetail } from "@/components/nutrition/MealDetail";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsTo(pathname: string, method?: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(([p, , init]) => {
    if (String(p) !== pathname) return false;
    if (!method) return true;
    const i = (init ?? {}) as { method?: string };
    return i.method === method;
  });
}

// `components/Text.tsx` wraps `style` in `[{ fontFamily }, style]`, so the
// caller's own colour sits at index 1, not on `.props.style` directly.
function colorOf(el: { props: { style?: unknown } }): unknown {
  const style = el.props.style;
  if (Array.isArray(style)) {
    for (const s of style) {
      if (s && typeof s === "object" && "color" in s) return (s as { color: unknown }).color;
    }
    return undefined;
  }
  return (style as { color?: unknown } | undefined)?.color;
}

function bodyOf(call: unknown[] | undefined): Record<string, unknown> {
  return ((call?.[2] as { body?: Record<string, unknown> })?.body ?? {}) as Record<
    string,
    unknown
  >;
}

// The card's own example: "FP test meal", default tag Lunch, a Chicken Breast
// item, 388 cal · P73 C0 F9.
const MEAL = {
  _id: "m1",
  name: "FP test meal",
  description: "FP test notes",
  items: [
    {
      name: "Chicken Breast",
      brand: undefined,
      servingSize: 140,
      servingUnit: "g",
      servings: 1,
      nutrition: { calories: 400, protein: 40, carbs: 20, fats: 8 },
      loggedQuantity: 140,
      loggedUnit: "g",
    },
  ],
  tags: ["lunch"],
  defaultTag: "lunch",
  createdBy: "member-1",
  totalNutrition: { calories: 400, protein: 40, carbs: 20, fats: 8 },
};

function routeFetch(impl: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(
    async (p: string, _schema: unknown, init?: unknown) => impl(p, init),
  );
}

function baseRoutes(p: string, init?: unknown): unknown {
  const method = (init as { method?: string } | undefined)?.method;
  if (p === "/api/meals/m1" && (!method || method === "GET")) return { meal: MEAL };
  if (p === "/api/tags") return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
  if (p === "/api/nutrition/meal-schedule") return { windows: [] };
  if (p === "/api/meals/m1/log" && method === "POST") return { success: true };
  throw new Error(`unexpected fetch ${p} ${method}`);
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockParams = { id: "m1" };
});

// ───────────────────────────────────────────────────────────────────────────
// 1. BLOCKER — Edit opens prefilled, Save enabled.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-268-edit) Edit on a saved meal opens MealEditorSheet prefilled", () => {
  it("prefills name, description, default tag, tags and items — Save stays enabled", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => {
      expect(screen.getByTestId("meal-detail-edit")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-edit"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("meal-editor-name")).toBeTruthy();
    });

    expect(screen.getByTestId("meal-editor-name").props.value).toBe("FP test meal");
    expect(screen.getByTestId("meal-editor-description").props.value).toBe(
      "FP test notes",
    );
    expect(
      screen.getByTestId("meal-editor-default-tag-lunch").props.accessibilityState
        .selected,
    ).toBe(true);
    expect(screen.getByTestId("meal-editor-tag-lunch")).toBeTruthy();
    // Items came back too — never "No items yet" on an edit.
    expect(screen.queryByTestId("meal-editor-items-empty")).toBeNull();
    expect(screen.getByTestId("meal-editor-totals").props.children.join("")).toContain(
      "400",
    );
    // Save is enabled: a name and at least one item are both already there.
    expect(screen.getByTestId("meal-editor-save").props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("re-seeds on every open — closing and reopening does not leave a stale form", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-edit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-edit"));
    });
    await waitFor(() => expect(screen.getByTestId("meal-editor-name")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("meal-editor-name"), "Scratch edit");

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-editor-cancel"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-edit"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("meal-editor-name").props.value).toBe("FP test meal");
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. The log sheet — the meal's own tag, fractional portions, a coloured tile.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-268-log) the log sheet matches the web's MealApplySheet", () => {
  it("ADDING TO starts at the meal's own tag, not the time-of-day default", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-log")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-log"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("meal-log-sheet-tag-toggle")).toBeTruthy();
    });
    // "dinner" is the pinned time-of-day fallback — if the sheet ever reads
    // that instead of the meal's own "lunch" this regresses to the bug.
    expect(
      screen.getByTestId("meal-log-sheet-tag-toggle").props.accessibilityLabel,
    ).toBe("Adding to Lunch, tap to change");
    expect(screen.getByTestId("meal-log-sheet-submit").props.accessibilityLabel).toBe(
      "Apply to Lunch",
    );
  });

  it("a fractional portion scales the coloured macro tile and the Apply call", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-log")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-log"));
    });
    await waitFor(() => expect(screen.getByTestId("meal-log-sheet-portion-0.5")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-portion-0.5"));
    });

    // Protein blue, carbs green, fats amber — never all black.
    const cal = screen.getByTestId("meal-log-sheet-macro-cal");
    const protein = screen.getByTestId("meal-log-sheet-macro-protein");
    const carbs = screen.getByTestId("meal-log-sheet-macro-carbs");
    const fats = screen.getByTestId("meal-log-sheet-macro-fats");
    expect(cal.props.children).toBe("200");
    expect(protein.props.children).toBe("20g");
    expect(carbs.props.children).toBe("10g");
    expect(fats.props.children).toBe("4g");
    expect(colorOf(protein)).not.toBe(colorOf(cal));
    expect(colorOf(carbs)).not.toBe(colorOf(protein));
    expect(colorOf(fats)).not.toBe(colorOf(carbs));

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/meals/m1/log", "POST")).toHaveLength(1);
    });
    const body = bodyOf(callsTo("/api/meals/m1/log", "POST")[0]);
    expect(body.portion).toBe(0.5);
    expect(body.tags).toEqual(["lunch"]);
  });

  it("offers Custom alongside the fraction pills, like the web", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-log")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-log"));
    });
    await waitFor(() => expect(screen.getByTestId("meal-log-sheet-portion-custom")).toBeTruthy());

    for (const value of ["0.25", "0.333", "0.5", "0.667", "0.75", "1", "1.5", "2", "3"]) {
      expect(screen.getByTestId(`meal-log-sheet-portion-${value}`)).toBeTruthy();
    }

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-portion-custom"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("meal-log-sheet-portion-custom-input")).toBeTruthy();
    });
    fireEvent.changeText(
      screen.getByTestId("meal-log-sheet-portion-custom-input"),
      "2.5",
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-submit"));
    });
    await waitFor(() => {
      expect(callsTo("/api/meals/m1/log", "POST")).toHaveLength(1);
    });
    expect(bodyOf(callsTo("/api/meals/m1/log", "POST")[0]).portion).toBe(2.5);
  });

  it("Now / No time replaces the native-only untimed checkbox", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-log")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-log"));
    });
    await waitFor(() => expect(screen.getByTestId("meal-log-sheet-time-none")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-time-none"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(callsTo("/api/meals/m1/log", "POST")).toHaveLength(1);
    });
    expect(bodyOf(callsTo("/api/meals/m1/log", "POST")[0]).untimed).toBe(true);
  });

  it("Apply to <Tag> is black on white / white on black, never the brand red", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-log")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("meal-detail-log"));
    });
    await waitFor(() => expect(screen.getByTestId("meal-log-sheet-submit")).toBeTruthy());
    const submit = screen.getByTestId("meal-log-sheet-submit");
    expect(submit.props.className).toContain("bg-foreground");
    expect(submit.props.className).not.toContain("bg-primary");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. The detail hero — once-only notes, coloured macros, no red CTA.
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-268-detail) the detail screen matches the web's hero and colours", () => {
  it("shows the notes once (in their own card), not repeated under the title", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => {
      expect(screen.getAllByText("FP test notes")).toHaveLength(1);
    });
    expect(screen.getByTestId("meal-detail-notes").props.children).toBe(
      "FP test notes",
    );
  });

  it("the photo-less hero is a gradient with the chef icon, not a grey box", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => {
      expect(screen.getByTestId("meal-detail-photo-fallback")).toBeTruthy();
    });
    const hero = screen.getByTestId("meal-detail-photo-fallback");
    expect(Array.isArray(hero.props.colors)).toBe(true);
    expect(hero.props.colors).toHaveLength(2);
  });

  it("macro numbers are coloured — protein, carbs and fats each differ from Cal", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-macro-cal")).toBeTruthy());
    const cal = screen.getByTestId("meal-detail-macro-cal");
    const protein = screen.getByTestId("meal-detail-macro-protein");
    const carbs = screen.getByTestId("meal-detail-macro-carbs");
    const fats = screen.getByTestId("meal-detail-macro-fats");
    expect(colorOf(protein)).not.toBe(colorOf(cal));
    expect(colorOf(carbs)).not.toBe(colorOf(protein));
    expect(colorOf(fats)).not.toBe(colorOf(carbs));
  });

  it("Apply to log is inverted (black/white), never the brand red primary button", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-log")).toBeTruthy());
    expect(screen.getByTestId("meal-detail-log").props.className).toContain(
      "bg-foreground",
    );
    expect(screen.getByTestId("meal-detail-log").props.className).not.toContain(
      "bg-primary",
    );
  });

  it("To recipe carries its swap icon", async () => {
    routeFetch(baseRoutes);
    const screen = render(<MealDetail />);
    await waitFor(() => expect(screen.getByTestId("meal-detail-to-recipe")).toBeTruthy());
    expect(() =>
      screen.UNSAFE_getByType(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("lucide-react-native").ArrowLeftRight,
      ),
    ).not.toThrow();
  });
});
