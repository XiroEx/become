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

  it("shows the web's static title and a dynamic 'Replace <name>' subtitle", () => {
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

  it("shows a live result count and narrows it via an equipment filter", () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={alts}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-result-count")).toBeTruthy();
    expect(getByText("2 results")).toBeTruthy();

    // No filters active yet: no badge, no "Clear all".
    expect(queryByTestId("swap-modal-filters-clear")).toBeNull();

    fireEvent.press(getByTestId("swap-modal-filters-toggle"));
    fireEvent.press(getByTestId("swap-modal-filter-equipment-dumbbell"));

    expect(getByText("1 result")).toBeTruthy();
    expect(getByTestId("swap-modal-filters-clear")).toBeTruthy();
    expect(queryByTestId("swap-modal-option-machine-press")).toBeNull();
    expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();

    // Clear all restores the full list.
    fireEvent.press(getByTestId("swap-modal-filters-clear"));
    expect(getByText("2 results")).toBeTruthy();
  });

  it("previews 4 results and reveals more via 'Show N more (M left)'", () => {
    const many: AlternativeCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      slug: `alt-${i}`,
      name: `Alt ${i}`,
      score: 50,
      equipment: [],
      trackingType: "reps_weight",
    }));
    const { getByTestId, queryByTestId, getByText } = render(
      <ExerciseSwapModal
        visible
        sourceName="Bench"
        alternatives={many}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByTestId("swap-modal-option-alt-0")).toBeTruthy();
    expect(getByTestId("swap-modal-option-alt-3")).toBeTruthy();
    expect(queryByTestId("swap-modal-option-alt-4")).toBeNull();
    expect(getByTestId("swap-modal-show-more")).toBeTruthy();
    expect(getByText(/Show 2 more/)).toBeTruthy();
    expect(getByText(/\(2 left\)/)).toBeTruthy();

    fireEvent.press(getByTestId("swap-modal-show-more"));
    expect(getByTestId("swap-modal-option-alt-4")).toBeTruthy();
    expect(getByTestId("swap-modal-option-alt-5")).toBeTruthy();
    expect(queryByTestId("swap-modal-show-more")).toBeNull();
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

  // Both live routes re-render once a second (the session timer) and hand
  // `workoutExerciseSlugs` down as a fresh array literal. The sheet used to
  // key its fetch effects off that array's IDENTITY, so every tick refetched
  // alternatives and flipped the content back to "Finding alternatives…" —
  // the swap sheet "kept on glitching" and never settled.
  describe("under a parent that re-renders (live screen timer)", () => {
    const urlsFor = (fragment: string) =>
      mockApiFetch.mock.calls.filter(([url]: any[]) =>
        String(url).includes(fragment),
      );

    function Harness({
      slug = "bench-press",
      slugs = ["bench-press", "barbell-row"],
    }: {
      slug?: string;
      slugs?: string[];
    }) {
      return (
        <ExerciseSwapModal
          visible
          sourceName="Bench"
          exerciseSlug={slug}
          // A NEW array identity on every render, exactly as the live routes
          // produced before they memoised it.
          workoutExerciseSlugs={slugs.map((s) => s)}
          onSwap={() => {}}
          onClose={() => {}}
        />
      );
    }

    it("fetches alternatives once and keeps them on screen across re-renders", async () => {
      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes("/api/exercises/alternatives")) {
          return Promise.resolve({ alternatives: alts, total: alts.length });
        }
        return Promise.resolve({ exercises: [] });
      });

      const { rerender, getByTestId, queryByTestId } = render(<Harness />);

      await waitFor(() => {
        expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
      });
      expect(urlsFor("/api/exercises/alternatives")).toHaveLength(1);
      expect(urlsFor("/api/exercises/custom")).toHaveLength(1);

      // Five "timer ticks" worth of parent re-renders.
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          rerender(<Harness />);
        });
      }

      expect(urlsFor("/api/exercises/alternatives")).toHaveLength(1);
      expect(urlsFor("/api/exercises/custom")).toHaveLength(1);
      expect(queryByTestId("swap-modal-loading")).toBeNull();
      expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    });

    it("refreshes in place without flashing the loading state", async () => {
      let calls = 0;
      let resolveSecond: (value: unknown) => void = () => {};
      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes("/api/exercises/alternatives")) {
          calls += 1;
          if (calls === 1) {
            return Promise.resolve({ alternatives: alts, total: alts.length });
          }
          return new Promise((resolve) => {
            resolveSecond = resolve;
          });
        }
        return Promise.resolve({ exercises: [] });
      });

      const { rerender, getByTestId, queryByTestId } = render(
        <Harness slugs={["bench-press"]} />,
      );
      await waitFor(() => {
        expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
      });

      // The workout really changed, so a refetch is right — but the results
      // already on screen must not be replaced by the loading line.
      await act(async () => {
        rerender(<Harness slugs={["bench-press", "barbell-row"]} />);
      });

      expect(calls).toBe(2);
      expect(queryByTestId("swap-modal-loading")).toBeNull();
      expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();

      await act(async () => {
        resolveSecond({ alternatives: alts, total: alts.length });
      });
      expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
    });

    it("drops the previous exercise's alternatives when the target changes", async () => {
      let calls = 0;
      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes("/api/exercises/alternatives")) {
          calls += 1;
          if (calls === 1) {
            return Promise.resolve({ alternatives: alts, total: alts.length });
          }
          return new Promise(() => {});
        }
        return Promise.resolve({ exercises: [] });
      });

      const { rerender, getByTestId, queryByTestId } = render(
        <Harness slug="bench-press" />,
      );
      await waitFor(() => {
        expect(getByTestId("swap-modal-option-db-press")).toBeTruthy();
      });

      await act(async () => {
        rerender(<Harness slug="back-squat" />);
      });

      expect(queryByTestId("swap-modal-option-db-press")).toBeNull();
      expect(getByTestId("swap-modal-loading")).toBeTruthy();
    });

    it("leaves the request to a caller that reports its own loading", async () => {
      mockApiFetch.mockImplementation(() => Promise.resolve({ exercises: [] }));

      const { getByTestId } = render(
        <ExerciseSwapModal
          visible
          sourceName="Bench"
          exerciseSlug="bench-press"
          loading
          onSwap={() => {}}
          onClose={() => {}}
        />,
      );

      await act(async () => {});

      expect(urlsFor("/api/exercises/alternatives")).toHaveLength(0);
      expect(getByTestId("swap-modal-loading")).toBeTruthy();
    });
  });
});
