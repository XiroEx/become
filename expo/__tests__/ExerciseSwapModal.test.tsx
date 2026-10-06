import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { ExerciseSwapModal } from "@/components/live/ExerciseSwapModal";
import type { AlternativeCandidate } from "@become/api-client";

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: (...args: any[]) => mockApiFetch(...args),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "mock-token",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

const alts: AlternativeCandidate[] = [
  {
    slug: "db-press",
    name: "DB Bench Press",
    score: 85,
    reasons: ["Same movement pattern"],
    equipment: ["dumbbell"],
    primaryMuscles: ["chest", "triceps"],
    movementPatterns: ["horizontal_push"],
    trackingType: "reps_weight",
  },
  {
    slug: "machine-press",
    name: "Machine Chest Press",
    score: 70,
    equipment: ["machine"],
    trackingType: "reps_weight",
  },
];

// 12 candidates spanning equipment/bodyRegion/difficulty/category — enough
// to exercise the "Show more" pagination (4 preview + 8 step) and the filter
// chips (NP-289).
const manyAlts: AlternativeCandidate[] = Array.from({ length: 12 }, (_, i) => ({
  slug: `alt-${i}`,
  name: `Alt Exercise ${i}`,
  score: 50,
  equipment: [i % 2 === 0 ? "dumbbell" : "barbell"],
  bodyRegion: i % 2 === 0 ? "upper_body" : "lower_body",
  difficulty: i % 2 === 0 ? "beginner" : "advanced",
  category: "strength",
  trackingType: "reps_weight",
}));

describe("ExerciseSwapModal", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({});
  });

  it("lists alternatives and fires onSelect with the chosen candidate", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    expect(getByTestId("swap-modal-option-machine-press")).toBeTruthy();
    fireEvent.press(getByTestId("swap-modal-option-db-press"));
    expect(onSelect).toHaveBeenCalledWith(alts[0]);
  });

  it("shows a loading state", () => {
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        alternatives={[]}
        loading
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-loading")).toBeTruthy();
  });

  it("shows an empty state when there are no alternatives", () => {
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        alternatives={[]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-empty")).toBeTruthy();
  });

  it("fires onClose from the cancel button", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        alternatives={alts}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByTestId("swap-modal-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("expands alternative to choose program-wide scope and fires onSwap with 'program'", () => {
    const onSwap = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSwap={onSwap}
        onClose={() => {}}
      />,
    );
    // Expand details
    fireEvent.press(getByTestId("swap-modal-option-db-press-expand"));
    expect(getByTestId("swap-modal-option-db-press-program")).toBeTruthy();
    expect(getByTestId("swap-modal-option-db-press-session")).toBeTruthy();

    fireEvent.press(getByTestId("swap-modal-option-db-press-program"));
    expect(onSwap).toHaveBeenCalledWith(alts[0], "program");
  });

  it("expands alternative to choose session scope and fires onSwap with 'session'", () => {
    const onSwap = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSwap={onSwap}
        onClose={() => {}}
      />,
    );
    fireEvent.press(getByTestId("swap-modal-option-db-press-expand"));
    fireEvent.press(getByTestId("swap-modal-option-db-press-session"));
    expect(onSwap).toHaveBeenCalledWith(alts[0], "session");
  });

  it("hides program scope button when sessionScopeOnly is true", () => {
    const onSwap = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        sessionScopeOnly
        onSwap={onSwap}
        onClose={() => {}}
      />,
    );
    fireEvent.press(getByTestId("swap-modal-option-db-press-expand"));
    expect(queryByTestId("swap-modal-option-db-press-program")).toBeNull();
    expect(getByTestId("swap-modal-option-db-press-swap")).toBeTruthy();
    fireEvent.press(getByTestId("swap-modal-option-db-press-swap"));
    expect(onSwap).toHaveBeenCalledWith(alts[0], "session");
  });

  it("loads and allows selecting equipment variations", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/api/exercises/variations")) {
        return Promise.resolve({
          sourceSlug: "db-press",
          variations: [
            { slug: "db-press", name: "DB Bench Press", equipment: ["dumbbell"], laterality: "bilateral" },
            { slug: "incline-db-press", name: "Incline DB Bench Press", equipment: ["dumbbell"], laterality: "bilateral" },
          ],
        });
      }
      return Promise.resolve({});
    });

    const onSwap = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSwap={onSwap}
        onClose={() => {}}
      />,
    );

    // Expand
    await act(async () => {
      fireEvent.press(getByTestId("swap-modal-option-db-press-expand"));
    });

    await waitFor(() => {
      expect(getByTestId("swap-modal-option-db-press-var-incline-db-press")).toBeTruthy();
    });

    // Select variation
    fireEvent.press(getByTestId("swap-modal-option-db-press-var-incline-db-press"));

    // Tap swap program
    fireEvent.press(getByTestId("swap-modal-option-db-press-program"));
    expect(onSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "incline-db-press",
        name: "Incline DB Bench Press",
      }),
      "program",
    );
  });

  it("loads custom exercises and allows using them directly", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/api/exercises/custom")) {
        return Promise.resolve({
          exercises: [
            {
              slug: "my-custom-pushup",
              name: "My Custom Pushup",
              trackingType: "reps_only",
              category: "strength",
              bodyRegion: "upper_body",
              primaryMuscles: ["chest"],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    const onSwap = jest.fn();
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSwap={onSwap}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("swap-modal-custom-my-custom-pushup")).toBeTruthy();
    });

    fireEvent.press(getByTestId("swap-modal-custom-my-custom-pushup-swap"));
    expect(onSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "my-custom-pushup",
        name: "My Custom Pushup",
        isCustom: true,
      }),
      "session",
    );
  });

  // NP-289 — web parity: title, filters, result count, Show more.
  it("shows the web's title and subtitle", () => {
    const { getByText } = render(
      <ExerciseSwapModal
        visible
        sourceName="Jumping Jacks"
        alternatives={alts}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByText("Swap Exercise")).toBeTruthy();
    expect(getByText("Replace Jumping Jacks")).toBeTruthy();
  });

  it("shows a result count that tracks the filtered list", () => {
    const { getByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Jumping Jacks"
        alternatives={alts}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-result-count").props.children).toEqual([
      2,
      " result",
      "s",
    ]);
  });

  it("filters results by equipment via the Filters chips", () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Jumping Jacks"
        alternatives={alts}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.press(getByTestId("swap-modal-filters-toggle"));
    fireEvent.press(getByText("Dumbbell"));
    expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    expect(queryByTestId("swap-modal-option-machine-press")).toBeNull();
    expect(getByTestId("swap-modal-result-count").props.children).toEqual([
      1,
      " result",
      "",
    ]);

    fireEvent.press(getByTestId("swap-modal-filters-clear"));
    expect(getByTestId("swap-modal-option-machine-press")).toBeTruthy();
  });

  it("shows a paginated results list with Show more, mirroring the web's CollapsibleSection", () => {
    const { getByTestId, getByLabelText, queryByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Jumping Jacks"
        alternatives={manyAlts}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    // Preview count is 4.
    expect(getByTestId("swap-modal-option-alt-0")).toBeTruthy();
    expect(getByTestId("swap-modal-option-alt-3")).toBeTruthy();
    expect(queryByTestId("swap-modal-option-alt-4")).toBeNull();
    expect(getByLabelText("Show 8 more")).toBeTruthy();

    fireEvent.press(getByTestId("swap-modal-show-more"));

    // Step is 8, so all 12 are now visible and the button disappears.
    expect(getByTestId("swap-modal-option-alt-11")).toBeTruthy();
    expect(queryByTestId("swap-modal-show-more")).toBeNull();
  });
});
