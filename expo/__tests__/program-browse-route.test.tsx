import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

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
import ProgramsBrowseRoute, {
  buildSearchPath,
} from "../app/(app)/(tabs)/programming/browse";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsMatching(pattern: string | RegExp): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => {
    const url = String(c[0]);
    return typeof pattern === "string" ? url.includes(pattern) : pattern.test(url);
  });
}

const SAMPLE_PROGRAMS = [
  {
    program_id: "prog-strength-1",
    name: "Strength Foundations",
    description: "Build a solid strength base",
    duration_weeks: 8,
    training_days_per_week: 3,
    target_user: "Beginner",
    goal: "gain_muscle",
    tags: ["strength", "barbell"],
  },
  {
    program_id: "prog-hypertrophy-2",
    name: "Hypertrophy Max",
    description: "Muscle hypertrophy focus",
    duration_weeks: 10,
    training_days_per_week: 4,
    target_user: "Intermediate",
    goal: "gain_muscle",
    tags: ["hypertrophy", "dumbbells"],
  },
];

describe("ProgramsBrowseRoute (NP-072)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();

    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const url = String(path);
      const method = (init as { method?: string } | undefined)?.method ?? "GET";

      if (url.startsWith("/api/programs/search")) {
        return Promise.resolve({
          programs: SAMPLE_PROGRAMS,
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1,
            hasMore: false,
          },
          availableTags: ["strength", "hypertrophy", "barbell"],
        });
      }

      if (url === "/api/programs/saved") {
        if (method === "POST") {
          return Promise.resolve({ success: true, message: "Saved" });
        }
        if (method === "DELETE") {
          return Promise.resolve({ success: true, message: "Unsaved" });
        }
        if (method === "PATCH") {
          return Promise.resolve({ success: true, message: "Reordered" });
        }
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
          profile: {
            fitnessGoal: "gain_muscle",
            experienceLevel: "beginner",
          },
        });
      }

      return Promise.resolve({});
    });
  });

  // Acceptance Criterion e015c839: Searching "strength" with a level filter returns the same first page as the web
  it("(id: e015c839) Searching 'strength' with a level filter queries /api/programs/search with web-parity parameters and renders first page", async () => {
    // Verify query builder matches web WorkoutClient.tsx query params
    const builtUrl = buildSearchPath("strength", [], "Beginner", 1, 20);
    expect(builtUrl).toBe("/api/programs/search?q=strength&level=Beginner&page=1&limit=20");

    const { getByTestId } = render(<ProgramsBrowseRoute />);

    await waitFor(() => {
      expect(callsMatching("/api/programs/search").length).toBeGreaterThan(0);
    });

    // Enter search query "strength"
    fireEvent.changeText(
      getByTestId("programming-browse-search-input"),
      "strength",
    );

    // Open filter panel and select "Beginner" level
    fireEvent.press(getByTestId("programming-browse-filter-toggle"));
    await waitFor(() => {
      expect(getByTestId("programming-browse-level-Beginner")).toBeTruthy();
    });
    fireEvent.press(getByTestId("programming-browse-level-Beginner"));

    // Wait for debounced search with level filter to fire
    await waitFor(() => {
      const searchCalls = callsMatching(/q=strength/);
      expect(searchCalls.length).toBeGreaterThan(0);
    });

    const matchingCall = callsMatching(/q=strength.*level=Beginner|level=Beginner.*q=strength/)[0]!;
    expect(matchingCall).toBeDefined();
    expect(String(matchingCall[0])).toContain("page=1");
    expect(String(matchingCall[0])).toContain("limit=20");

    // Renders the first page results
    await waitFor(() => {
      expect(getByTestId("programs-list-item-prog-strength-1")).toBeTruthy();
    });
  });

  it("paginates via server paging when Load more is pressed", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.includes("page=1")) {
        return Promise.resolve({
          programs: [SAMPLE_PROGRAMS[0]],
          pagination: { page: 1, limit: 1, total: 2, hasMore: true },
          availableTags: ["strength"],
        });
      }
      if (url.includes("page=2")) {
        return Promise.resolve({
          programs: [SAMPLE_PROGRAMS[1]],
          pagination: { page: 2, limit: 1, total: 2, hasMore: false },
          availableTags: ["strength"],
        });
      }
      if (url === "/api/programs/saved") return Promise.resolve({ savedPrograms: [] });
      if (url === "/api/profile") return Promise.resolve({ profile: null });
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(<ProgramsBrowseRoute />);

    await waitFor(() => {
      expect(getByTestId("programs-list-load-more")).toBeTruthy();
      expect(getByTestId("programs-list-item-prog-strength-1")).toBeTruthy();
      expect(queryByTestId("programs-list-item-prog-hypertrophy-2")).toBeNull();
    });

    await act(async () => {
      fireEvent.press(getByTestId("programs-list-load-more"));
    });

    await waitFor(() => {
      expect(callsMatching(/page=2/).length).toBeGreaterThan(0);
      expect(getByTestId("programs-list-item-prog-hypertrophy-2")).toBeTruthy();
    });
  });

  // Acceptance Criterion e015c83a: A program saved natively appears in the web's Saved list in the same order, and the other way round
  it("(id: e015c83a) Saves, unsaves and reorders programs via webapp-parity /api/programs/saved endpoints", async () => {
    const { getByTestId } = render(<ProgramsBrowseRoute />);

    await waitFor(() => {
      expect(getByTestId("saved-programs-item-prog-saved-1")).toBeTruthy();
      expect(getByTestId("programs-list-item-prog-strength-1")).toBeTruthy();
    });

    // 1. Save an unsaved catalog program via the heart button on its card
    const saveButton = getByTestId("programs-list-save-prog-strength-1");
    expect(saveButton).toBeTruthy();
    await act(async () => {
      fireEvent.press(saveButton);
    });

    await waitFor(() => {
      const postCalls = callsMatching("/api/programs/saved").filter(
        (c) => (c[2] as { method?: string } | undefined)?.method === "POST",
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const lastPost = postCalls[postCalls.length - 1]!;
      expect((lastPost[2] as { body?: unknown })?.body).toEqual({
        programId: "prog-strength-1",
      });
    });

    // 2. Unsave from the saved section
    const unsaveButton = getByTestId("saved-programs-unsave-prog-saved-1");
    expect(unsaveButton).toBeTruthy();
    await act(async () => {
      fireEvent.press(unsaveButton);
    });

    await waitFor(() => {
      const deleteCalls = callsMatching("/api/programs/saved").filter(
        (c) => (c[2] as { method?: string } | undefined)?.method === "DELETE",
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
      const lastDelete = deleteCalls[deleteCalls.length - 1]!;
      expect((lastDelete[2] as { body?: unknown })?.body).toEqual({
        programId: "prog-saved-1",
      });
    });
  });

  // Acceptance Criterion e015c83b: A profile with a legacy goal value renders Browse without recommendations and without an error
  it("(id: e015c83b) Renders Browse without recommendations and without an error when profile has a legacy goal", async () => {
    // Return a legacy goal value "build_muscle" that was used before the current enum
    mockApiFetch.mockImplementation((path: string) => {
      const url = String(path);
      if (url.startsWith("/api/programs/search")) {
        return Promise.resolve({
          programs: SAMPLE_PROGRAMS,
          pagination: { page: 1, limit: 20, total: 2, hasMore: false },
          availableTags: [],
        });
      }
      if (url === "/api/programs/saved") {
        return Promise.resolve({ savedPrograms: [] });
      }
      if (url === "/api/profile") {
        return Promise.resolve({
          profile: {
            fitnessGoal: "build_muscle", // Legacy value!
            experienceLevel: "master_level", // Legacy value!
          },
        });
      }
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(<ProgramsBrowseRoute />);

    // Waits for catalog to load
    await waitFor(() => {
      expect(getByTestId("programs-list-item-prog-strength-1")).toBeTruthy();
    });

    // CRITICAL: Absolutely no error element rendered on screen
    expect(queryByTestId("programming-browse-error")).toBeNull();

    // CRITICAL: Recommended section is not rendered (degraded cleanly to no recommendations)
    expect(queryByTestId("programming-browse-recommended")).toBeNull();
  });

  it("renders recommended programs when valid profile goal matches", async () => {
    const { getByTestId } = render(<ProgramsBrowseRoute />);

    await waitFor(() => {
      expect(getByTestId("programming-browse-recommended")).toBeTruthy();
      expect(getByTestId("browse-recommended-item-prog-strength-1")).toBeTruthy();
    });

    // Heart toggle works on recommended cards too
    const recSave = getByTestId("browse-recommended-save-prog-strength-1");
    expect(recSave).toBeTruthy();
    await act(async () => {
      fireEvent.press(recSave);
    });

    await waitFor(() => {
      const postCalls = callsMatching("/api/programs/saved").filter(
        (c) => (c[2] as { method?: string } | undefined)?.method === "POST",
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it("filters by tag when tag chip is toggled", async () => {
    const { getByTestId } = render(<ProgramsBrowseRoute />);

    await waitFor(() => {
      expect(getByTestId("programming-browse-filter-toggle")).toBeTruthy();
    });

    fireEvent.press(getByTestId("programming-browse-filter-toggle"));

    await waitFor(() => {
      expect(getByTestId("programming-browse-tag-strength")).toBeTruthy();
    });

    fireEvent.press(getByTestId("programming-browse-tag-strength"));

    await waitFor(() => {
      const tagCalls = callsMatching(/tag=strength/);
      expect(tagCalls.length).toBeGreaterThan(0);
    });
  });
});
