/* eslint-disable import/first */
import { render, fireEvent, waitFor } from "@testing-library/react-native";

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

jest.mock("@/lib/entitlements/store", () => ({
  getEntitlementsSnapshot: () => ({
    enforced: true,
    features: {
      "ai-food-estimate": {
        allowed: true,
        canCreate: false,
        limit: 1,
        used: 1,
        remaining: 0,
      },
    },
  }),
  getEntitlementsToken: () => "test-token",
  loadEntitlements: jest.fn().mockResolvedValue(undefined),
  seedEntitlementsFromCache: jest.fn().mockResolvedValue(undefined),
  subscribeToEntitlements: () => () => {},
}));

jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    data: {
      enforced: true,
      features: {
        "ai-food-estimate": {
          allowed: true,
          canCreate: false,
          limit: 1,
          used: 1,
          remaining: 0,
        },
      },
    },
    feature: (f: string) =>
      f === "ai-food-estimate"
        ? {
            allowed: true,
            canCreate: false,
            limit: 1,
            used: 1,
            remaining: 0,
          }
        : null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
}));

jest.mock("@/lib/ai/aiConsentPrompt", () => ({
  showAiConsentPrompt: jest.fn(),
}));

jest.mock("@/lib/media/capture", () => {
  const actual = jest.requireActual("@/lib/media/capture");
  return {
    ...actual,
    captureImage: jest.fn(),
  };
});

jest.mock("@/components/nutrition/FoodSearchSheet", () => {
  const RN = jest.requireActual("react-native");
  return {
    FoodSearchSheet: ({ visible }: { visible: boolean }) =>
      visible ? (
        <RN.View testID="estimate-sheet-add-more-sheet" />
      ) : null,
  };
});

jest.mock("@/components/media/AuthedImage", () => ({
  AuthedImage: () => null,
}));

import { captureImage } from "@/lib/media/capture";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { showAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { EstimateSheet } from "@/components/nutrition/EstimateSheet";
import * as plateEstimate from "@/lib/nutrition/plateEstimate";

const mockCapture = captureImage as jest.Mock;

const IMAGE = {
  uri: "file:///cache/photo.jpg",
  width: 800,
  height: 600,
  dataUrl: "data:image/jpeg;base64,AAA",
  mimeType: "image/jpeg" as const,
  fileName: "photo.jpg",
};

const ESTIMATE = {
  items: [
    {
      name: "Chicken bowl",
      estimatedServing: "1 bowl",
      nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
      confidence: 0.9,
    },
  ],
};

function renderSheet(extra?: {
  initialPhase?: "chooser" | "describe" | "compose";
  initialDescribe?: string | null;
}) {
  return render(
    <EstimateSheet
      visible
      onClose={() => {}}
      onLogged={() => {}}
      tag="lunch"
      dateKey="2026-10-03"
      todayKey="2026-10-03"
      initialPhase={extra?.initialPhase ?? "chooser"}
      {...(extra?.initialDescribe !== undefined
        ? { initialDescribe: extra.initialDescribe }
        : {})}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapture.mockReset();
  jest.spyOn(plateEstimate, "reconcileEstimateItems").mockResolvedValue([]);
  jest.spyOn(plateEstimate, "persistEstimate").mockResolvedValue({ scanId: "scan1" });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("EstimateSheet (NP-089)", () => {
  it("shows Take photo, Upload and Describe plus the free-scans line when capped", () => {
    const { getByTestId } = renderSheet();
    expect(getByTestId("estimate-sheet-chooser")).toBeTruthy();
    expect(getByTestId("estimate-sheet-take-photo")).toBeTruthy();
    expect(getByTestId("estimate-sheet-upload-photo")).toBeTruthy();
    expect(getByTestId("estimate-sheet-describe")).toBeTruthy();
    // Enforcement on + capped member → the server's remaining line.
    expect(getByTestId("estimate-sheet-scans-left").props.children).toBe(
      "0 of 1 free scan left today",
    );
  });

  it("a free member's second estimate shows the upgrade sheet, not an error", async () => {
    const gate = { error: "Out of free scans", requiresTier: "plus" };
    jest
      .spyOn(plateEstimate, "estimateFromDescription")
      .mockResolvedValue({ status: "gate", gate });
    const { getByTestId, queryByTestId } = renderSheet({ initialPhase: "describe" });
    fireEvent.changeText(
      getByTestId("estimate-sheet-describe-input"),
      "chicken bowl",
    );
    fireEvent.press(getByTestId("estimate-sheet-describe-estimate"));
    await waitFor(() => {
      expect(showUpgradeSheet).toHaveBeenCalledWith(gate);
    });
    expect(queryByTestId("estimate-sheet-error")).toBeNull();
  });

  it("a consent refusal shows the consent prompt and no estimate is charged", async () => {
    jest
      .spyOn(plateEstimate, "estimateFromDescription")
      .mockResolvedValue({ status: "consent" });
    const { getByTestId, queryByTestId } = renderSheet({ initialPhase: "describe" });
    fireEvent.changeText(
      getByTestId("estimate-sheet-describe-input"),
      "chicken bowl",
    );
    fireEvent.press(getByTestId("estimate-sheet-describe-estimate"));
    await waitFor(() => {
      expect(showAiConsentPrompt).toHaveBeenCalled();
    });
    expect(queryByTestId("estimate-sheet-error")).toBeNull();
    expect(showUpgradeSheet).not.toHaveBeenCalled();
  });

  it("empty items asks for more detail; a thrown failure is our side", async () => {
    const emptySpy = jest
      .spyOn(plateEstimate, "estimateFromDescription")
      .mockResolvedValue({ status: "empty" });
    const first = renderSheet({ initialPhase: "describe" });
    fireEvent.changeText(
      first.getByTestId("estimate-sheet-describe-input"),
      "food",
    );
    fireEvent.press(first.getByTestId("estimate-sheet-describe-estimate"));
    await waitFor(() => {
      expect(first.getByTestId("estimate-sheet-error")).toBeTruthy();
    });
    expect(first.getByTestId("estimate-sheet-error").props.children).toBeDefined();
    emptySpy.mockRestore();
    first.unmount();

    jest
      .spyOn(plateEstimate, "estimateFromDescription")
      .mockResolvedValue({ status: "unavailable" });
    const second = renderSheet({ initialPhase: "describe" });
    fireEvent.changeText(
      second.getByTestId("estimate-sheet-describe-input"),
      "food",
    );
    fireEvent.press(second.getByTestId("estimate-sheet-describe-estimate"));
    await waitFor(() => {
      expect(second.getByTestId("estimate-sheet-error")).toBeTruthy();
    });
  });

  it("a photo estimate lands on review with portion controls and logs with source photo", async () => {
    mockCapture.mockResolvedValue({ status: "captured", image: IMAGE });
    jest
      .spyOn(plateEstimate, "estimateFromPhoto")
      .mockResolvedValue({ status: "estimated", estimate: ESTIMATE });
    const { reviewItemsFor } = jest.requireActual("@/lib/nutrition/plateEstimate");
    jest.spyOn(plateEstimate, "reconcileEstimateItems").mockImplementation(async (rows) => rows);
    const logSpy = jest
      .spyOn(plateEstimate, "logEstimate")
      .mockResolvedValue({ ok: true, mealLogId: "log1" });
    const onLogged = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <EstimateSheet
        visible
        onClose={onClose}
        onLogged={onLogged}
        tag="lunch"
        dateKey="2026-10-03"
        todayKey="2026-10-03"
      />,
    );
    fireEvent.press(getByTestId("estimate-sheet-take-photo"));
    await waitFor(() => {
      expect(getByTestId("estimate-sheet-compose")).toBeTruthy();
    });
    fireEvent.press(getByTestId("estimate-sheet-compose-estimate"));
    await waitFor(() => {
      expect(getByTestId("estimate-sheet-review")).toBeTruthy();
    });
    // One row with the estimate's calories, adjustable by portion step.
    expect(getByTestId("estimate-sheet-item-0")).toBeTruthy();
    const before = getByTestId("estimate-sheet-item-0-amount").props.children;
    fireEvent.press(getByTestId("estimate-sheet-item-0-plus"));
    const after = getByTestId("estimate-sheet-item-0-amount").props.children;
    expect(before).not.toBe(after);
    // Meal picker + log.
    fireEvent.press(getByTestId("estimate-sheet-meal-dinner"));
    fireEvent.press(getByTestId("estimate-sheet-log"));
    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "camera", tag: "dinner" }),
        expect.anything(),
      );
    });
    expect(onLogged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(reviewItemsFor).toBeDefined();
  });
});
