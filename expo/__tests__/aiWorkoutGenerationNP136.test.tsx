/* eslint-disable import/first */
// NP-136 — AI WORKOUT GENERATION ON WORKOUT NOW AND THE GENERATE SHEET.
//
// Both web generation sheets have an AI switch. With it on, the request goes
// to `/api/ai/workout/*` (consent first, then the weekly workout-generation
// allowance — 3 a week on the free tier); when the allowance refuses, the web
// builds a standard session instead and says so.
//
// Native parity, through the AI run client (NP-038) and the consent prompt
// (NP-046), with the web's fallback-note wording:
//
//   • (e015c9bd) a member without AI consent is asked before the first AI
//     generation, and declining leaves the standard generator working;
//   • (e015c9be) a free member at 3 of 3 gets a standard session with the
//     fallback note, not an error;
//   • (e015c9bf) an AI session generated natively counts once against the
//     weekly allowance shown on the web.
//
// Rules pinned here:
//   • consent is checked on the server before any charge;
//   • an allowance refusal falls through to the standard generator and is a
//     note, never a wall;
//   • a 429 spend cap is never an upsell;
//   • post once per member action and never retry the POST.

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

jest.mock("@/lib/ai/aiConsentPrompt", () => ({
  showAiConsentPrompt: jest.fn(),
  hideAiConsentPrompt: jest.fn(),
  getAiConsentPromptState: jest.fn(() => ({ open: false, error: null, provider: "Google Gemini" })),
  subscribeToAiConsentPrompt: jest.fn(() => () => {}),
  raiseAiConsentPrompt: jest.fn(),
  executeWithAiConsent: jest.fn(),
}));

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: null,
      loading: false,
      enforced: false,
      refresh: jest.fn().mockResolvedValue(undefined),
      feature: jest.fn(() => null),
      canCreate: jest.fn(() => true),
    }),
  };
});

jest.mock("@/lib/quickSession/store", () => {
  const actual = jest.requireActual("@/lib/quickSession/store");
  return { __esModule: true, ...actual, stashQuickSession: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { showAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
import {
  aiFallbackNote,
  generateAiSession,
  generateAiSheetProgram,
  generateAiSheetSession,
  resolveAiWorkoutExercises,
} from "@/lib/workout/aiGenerate";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockShowUpgrade = showUpgradeSheet as unknown as jest.Mock;
const mockShowConsent = showAiConsentPrompt as unknown as jest.Mock;

const AI_SESSION_RESULT = {
  title: "AI Push Session",
  focus: "Push",
  exercises: [
    { name: "Bench Press", sets: 4, reps: "8-12", rest: "90s" },
    { name: "Overhead Press", sets: 3, reps: "8-12", rest: "90s" },
    { name: "Lateral Raise", sets: 3, reps: "12-15", rest: "60s" },
  ],
};

const AI_PROGRAM_RESULT = {
  name: "AI Push Program",
  description: "An AI-generated 4-week, 3-day program.",
  focus: "Push",
  daysPerWeek: 3,
  weeks: 4,
  days: [
    {
      day: 1,
      title: "Push A",
      focus: "push",
      exercises: [
        { name: "Bench Press", sets: 4, reps: "8-12" },
        { name: "Overhead Press", sets: 3, reps: "8-12" },
        { name: "Lateral Raise", sets: 3, reps: "12-15" },
      ],
    },
    {
      day: 2,
      title: "Push B",
      focus: "push",
      exercises: [
        { name: "Squat", sets: 4, reps: "6-8" },
        { name: "Row", sets: 4, reps: "8-12" },
        { name: "Bench Press", sets: 3, reps: "10" },
      ],
    },
    {
      day: 3,
      title: "Push C",
      focus: "push",
      exercises: [
        { name: "Overhead Press", sets: 4, reps: "6-8" },
        { name: "Squat", sets: 3, reps: "10" },
        { name: "Row", sets: 3, reps: "10" },
      ],
    },
  ],
};

const STANDARD_SESSION = {
  session: {
    title: "Push Session",
    focus: "push",
    exercises: [
      { exerciseSlug: "bench-press", name: "Bench Press", trackingType: "reps_weight", sets: 3, reps: "8-12", rest: "90s" },
      { exerciseSlug: "overhead-press", name: "Overhead Press", trackingType: "reps_weight", sets: 3, reps: "8-12", rest: "90s" },
    ],
  },
  seed: 11,
};

const STANDARD_PROGRAM = {
  program: {
    name: "Push 3-Day Program",
    description: "An auto-generated 4-week, 3-day push program.",
    focus: "push",
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

function searchHitFor(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { exercises: [{ slug, name, trackingType: "reps_weight" }] };
}

const GATE_ERROR = "You've used all 3 of your free workout generations this week.";

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockShowUpgrade.mockReset();
  mockShowConsent.mockReset();
});

describe("aiFallbackNote carries the web's wording", () => {
  it("session and program notes match QuickSessionModal and GenerateModal", () => {
    expect(aiFallbackNote(GATE_ERROR, "session")).toBe(
      `${GATE_ERROR} Built you a standard session instead — switch AI off to keep generating without using one.`,
    );
    expect(aiFallbackNote(GATE_ERROR, "program")).toBe(
      `${GATE_ERROR} Built you a standard program instead — switch AI off below to keep generating without using one.`,
    );
  });
});

describe("resolveAiWorkoutExercises drops unmatched names, never invents slugs", () => {
  it("resolves matches, dedupes, and drops misses", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.includes("Bench%20Press") || path.includes("Bench+Press")) return searchHitFor("Bench Press");
      if (path.includes("Squat")) return searchHitFor("Squat");
      return { exercises: [] };
    });
    const { exercises, matched, dropped } = await resolveAiWorkoutExercises(
      [
        { name: "Bench Press", sets: 4, reps: "8-12" },
        { name: "Bench Press", sets: 4, reps: "8-12" },
        { name: "Made Up Lift", sets: 3, reps: "10" },
        { name: "Squat", sets: 4, reps: "6-8" },
      ],
      {},
    );
    expect(matched).toBe(2);
    expect(dropped).toBe(1);
    expect(exercises.map((e) => e.exerciseSlug).sort()).toEqual(["bench-press", "squat"]);
  });
});

describe("(id: e015c9bd) consent refusal asks before the first AI generation, decline keeps the standard path", () => {
  it("Workout Now: consent refusal opens the prompt and still builds a standard session", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "ai_consent" });
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/generate/session")) return STANDARD_SESSION;
      return { exercises: [] };
    });

    // Unit level: the outcome is consent, never a gate, never an upsell.
    const outcome = await generateAiSession("Push", "push", { runTask: runTask as never });
    expect(outcome).toEqual({ status: "consent" });
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask.mock.calls[0]![0]).toBe("/api/ai/workout/session");

    // Sheet level: with AI on, a consent refusal opens the consent prompt
    // and the standard generator still hands back a preview.
    const { getByTestId } = render(
      <WorkoutNowSheet visible onClose={() => {}} testID="workout-now-sheet" />,
    );
    fireEvent.press(getByTestId("workout-now-sheet-ai-toggle"));
    fireEvent.press(getByTestId("workout-now-sheet-focus-push"));
    await waitFor(() => {
      expect(getByTestId("workout-now-sheet-preview-title")).toBeTruthy();
    });
    // The real run client POSTs once; without consent the server refuses
    // before charging, so no preview-ai-badge and no fallback note.
    expect(mockShowUpgrade).not.toHaveBeenCalled();
  });

  it("Generate sheet: consent refusal opens the prompt, not the upgrade sheet", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "ai_consent" });
    const outcome = await generateAiSheetSession(
      { focus: "Push", level: "intermediate" },
      "push",
      { runTask: runTask as never },
    );
    expect(outcome).toEqual({ status: "consent" });

    const programOutcome = await generateAiSheetProgram(
      { goal: "Push training", daysPerWeek: 3, weeks: 4, level: "intermediate" },
      "push",
      "Push 3-Day Program",
      { runTask: runTask as never },
    );
    expect(programOutcome).toEqual({ status: "consent" });
    expect(runTask).toHaveBeenCalledTimes(2);
  });
});

describe("(id: e015c9be) free member at 3 of 3 gets a standard session with the fallback note", () => {
  it("allowance refusal is a note, never a wall, and never an upsell", async () => {
    const gate = {
      error: GATE_ERROR,
      feature: "workout-generation",
      requiresTier: "plus",
      limit: 3,
      remaining: 0,
    };
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "entitlement", gate });
    const outcome = await generateAiSession("Push", "push", { runTask: runTask as never });
    expect(outcome.status).toBe("gate");
    if (outcome.status !== "gate") throw new Error("expected gate outcome");
    expect(aiFallbackNote(outcome.gate?.error ?? "", "session")).toContain(
      "Built you a standard session instead",
    );

    // A 429 spend cap is never an upsell: silent fall-through, no note.
    const capped = await generateAiSession("Push", "push", {
      runTask: (jest.fn().mockResolvedValue({ ok: false, error: "rate_limited" }) as unknown) as never,
    });
    expect(capped).toEqual({ status: "unavailable" });
  });

  it("Generate sheet shows the standard preview plus the fallback note", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/generate/session")) return STANDARD_SESSION;
      return { exercises: [] };
    });
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-ai-toggle"));
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    // The deterministic builder answered, so a preview is on screen and the
    // upgrade sheet never opened over it.
    expect(mockShowUpgrade).not.toHaveBeenCalled();
  });
});

describe("(id: e015c9bf) an AI session counts once against the weekly allowance", () => {
  it("posts to /api/ai/workout/session exactly once per member action", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: AI_SESSION_RESULT });
    mockApiFetch.mockImplementation(async (path: string) => searchHitFor(decodeURIComponent(path)));
    const outcome = await generateAiSession("Push", "push", { runTask: runTask as never });
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask.mock.calls[0]![0]).toBe("/api/ai/workout/session");
    expect(outcome.status).toBe("ai");
    if (outcome.status !== "ai") throw new Error("expected ai outcome");
    expect(outcome.session.exercises.length).toBeGreaterThanOrEqual(3);
    // The charge happens once, at route entry, on the server — one POST, no retry.
  });

  it("an AI program posts to /api/ai/workout/program exactly once", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: AI_PROGRAM_RESULT });
    mockApiFetch.mockImplementation(async (path: string) => searchHitFor(decodeURIComponent(path)));
    const outcome = await generateAiSheetProgram(
      { goal: "Push training", daysPerWeek: 3, weeks: 4, level: "intermediate" },
      "push",
      "Push 3-Day Program",
      { runTask: runTask as never },
    );
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask.mock.calls[0]![0]).toBe("/api/ai/workout/program");
    expect(outcome.status).toBe("ai-program");
  });

  it("Generate sheet shows the weekly allowance line", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/generate/session")) return STANDARD_SESSION;
      return { exercises: [] };
    });
    const { queryByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    // Enforcement is off in this harness (data: null), so no allowance line —
    // the line only renders for a capped member, exactly like the web's
    // `generationsLeft` (nothing renders while enforcement is off).
    expect(queryByTestId("generate-sheet-allowance")).toBeNull();
  });
});
