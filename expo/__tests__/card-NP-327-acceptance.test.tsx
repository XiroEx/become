import { act, render } from "@testing-library/react-native";

// Acceptance tests for card NP-327: Workout tab — Continue Training heading
// shrinking to "..." behind a stale grey skeleton on Android, and the
// Saved for Later / Recommended for You / Browse Programs section order
// (and card styling) still differing from web.
//
// The animate-pulse → real-content style bleed itself is an Android-only
// NativeWind/Reanimated host-node-reuse symptom that this jsdom/react-test-
// renderer environment cannot reproduce; the fix (an explicit, distinct
// `key` on each loading/empty/loaded branch's root element, so React
// unmounts the skeleton instead of patching props onto it) is verified by
// reading the source (ContinueTrainingSection.tsx, UpcomingWeekStrip.tsx,
// WorkoutNowSheet.tsx). These tests cover everything that IS observable
// here: mutually-exclusive loading/loaded branches, the web-parity section
// order, the Recommended card count/layout, dropping the accent from
// Browse cards, and the Saved row no longer carrying an extra horizontal
// inset.

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockToken = "test-jwt-token";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
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

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import ProgramsBrowseRoute from "../app/(app)/(tabs)/programming/browse";
import { ProgramsList } from "@/components/programs/ProgramsList";
import { SavedPrograms } from "@/components/programs/SavedPrograms";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const RECOMMENDED_PROGRAMS = [1, 2, 3, 4, 5].map((n) => ({
  program_id: `prog-rec-${n}`,
  name: `Muscle Builder ${n}`,
  description: "Gain muscle program",
  duration_weeks: 8,
  training_days_per_week: 4,
  target_user: "Intermediate",
  goal: "gain_muscle",
  tags: ["muscle", "hypertrophy"],
}));

/** Depth-first testID order out of a renderer's `toJSON()` host tree. */
function testIdOrder(json: unknown, wanted: Set<string>, out: string[] = []): string[] {
  if (!json) return out;
  const nodes = Array.isArray(json) ? json : [json];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as { props?: { testID?: string }; children?: unknown };
    const testID = n.props?.testID;
    if (testID && wanted.has(testID)) out.push(testID);
    testIdOrder(n.children, wanted, out);
  }
  return out;
}

describe("NP-327: Workout tab section order & styling", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();

    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      const method = (init as { method?: string } | undefined)?.method ?? "GET";

      if (url.startsWith("/api/programs/search")) {
        return Promise.resolve({
          programs: RECOMMENDED_PROGRAMS,
          pagination: { page: 1, limit: 20, total: 5, hasMore: false },
          availableTags: ["muscle", "hypertrophy"],
        });
      }

      if (url === "/api/programs/saved") {
        if (method === "POST") return Promise.resolve({ success: true, message: "Saved" });
        if (method === "DELETE") return Promise.resolve({ success: true, message: "Unsaved" });
        if (method === "PATCH") return Promise.resolve({ success: true, message: "Reordered" });
        return Promise.resolve({
          savedPrograms: [
            {
              program_id: "prog-saved-1",
              name: "Saved Favorite",
              description: "A previously saved program",
              duration_weeks: 6,
              training_days_per_week: 3,
              order: 0,
            },
          ],
        });
      }

      if (url === "/api/profile") {
        return Promise.resolve({
          profile: { fitnessGoal: "gain_muscle", experienceLevel: "intermediate" },
        });
      }

      return Promise.resolve({});
    });
  });

  it("renders Saved for Later, then Recommended for You, then Browse Programs — matching the web's WorkoutClient.tsx order", async () => {
    const { findByTestId, toJSON } = render(<ProgramsBrowseRoute />);

    await findByTestId("programming-browse-saved-section");
    await findByTestId("programming-browse-recommended");
    await findByTestId("programming-browse-heading-row");

    // Regression guard for NP-327 item 3: native used to put the Browse
    // heading + search above Saved for Later and show Recommended as a
    // horizontal carousel above Browse.
    const order = testIdOrder(
      toJSON(),
      new Set([
        "programming-browse-saved-section",
        "programming-browse-recommended",
        "programming-browse-heading-row",
      ]),
    );
    expect(order).toEqual([
      "programming-browse-saved-section",
      "programming-browse-recommended",
      "programming-browse-heading-row",
    ]);
  });

  it("caps Recommended for You at 3 vertical full-width cards, not a 5-wide horizontal carousel", async () => {
    const { findByTestId, queryByTestId } = render(<ProgramsBrowseRoute />);

    await findByTestId("programming-browse-recommended");

    expect(queryByTestId("browse-recommended-item-prog-rec-1")).toBeTruthy();
    expect(queryByTestId("browse-recommended-item-prog-rec-2")).toBeTruthy();
    expect(queryByTestId("browse-recommended-item-prog-rec-3")).toBeTruthy();
    // The web's WorkoutClient.tsx shows `recommendedPrograms.slice(0, 3)`;
    // native used to show 5 in a horizontal ScrollView.
    expect(queryByTestId("browse-recommended-item-prog-rec-4")).toBeNull();
    expect(queryByTestId("browse-recommended-item-prog-rec-5")).toBeNull();
  });
});

describe("NP-327: Browse/search cards drop the green accent web only puts on Recommended", () => {
  it("ProgramsList cards have a plain border, no left accent stripe", () => {
    const programs = [
      {
        id: "p1",
        name: "Plain Card Program",
        description: "desc",
        durationWeeks: 4,
        trainingDaysPerWeek: 3,
      },
    ];
    const { getByTestId } = render(<ProgramsList programs={programs} />);
    // Three host-element ancestors up from the item's inner Pressable
    // (Pressable's own View wrapper → Pressable → card container) is the
    // card that carries the border styling.
    const card = getByTestId("programs-list-item-p1").parent?.parent?.parent;
    expect(card).toBeTruthy();
    const style = card!.props.style as Record<string, unknown>;
    expect(style.borderLeftWidth).toBeUndefined();
    expect(style.borderLeftColor).toBeUndefined();
    expect(style.borderWidth).toBe(1);
  });
});

describe("NP-327: Saved for Later is full width, not inset vs. the cards around it", () => {
  it("SavedPrograms' wrapper has no horizontal padding", () => {
    const programs = [{ id: "s1", name: "Saved One", description: "desc" }];
    const { getByTestId } = render(<SavedPrograms programs={programs} />);
    const wrapper = getByTestId("saved-programs");
    const style = wrapper.props.style as Record<string, unknown>;
    expect(style.padding).toBeUndefined();
    expect(style.paddingHorizontal).toBeUndefined();
  });
});

describe("NP-327: ContinueTrainingSection loading/loaded branches are mutually exclusive", () => {
  it("never shows the loading skeleton and the loaded section at the same time", async () => {
    let resolvePrograms!: (value: { activePrograms: unknown[] }) => void;
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePrograms = resolve;
        }),
    );

    const { getByTestId, queryByTestId, findByTestId } = render(
      <ContinueTrainingSection />,
    );

    expect(getByTestId("continue-training-section-loading")).toBeTruthy();
    expect(queryByTestId("continue-training-section")).toBeNull();

    await act(async () => {
      resolvePrograms({
        activePrograms: [
          {
            programId: "prog-1",
            programName: "Strength & Size",
            status: "active",
            currentPhase: 1,
            currentDay: "Day 2",
            progress: 50,
            completedWorkouts: 8,
            totalWorkouts: 16,
          },
        ],
      });
    });

    await findByTestId("continue-training-section");
    // The loading skeleton's testID must be gone — on Android this is the
    // branch whose host node React used to reuse, keeping the "..."
    // heading / grey h-28 block behind the real content (NP-327).
    expect(queryByTestId("continue-training-section-loading")).toBeNull();
  });
});
