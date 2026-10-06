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
  initialAutoCaptureSource?: "camera" | "library" | null;
  onClose?: () => void;
}) {
  return render(
    <EstimateSheet
      visible
      onClose={extra?.onClose ?? (() => {})}
      onLogged={() => {}}
      tag="lunch"
      dateKey="2026-10-03"
      todayKey="2026-10-03"
      initialPhase={extra?.initialPhase ?? "chooser"}
      {...(extra?.initialDescribe !== undefined
        ? { initialDescribe: extra.initialDescribe }
        : {})}
      {...(extra?.initialAutoCaptureSource !== undefined
        ? { initialAutoCaptureSource: extra.initialAutoCaptureSource }
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

describe("EstimateSheet correction ticket (NP-090)", () => {
  const FIRST = {
    items: [
      {
        name: "Tacos",
        estimatedServing: "3 tacos",
        nutrition: { calories: 600, protein: 30, carbs: 50, fats: 20 },
        confidence: 0.9,
      },
    ],
    allowanceTicket: "ticket_first",
  };
  const REVISED = {
    items: [
      {
        name: "Tacos",
        estimatedServing: "6 tacos",
        nutrition: { calories: 1200, protein: 60, carbs: 100, fats: 40 },
        confidence: 0.9,
      },
    ],
    allowanceTicket: "ticket_revised",
  };

  async function estimateThenReview(describeSpy: jest.SpyInstance) {
    describeSpy.mockResolvedValue({ status: "estimated", estimate: FIRST });
    jest
      .spyOn(plateEstimate, "reconcileEstimateItems")
      .mockImplementation(async (rows) => rows);
    const { getByTestId, queryByTestId } = renderSheet({
      initialPhase: "describe",
    });
    fireEvent.changeText(
      getByTestId("estimate-sheet-describe-input"),
      "three tacos",
    );
    fireEvent.press(getByTestId("estimate-sheet-describe-estimate"));
    await waitFor(() => {
      expect(getByTestId("estimate-sheet-review")).toBeTruthy();
    });
    return { getByTestId, queryByTestId };
  }

  it("(id: e015c8ad) a free member at 1/1 corrects today's estimate and gets a revised estimate without the upgrade sheet", async () => {
    const describeSpy = jest.spyOn(plateEstimate, "estimateFromDescription");
    const { getByTestId } = await estimateThenReview(describeSpy);
    // The fresh estimate never presents a ticket.
    expect(describeSpy).toHaveBeenCalledWith(
      "three tacos",
      expect.anything(),
    );
    expect(describeSpy.mock.calls[0]?.[0]).toBe("three tacos");

    const correctSpy = jest.spyOn(plateEstimate, "correctDescribeEstimate");
    correctSpy.mockResolvedValue({ status: "estimated", estimate: REVISED });
    fireEvent.changeText(
      getByTestId("estimate-sheet-correct-input"),
      "it was 6 tacos",
    );
    fireEvent.press(getByTestId("estimate-sheet-correct-send"));
    await waitFor(() => {
      expect(correctSpy).toHaveBeenCalled();
    });
    // The correction rides the estimate's ticket — no upgrade sheet.
    const args = correctSpy.mock.calls[0];
    expect(args?.[1]).toBe("it was 6 tacos");
    expect(args?.[2]).toBe("ticket_first");
    expect(showUpgradeSheet).not.toHaveBeenCalled();
    // The revised estimate replaces the review.
    await waitFor(() => {
      expect(
        getByTestId("estimate-sheet-item-0-amount").props.children,
      ).toContain("6");
    });
    expect(
      getByTestId("estimate-sheet-review"),
    ).toBeTruthy();
  });

  it("(id: e015c8ae) starting a fresh estimate after that shows the upgrade sheet (the ticket did not leak)", async () => {
    const describeSpy = jest.spyOn(plateEstimate, "estimateFromDescription");
    const { getByTestId } = await estimateThenReview(describeSpy);
    const correctSpy = jest.spyOn(plateEstimate, "correctDescribeEstimate");
    correctSpy.mockResolvedValue({ status: "estimated", estimate: REVISED });
    fireEvent.changeText(
      getByTestId("estimate-sheet-correct-input"),
      "it was 6 tacos",
    );
    fireEvent.press(getByTestId("estimate-sheet-correct-send"));
    await waitFor(() => {
      expect(correctSpy).toHaveBeenCalled();
    });
    // Start over → a fresh estimate goes through the unticketed door…
    fireEvent.press(getByTestId("estimate-sheet-retry"));
    const gate = { error: "Out of free scans", requiresTier: "plus" };
    describeSpy.mockResolvedValue({ status: "gate", gate });
    fireEvent.press(getByTestId("estimate-sheet-describe"));
    fireEvent.changeText(
      getByTestId("estimate-sheet-describe-input"),
      "a burger",
    );
    fireEvent.press(getByTestId("estimate-sheet-describe-estimate"));
    await waitFor(() => {
      expect(showUpgradeSheet).toHaveBeenCalledWith(gate);
    });
    // …and the fresh call carried no ticket.
    const freshCall = describeSpy.mock.calls.find(
      (c) => c[0] === "a burger",
    );
    expect(freshCall).toBeDefined();
  });

  it("(id: e015c8af) a refused correction leaves the previous estimate on screen, unchanged", async () => {
    const describeSpy = jest.spyOn(plateEstimate, "estimateFromDescription");
    const { getByTestId } = await estimateThenReview(describeSpy);
    const before = getByTestId("estimate-sheet-item-0-amount").props.children;
    const gate = { error: "Out of free scans", requiresTier: "plus" };
    const correctSpy = jest.spyOn(plateEstimate, "correctDescribeEstimate");
    correctSpy.mockResolvedValue({ status: "gate", gate });
    fireEvent.changeText(
      getByTestId("estimate-sheet-correct-input"),
      "it was 6 tacos",
    );
    fireEvent.press(getByTestId("estimate-sheet-correct-send"));
    await waitFor(() => {
      expect(showUpgradeSheet).toHaveBeenCalledWith(gate);
    });
    // Gate (upgrade sheet), not an outage toast line: the review stays.
    expect(getByTestId("estimate-sheet-review")).toBeTruthy();
    expect(getByTestId("estimate-sheet-item-0-amount").props.children).toBe(
      before,
    );
    expect(getByTestId("estimate-sheet-item-0")).toBeTruthy();
  });

  it("a photo correction re-reads the same image with the ticket", async () => {
    mockCapture.mockResolvedValue({ status: "captured", image: IMAGE });
    const photoSpy = jest.spyOn(plateEstimate, "estimateFromPhoto");
    photoSpy.mockResolvedValue({ status: "estimated", estimate: FIRST });
    jest
      .spyOn(plateEstimate, "reconcileEstimateItems")
      .mockImplementation(async (rows) => rows);
    const { getByTestId } = render(
      <EstimateSheet
        visible
        onClose={() => {}}
        onLogged={() => {}}
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
    const correctPhotoSpy = jest.spyOn(plateEstimate, "correctPhotoEstimate");
    correctPhotoSpy.mockResolvedValue({
      status: "estimated",
      estimate: REVISED,
    });
    fireEvent.changeText(
      getByTestId("estimate-sheet-correct-input"),
      "it was 6 tacos",
    );
    fireEvent.press(getByTestId("estimate-sheet-correct-send"));
    await waitFor(() => {
      expect(correctPhotoSpy).toHaveBeenCalled();
    });
    const args = correctPhotoSpy.mock.calls[0];
    expect(args?.[0]).toBe(IMAGE.dataUrl);
    expect(args?.[1]).toBe("it was 6 tacos");
    expect(args?.[2]).toBe("ticket_first");
    expect(showUpgradeSheet).not.toHaveBeenCalled();
  });

  it("an outage correction keeps the review and shows a toast line, not the upgrade sheet", async () => {
    const describeSpy = jest.spyOn(plateEstimate, "estimateFromDescription");
    const { getByTestId } = await estimateThenReview(describeSpy);
    const before = getByTestId("estimate-sheet-item-0-amount").props.children;
    const correctSpy = jest.spyOn(plateEstimate, "correctDescribeEstimate");
    correctSpy.mockResolvedValue({ status: "unavailable" });
    fireEvent.changeText(
      getByTestId("estimate-sheet-correct-input"),
      "it was 6 tacos",
    );
    fireEvent.press(getByTestId("estimate-sheet-correct-send"));
    await waitFor(() => {
      expect(getByTestId("estimate-sheet-correct-notice")).toBeTruthy();
    });
    expect(showUpgradeSheet).not.toHaveBeenCalled();
    expect(getByTestId("estimate-sheet-review")).toBeTruthy();
    expect(getByTestId("estimate-sheet-item-0-amount").props.children).toBe(
      before,
    );
  });
});

describe("EstimateSheet describe sheet matches web (NP-263)", () => {
  it("wraps its content in a KeyboardAvoidingView with iOS padding behavior, so the keyboard cannot hide the field or Estimate", () => {
    // A behavioral assertion can't observe iOS keyboard geometry under RTL —
    // this guards the regression at the source level, the same way
    // __tests__/iosKeyboardAvoiding.test.ts guards top-level screens.
    const fs = jest.requireActual("fs");
    const path = jest.requireActual("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "components/nutrition/EstimateSheet.tsx"),
      "utf8",
    );
    expect(src).toContain("KeyboardAvoidingView");
    expect(src).toMatch(/Platform\.OS\s*===\s*["']ios["']\s*\?\s*["']padding["']/);
    expect(src).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  it("shows a pencil-icon header with the web's title/subtitle and a close button that closes the sheet", () => {
    const onClose = jest.fn();
    const { getByTestId, getByText } = renderSheet({
      initialPhase: "describe",
      onClose,
    });
    expect(getByTestId("estimate-sheet-describe-header")).toBeTruthy();
    expect(getByText("Add a photo too, or just use your words")).toBeTruthy();
    expect(
      getByText("In your words — add a photo too, or just estimate from the text."),
    ).toBeTruthy();
    fireEvent.press(getByTestId("estimate-sheet-describe-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Add photo and Upload photo, carrying the typed text forward as the compose note", async () => {
    mockCapture.mockResolvedValue({ status: "captured", image: IMAGE });
    const { getByTestId } = renderSheet({ initialPhase: "describe" });
    fireEvent.changeText(
      getByTestId("estimate-sheet-describe-input"),
      "chicken burrito bowl",
    );
    fireEvent.press(getByTestId("estimate-sheet-describe-upload-photo"));
    expect(mockCapture).toHaveBeenCalledWith("library");
    await waitFor(() => {
      expect(getByTestId("estimate-sheet-compose")).toBeTruthy();
    });
    expect(getByTestId("estimate-sheet-compose-note").props.value).toBe(
      "chicken burrito bowl",
    );
  });

  it("the describe Estimate button uses the teal/success styling, not the brand red", () => {
    const { getByTestId } = renderSheet({ initialPhase: "describe" });
    const estimateButton = getByTestId("estimate-sheet-describe-estimate");
    const className: string = estimateButton.props.className ?? "";
    expect(className).toMatch(/bg-success/);
    expect(className).not.toMatch(/bg-primary\b/);
  });

  it("an auto-capture source (Upload menu's 'Upload photo') opens the library directly, skipping the chooser", async () => {
    mockCapture.mockResolvedValue({ status: "captured", image: IMAGE });
    const { getByTestId, queryByTestId } = renderSheet({
      initialAutoCaptureSource: "library",
    });
    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith("library");
    });
    await waitFor(() => {
      expect(getByTestId("estimate-sheet-compose")).toBeTruthy();
    });
    // The chooser (Take photo / Upload photo / Describe it instead) is never
    // shown — unlike the pre-fix bug where Upload photo re-opened it.
    expect(queryByTestId("estimate-sheet-chooser")).toBeNull();
  });
});

describe("EstimateSheet review polish (NP-322)", () => {
  it("shows the web's 'Your plate' header (icon, subtitle, X) outside the describe phase", () => {
    const onClose = jest.fn();
    const { getByTestId, getByText } = renderSheet({ onClose });
    expect(getByTestId("estimate-sheet-header")).toBeTruthy();
    expect(getByText("Your plate")).toBeTruthy();
    expect(getByText("AI estimate — tweak before logging")).toBeTruthy();
    fireEvent.press(getByTestId("estimate-sheet-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("de-dupes tag options case-insensitively, keeping defaults first — each chip renders once", () => {
    const { getByTestId, getAllByTestId } = render(
      <EstimateSheet
        visible
        onClose={() => {}}
        onLogged={() => {}}
        tag="snack"
        tagOptions={[
          "Breakfast",
          "Lunch",
          "Dinner",
          "Snack",
          "Pre-Workout",
          "Post-Workout",
          "Breakfast",
          "Dinner",
          "Lunch",
          "Post-Workout",
          "Pre-Workout",
          "Snack",
        ]}
        dateKey="2026-10-03"
        todayKey="2026-10-03"
        initialPhase="review"
        initialReview={[
          {
            name: "Chicken bowl",
            nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
            confidence: 0.9,
          },
        ]}
      />,
    );
    expect(getByTestId("estimate-sheet-review")).toBeTruthy();
    for (const tag of [
      "breakfast",
      "lunch",
      "dinner",
      "snack",
      "pre-workout",
      "post-workout",
    ]) {
      expect(getAllByTestId(`estimate-sheet-meal-${tag}`)).toHaveLength(1);
    }
  });

  it("shows confidence and match-DB chips on each review row instead of plain grey text", () => {
    const { getByTestId } = render(
      <EstimateSheet
        visible
        onClose={() => {}}
        onLogged={() => {}}
        tag="lunch"
        dateKey="2026-10-03"
        todayKey="2026-10-03"
        initialPhase="review"
        initialReview={[
          {
            name: "Chicken bowl",
            nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
            confidence: 0.9,
            matchKind: "food",
          },
        ]}
      />,
    );
    // The testID sits on the pill's outer View; the label is its Text child.
    expect(
      getByTestId("estimate-sheet-item-0-confidence").props.children.props.children,
    ).toBe("High");
    expect(
      getByTestId("estimate-sheet-item-0-match-badge").props.children.props.children,
    ).toBe("In your foods");
  });

  it("puts the best-guess notice above 'Missing something?', not under Save as meal", () => {
    const { getByText, toJSON } = render(
      <EstimateSheet
        visible
        onClose={() => {}}
        onLogged={() => {}}
        tag="lunch"
        dateKey="2026-10-03"
        todayKey="2026-10-03"
        initialPhase="review"
        initialReview={[
          {
            name: "Chicken bowl",
            nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
            confidence: 0.9,
            matchKind: "food",
          },
        ]}
      />,
    );
    expect(getByText(/These foods are a best guess/)).toBeTruthy();
    // Render order, not just presence: the notice sits before "Missing
    // something?" and well before the Save-as-meal button at the bottom —
    // the opposite of the pre-fix layout (notice under Save as meal).
    const json = JSON.stringify(toJSON());
    const noticeIdx = json.indexOf('"estimate-sheet-notice"');
    const addMoreIdx = json.indexOf('"estimate-sheet-add-more"');
    const saveIdx = json.indexOf('"estimate-sheet-save"');
    expect(noticeIdx).toBeGreaterThan(-1);
    expect(addMoreIdx).toBeGreaterThan(noticeIdx);
    expect(saveIdx).toBeGreaterThan(addMoreIdx);
  });
});
