/**
 * plateSaveMeal + PlateExtras — save a scanned plate as a meal and send
 * estimate feedback natively.
 *
 * The native half of the web's plate review extras
 * (`webapp/components/nutrition/SnapPlateModal.tsx:handleSaveRecipe`,
 * `ReviewFooter`, `GenerationFeedbackModal`): `POST /api/meals` with the
 * reviewed items (a real 403 gate opens the upgrade sheet, any other refusal
 * shows the server's words, and at the custom-meals cap the button stays and
 * opens the upgrade sheet from a synthetic gate) and a feedback sheet posting
 * `POST /api/feedback` with the generation metadata.
 *
 * The fake server below is the routes' own behaviour: `POST /api/meals`
 * refuses at 3 saved meals with a 403 carrying `feature` + `requiresTier`
 * (the ONLY refusal that raises the upgrade sheet), and `POST /api/feedback`
 * records `nutrition_generation` with the image and items attached.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { ApiError } from "@become/api-client";
import type { EntitlementsSnapshot, ReviewItem } from "@become/core";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/theme/useThemeTokens", () => {
  const actual = jest.requireActual("@/lib/theme/useThemeTokens");
  return {
    ...actual,
    useThemeTokens: () => ({
      mode: "light" as const,
      isDark: false,
      colors: {
        background: "rgb(255 255 255)",
        card: "rgb(255 255 255)",
        foreground: "rgb(0 0 0)",
        border: "rgb(200 200 200)",
        muted: "rgb(240 240 240)",
        "muted-foreground": "rgb(100 100 100)",
        success: "rgb(0 150 0)",
        primary: "rgb(200 0 0)",
        "primary-foreground": "rgb(255 255 255)",
        destructive: "rgb(200 0 0)",
      },
      tint: () => "rgb(240 240 240)",
      scrim: "rgba(0,0,0,0.4)",
      statusBarStyle: "dark" as const,
    }),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "test-token" }),
}));

// The snapshot, swapped per test. Everything else in the module stays real.
let mockSnapshot: EntitlementsSnapshot | null = null;
const mockRefresh = jest.fn(async () => {});
jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    ...actual,
    useEntitlements: () => ({
      data: mockSnapshot,
      loading: false,
      enforced: mockSnapshot?.enforced ?? false,
      refresh: mockRefresh,
      feature: (feature: string) =>
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ] ?? null,
      canCreate: (feature: string) =>
        !mockSnapshot ||
        mockSnapshot.enforced === false ||
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ]?.canCreate !== false,
    }),
  };
});

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { savePlateAsMeal, sendPlateFeedback } from "@/lib/nutrition/plateSaveMeal";
import { PlateExtras } from "@/components/nutrition/PlateExtras";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockShowUpgradeSheet = showUpgradeSheet as unknown as jest.Mock;

function reviewRow(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    name: "Chicken bowl",
    estimatedServing: "1 bowl",
    nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
    confidence: 0.9,
    multiplier: 1,
    unitLabel: "bowl",
    removed: false,
    matchChecked: true,
    match: null,
    ...overrides,
  };
}

const ROWS = [reviewRow()];

// ─── The fake server ─────────────────────────────────────────────────────────

let savedMeals: string[] = [];
let feedbackPosts: Array<{ type: string; message: string; metadata: unknown }> = [];
const MEALS_LIMIT = 3;

function cappedSnapshot(): EntitlementsSnapshot {
  return {
    role: "member",
    tier: "free",
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-meals": {
        allowed: true,
        canCreate: false,
        requiresTier: "plus",
        limit: MEALS_LIMIT,
        used: MEALS_LIMIT,
        remaining: 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  } as unknown as EntitlementsSnapshot;
}

function uncappedSnapshot(): EntitlementsSnapshot {
  return {
    role: "member",
    tier: "free",
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-meals": {
        allowed: true,
        canCreate: true,
        requiresTier: "plus",
        limit: MEALS_LIMIT,
        used: 1,
        remaining: 2,
        resetsAt: null,
        window: "lifetime",
      },
    },
  } as unknown as EntitlementsSnapshot;
}

function installFakeServer() {
  mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { body?: unknown }) => {
    if (url === "/api/meals") {
      const body = (init?.body ?? {}) as { name?: string };
      if (savedMeals.length >= MEALS_LIMIT) {
        throw new ApiError(403, {
          error: "You have used all 3 of your saved meals.",
          feature: "custom-meals",
          requiresTier: "plus",
          limit: MEALS_LIMIT,
          remaining: 0,
        });
      }
      savedMeals.push(String(body.name ?? "Meal"));
      return { meal: { _id: `meal-${savedMeals.length}` } };
    }
    if (url === "/api/feedback") {
      const body = (init?.body ?? {}) as { type?: string; message?: string; metadata?: unknown };
      feedbackPosts.push({ type: String(body.type), message: String(body.message), metadata: body.metadata });
      return { success: true, id: "feedback-1" };
    }
    return {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  mockSnapshot = null;
  savedMeals = [];
  feedbackPosts = [];
  installFakeServer();
});

describe("savePlateAsMeal (lib)", () => {
  it("(id: e015c9d5) a plate saved as a meal posts the reviewed items to POST /api/meals", async () => {
    const result = await savePlateAsMeal(
      { items: ROWS, name: "Chicken bowl", defaultTag: "lunch" },
      { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
    );
    expect(result.status).toBe("saved");
    expect(savedMeals).toEqual(["Chicken bowl"]);
    const call = mockApiFetch.mock.calls.find((c) => String(c[0]) === "/api/meals");
    expect(call).toBeTruthy();
    const body = (call?.[2] as { body?: Record<string, unknown> })?.body ?? {};
    expect(body.name).toBe("Chicken bowl");
    expect(body.defaultTag).toBe("lunch");
    expect(body.items).toEqual([
      expect.objectContaining({
        name: "Chicken bowl",
        servingSize: 1,
        servingUnit: "bowl",
        servings: 1,
        nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
      }),
    ]);
  });

  it("(id: e015c9d6) a real 403 gate comes back as a gate, not an error line", async () => {
    savedMeals = ["a", "b", "c"];
    const result = await savePlateAsMeal(
      { items: ROWS, name: "Fourth", defaultTag: "lunch" },
      { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
    );
    expect(result.status).toBe("gate");
    expect(result).toEqual(
      expect.objectContaining({
        gate: expect.objectContaining({ feature: "custom-meals", requiresTier: "plus" }),
      }),
    );
  });

  it("an ownership 403 shows the server's words, never the upgrade sheet", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/meals") {
        throw new ApiError(403, { error: "Not your meal to copy." });
      }
      return {};
    });
    const result = await savePlateAsMeal(
      { items: ROWS, name: "Copy", defaultTag: "lunch" },
      { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
    );
    expect(result).toEqual({ status: "error", message: "Couldn't save: Not your meal to copy." });
  });
});

describe("sendPlateFeedback (lib)", () => {
  it("posts nutrition_generation with the generation metadata attached", async () => {
    const result = await sendPlateFeedback(
      {
        items: ROWS,
        imageThumb: "data:image/jpeg;base64,abc",
        tag: "lunch",
        scanId: "scan-1",
        message: "It was 6 tacos, not 2.",
      },
      { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
    );
    expect(result).toEqual({ status: "sent" });
    expect(feedbackPosts).toHaveLength(1);
    expect(feedbackPosts[0]?.type).toBe("nutrition_generation");
    expect(feedbackPosts[0]?.message).toBe("It was 6 tacos, not 2.");
    const metadata = feedbackPosts[0]?.metadata as Record<string, unknown>;
    expect(metadata.surface).toBe("snap_plate_review");
    expect(metadata.source).toBe("photo");
    expect(metadata.tag).toBe("lunch");
    expect(metadata.scanId).toBe("scan-1");
    expect(metadata.itemCount).toBe(1);
    expect(Array.isArray(metadata.items)).toBe(true);
  });
});

describe("PlateExtras (sheet)", () => {
  function renderExtras(overrides?: Partial<ComponentProps<typeof PlateExtras>>) {
    return render(
      <PlateExtras
        activeCount={1}
        mealsAtCap={false}
        onCappedSave={() => {}}
        onSaveMeal={async () => true}
        onSendFeedback={async () => true}
        {...overrides}
      />,
    );
  }

  it("(id: e015c9d5) saving confirms in place instead of opening a meal page", async () => {
    mockSnapshot = uncappedSnapshot();
    const onSaveMeal = jest.fn(async () => true);
    const { getByTestId, queryByTestId } = renderExtras({ onSaveMeal });
    fireEvent.press(getByTestId("plate-extras-save"));
    fireEvent.changeText(getByTestId("plate-extras-save-name"), "Chicken bowl");
    fireEvent.press(getByTestId("plate-extras-save-confirm"));
    await waitFor(() => {
      expect(onSaveMeal).toHaveBeenCalledWith("Chicken bowl");
    });
    await waitFor(() => {
      expect(getByTestId("plate-extras-saved")).toBeTruthy();
    });
    expect(queryByTestId("plate-extras-save-form")).toBeNull();
  });

  it("(id: e015c9d6) a free member at 3 saved meals is shown the upgrade sheet, not an error", () => {
    mockSnapshot = cappedSnapshot();
    const onCappedSave = jest.fn();
    const { getByTestId, queryByTestId } = renderExtras({
      mealsAtCap: true,
      onCappedSave,
    });
    // The button stays at the cap — it is not hidden and it is not an error.
    expect(getByTestId("plate-extras-save")).toBeTruthy();
    expect(queryByTestId("plate-extras-save-error")).toBeNull();
    fireEvent.press(getByTestId("plate-extras-save"));
    expect(onCappedSave).toHaveBeenCalledTimes(1);
  });

  it("a real 403 from the save opens the upgrade sheet via the sheet wiring", async () => {
    mockSnapshot = uncappedSnapshot();
    savedMeals = ["a", "b", "c"];
    const { getByTestId } = render(
      <PlateExtras
        activeCount={1}
        mealsAtCap={false}
        onCappedSave={() => {}}
        onSaveMeal={async (name) => {
          const result = await savePlateAsMeal(
            { items: ROWS, name, defaultTag: "lunch" },
            { baseUrl: "https://become.redbtn.io", getToken: () => "test-token" },
          );
          if (result.status === "saved") return true;
          if (result.status === "gate") {
            (showUpgradeSheet as unknown as jest.Mock)(result.gate);
            return false;
          }
          throw new Error(result.message);
        }}
        onSendFeedback={async () => true}
      />,
    );
    fireEvent.press(getByTestId("plate-extras-save"));
    fireEvent.changeText(getByTestId("plate-extras-save-name"), "Fourth");
    fireEvent.press(getByTestId("plate-extras-save-confirm"));
    await waitFor(() => {
      expect(mockShowUpgradeSheet).toHaveBeenCalledWith(
        expect.objectContaining({ feature: "custom-meals", requiresTier: "plus" }),
      );
    });
  });

  it("feedback sends with the message and shows the saved confirmation", async () => {
    const onSendFeedback = jest.fn(async () => true);
    const { getByTestId } = renderExtras({ onSendFeedback });
    fireEvent.press(getByTestId("plate-extras-feedback-open"));
    fireEvent.changeText(
      getByTestId("plate-extras-feedback-input"),
      "It was 6 tacos, not 2.",
    );
    fireEvent.press(getByTestId("plate-extras-feedback-send"));
    await waitFor(() => {
      expect(onSendFeedback).toHaveBeenCalledWith("It was 6 tacos, not 2.");
    });
    await waitFor(() => {
      expect(getByTestId("plate-extras-feedback-sent")).toBeTruthy();
    });
  });
});
