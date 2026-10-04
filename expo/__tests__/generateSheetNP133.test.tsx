/* eslint-disable import/first */
// NP-133 — GENERATE SHEET: SESSION OR PROGRAM FROM THE STANDARD GENERATOR.
//
// Native port of `webapp/components/GenerateModal.tsx` without the AI switch
// (NP-136 adds it): both modes, preview, Regenerate, Start (through the
// NP-227 overview) and Save as program with the refusal classifier (NP-010)
// and the upgrade sheet (NP-052).
//
// Rules pinned here:
//   • (e015c9ab) session + four-week program generate natively without AI and
//     match the web's options (focus/difficulty/equipment + counts);
//   • (e015c9ac) saving at the custom-programs cap raises the upgrade sheet;
//     below the cap the program is created (POST /api/programs/custom);
//   • (e015c9ad) a generated session starts through the quick-session
//     overview (stash with needsName + quickSessionOverviewHref push).

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
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

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: jest.fn(() => null),
  subscribeToUpgradeSheet: jest.fn(() => () => {}),
}));

jest.mock("@/lib/quickSession/store", () => {
  const actual = jest.requireActual("@/lib/quickSession/store");
  return { __esModule: true, ...actual, stashQuickSession: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import {
  quickSessionOverviewHref,
  stashQuickSession,
} from "@/lib/quickSession/store";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
import {
  draftProgramToProgramBody,
  programRequestBody,
  sessionRequestBody,
} from "@/lib/programs/generate";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockShowUpgrade = showUpgradeSheet as unknown as jest.Mock;
const mockStash = stashQuickSession as unknown as jest.Mock;

const SESSION_RESPONSE = {
  session: {
    title: "Full Body Session",
    focus: "full_body",
    exercises: [
      { exerciseSlug: "squat", name: "Squat", trackingType: "reps_weight", sets: 4, reps: "6-8", rest: "90s" },
      { exerciseSlug: "bench-press", name: "Bench Press", trackingType: "reps_weight", sets: 4, reps: "6-8", rest: "90s" },
    ],
  },
  seed: 7,
};

const PROGRAM_RESPONSE = {
  program: {
    name: "Full Body 3-Day Program",
    description: "An auto-generated 4-week, 3-day full body program.",
    focus: "full_body",
    daysPerWeek: 3,
    weeks: 4,
    days: [
      {
        day: "Day 1",
        title: "Push",
        focus: "push",
        exercises: [
          { exerciseSlug: "bench-press", name: "Bench Press", trackingType: "reps_weight", sets: 4, reps: "6-8", rest: "90s" },
        ],
      },
      {
        day: "Day 2",
        title: "Pull",
        focus: "pull",
        exercises: [
          { exerciseSlug: "row", name: "Row", trackingType: "reps_weight", sets: 4, reps: "8-12", rest: "90s" },
        ],
      },
      {
        day: "Day 3",
        title: "Legs",
        focus: "legs",
        exercises: [
          { exerciseSlug: "squat", name: "Squat", trackingType: "reps_weight", sets: 4, reps: "6-8", rest: "90s" },
        ],
      },
    ],
  },
  seed: 9,
};

function gate403(feature = "custom-programs") {
  const { ApiError } = jest.requireActual("@become/api-client");
  return new ApiError(403, {
    error: "You have used all 3 of your free custom programs.",
    feature,
    requiresTier: "plus",
    limit: 3,
    remaining: 0,
  });
}

function plain403() {
  const { ApiError } = jest.requireActual("@become/api-client");
  return new ApiError(403, { error: "Not yours." });
}

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockShowUpgrade.mockReset();
  mockStash.mockReset();
  mockStash.mockResolvedValue("qs-123");
});

describe("(id: e015c9ab) session and four-week program generate without AI and match the web options", () => {
  it("posts the web's session body and previews the session", async () => {
    mockApiFetch.mockResolvedValue(SESSION_RESPONSE);
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/generate/session",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: sessionRequestBody({
          focus: "full_body",
          difficulty: "intermediate",
          equipment: [],
          exerciseCount: 5,
          includeCardio: false,
        }),
      }),
    );
    expect(getByTestId("generate-sheet-session-title").props.children).toBe(
      "Full Body Session",
    );
  });

  it("carries the web's session options (focus, difficulty, equipment, count, cardio)", async () => {
    mockApiFetch.mockResolvedValue(SESSION_RESPONSE);
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-focus-push"));
    fireEvent.press(getByTestId("generate-sheet-difficulty-advanced"));
    fireEvent.press(getByTestId("generate-sheet-equipment-dumbbell"));
    fireEvent.press(getByTestId("generate-sheet-exercise-count-increment"));
    fireEvent.press(getByTestId("generate-sheet-cardio"));
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/generate/session",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: sessionRequestBody({
          focus: "push",
          difficulty: "advanced",
          equipment: ["dumbbell"],
          exerciseCount: 6,
          includeCardio: true,
        }),
      }),
    );
  });

  it("posts the web's program body for a four-week program and previews the days", async () => {
    mockApiFetch.mockResolvedValue(PROGRAM_RESPONSE);
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-tab-program"));
    // Weeks default to 4 — the web's default — and match the acceptance shape.
    expect(getByTestId("generate-sheet-weeks-value").props.children).toBe(4);
    fireEvent.press(getByTestId("generate-sheet-generate-program"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-program-preview")).toBeTruthy();
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/generate/program",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: programRequestBody({
          focus: "full_body",
          difficulty: "intermediate",
          equipment: [],
          daysPerWeek: 3,
          weeks: 4,
          exercisesPerDay: 5,
        }),
      }),
    );
    expect(getByTestId("generate-sheet-program-name").props.children).toBe(
      "Full Body 3-Day Program",
    );
    expect(getByTestId("generate-sheet-program-day-0")).toBeTruthy();
  });

  it("regenerates the session preview on Regenerate", async () => {
    mockApiFetch.mockResolvedValue(SESSION_RESPONSE);
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    fireEvent.press(getByTestId("generate-sheet-session-regenerate"));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("a 403 without feature/requiresTier on generate is an ordinary error, never the sheet", async () => {
    mockApiFetch.mockRejectedValue(plain403());
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-error")).toBeTruthy();
    });
    expect(mockShowUpgrade).not.toHaveBeenCalled();
  });
});

describe("(id: e015c9ac) saving a generated program honours the custom-programs cap", () => {
  it("below the cap it POSTs the converted body and lands on the program screen", async () => {
    mockApiFetch
      .mockResolvedValueOnce(PROGRAM_RESPONSE)
      .mockResolvedValueOnce({ program_id: "custom-new", name: "Full Body 3-Day Program" });
    const onClose = jest.fn();
    const { getByTestId } = render(<GenerateSheet visible onClose={onClose} />);
    fireEvent.press(getByTestId("generate-sheet-tab-program"));
    fireEvent.press(getByTestId("generate-sheet-generate-program"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-program-preview")).toBeTruthy();
    });
    fireEvent.press(getByTestId("generate-sheet-program-save"));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/programs/custom",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: draftProgramToProgramBody(PROGRAM_RESPONSE.program, "intermediate"),
        }),
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/custom-new");
    expect(mockShowUpgrade).not.toHaveBeenCalled();
  });

  it("at the cap a 403 gate raises the upgrade sheet, not an error line", async () => {
    mockApiFetch
      .mockResolvedValueOnce(PROGRAM_RESPONSE)
      .mockRejectedValueOnce(gate403());
    const { getByTestId, queryByTestId } = render(
      <GenerateSheet visible onClose={() => {}} />,
    );
    fireEvent.press(getByTestId("generate-sheet-tab-program"));
    fireEvent.press(getByTestId("generate-sheet-generate-program"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-program-preview")).toBeTruthy();
    });
    fireEvent.press(getByTestId("generate-sheet-program-save"));
    await waitFor(() => {
      expect(mockShowUpgrade).toHaveBeenCalled();
    });
    expect(queryByTestId("generate-sheet-error")).toBeNull();
  });
});

describe("(id: e015c9ad) a generated session starts through the quick-session overview", () => {
  it("stashes with needsName and pushes the overview href", async () => {
    mockApiFetch.mockResolvedValue(SESSION_RESPONSE);
    const onClose = jest.fn();
    const { getByTestId } = render(<GenerateSheet visible onClose={onClose} />);
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    fireEvent.press(getByTestId("generate-sheet-session-start"));
    await waitFor(() => {
      expect(mockStash).toHaveBeenCalledWith(
        {
          title: "Full Body Session",
          focus: "full_body",
          exercises: SESSION_RESPONSE.session.exercises,
        },
        { needsName: true },
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(quickSessionOverviewHref("qs-123"));
  });
});
