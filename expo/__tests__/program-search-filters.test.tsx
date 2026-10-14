/* eslint-disable import/first */
import React from "react";
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";

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

import { apiFetch } from "@become/api-client";
import {
  ProgramFilters,
  buildProgramSearchUrl,
  type ProgramSearchFiltersState,
} from "@/components/programs/ProgramFilters";
import ProgramsSearchRoute from "@/app/(app)/(tabs)/programming/search";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsTo(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(path));
}

describe("ProgramSearchQuery URL construction (buildProgramSearchUrl)", () => {
  it("(id: 96d40fb1, 96d40fb5) builds repeated tag= for two tags", () => {
    const url = buildProgramSearchUrl({
      tag: ["Fat Loss", "Strength"],
    });
    expect(url).toBe("/api/programs/search?tag=Fat+Loss&tag=Strength");
  });

  it("(id: 96d40fb1) sends level, days, minWeeks, and maxWeeks matching ProgramSearchQuerySchema exactly", () => {
    const url = buildProgramSearchUrl({
      q: "hypertrophy",
      tag: ["Foundation"],
      level: "Intermediate",
      days: 4,
      minWeeks: 6,
      maxWeeks: 12,
    });
    expect(url).toBe(
      "/api/programs/search?q=hypertrophy&tag=Foundation&level=Intermediate&days=4&minWeeks=6&maxWeeks=12",
    );
  });

  it("(id: 96d40fb1) omits unset, empty, or undefined filter parameters", () => {
    const url = buildProgramSearchUrl({
      q: "strength",
      tag: [],
      level: undefined,
      days: undefined,
      minWeeks: undefined,
      maxWeeks: undefined,
    });
    expect(url).toBe("/api/programs/search?q=strength");
  });

  it("(id: 96d40fb3) omits page when page is 1, and appends page when page > 1", () => {
    const urlPage1 = buildProgramSearchUrl({ q: "strength", page: 1 });
    expect(urlPage1).toBe("/api/programs/search?q=strength");

    const urlPage2 = buildProgramSearchUrl({ q: "strength", page: 2 });
    expect(urlPage2).toBe("/api/programs/search?q=strength&page=2");
  });

  it("handles empty query and returns base endpoint", () => {
    const url = buildProgramSearchUrl({});
    expect(url).toBe("/api/programs/search");
  });
});

describe("ProgramFilters component controls and wording", () => {
  const dummyFilters: ProgramSearchFiltersState = {
    tags: [],
    level: undefined,
    days: undefined,
    minWeeks: undefined,
    maxWeeks: undefined,
  };

  it("(id: 96d40fb2) builds tag chips from availableTags prop, not a hardcoded list", () => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(
      <ProgramFilters
        availableTags={["Powerlifting", "Kettlebell", "Pilates"]}
        filters={dummyFilters}
        onChange={onChange}
        onClear={onClear}
        testID="test-filters"
      />,
    );

    expect(getByTestId("test-filters-tag-Powerlifting")).toBeTruthy();
    expect(getByTestId("test-filters-tag-Kettlebell")).toBeTruthy();
    expect(getByTestId("test-filters-tag-Pilates")).toBeTruthy();
    expect(getByText("Powerlifting")).toBeTruthy();
    expect(getByText("Kettlebell")).toBeTruthy();
    expect(getByText("Pilates")).toBeTruthy();

    // Verify hardcoded web tags not in availableTags are absent
    expect(queryByTestId("test-filters-tag-Fat Loss")).toBeNull();
  });

  it("(id: 96d40fb4) matches the web Programs browse filter panel wording and controls (webapp/app/dashboard/workout/WorkoutClient.tsx)", () => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    const { getByText, getByTestId } = render(
      <ProgramFilters
        availableTags={["Strength"]}
        filters={{ ...dummyFilters, level: "Beginner" }}
        onChange={onChange}
        onClear={onClear}
        testID="test-filters"
      />,
    );

    // Section headings matching web layout & uppercase typography
    expect(getByText("Tags")).toBeTruthy();
    expect(getByText("Experience Level")).toBeTruthy();
    expect(getByText("Days per week")).toBeTruthy();
    expect(getByText("Duration (Weeks)")).toBeTruthy();

    // Clear all filters button matching web wording
    const clearButton = getByTestId("test-filters-clear");
    expect(clearButton).toBeTruthy();
    expect(getByText("Clear all filters")).toBeTruthy();
    fireEvent.press(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onChange when toggling tags, level, days, and duration", () => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    const { getByTestId } = render(
      <ProgramFilters
        availableTags={["Cardio"]}
        filters={dummyFilters}
        onChange={onChange}
        onClear={onClear}
        testID="test-filters"
      />,
    );

    // Toggle tag
    fireEvent.press(getByTestId("test-filters-tag-Cardio"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["Cardio"] }),
    );

    // Select level
    fireEvent.press(getByTestId("test-filters-level-Beginner"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: "Beginner" }),
    );

    // Select days
    fireEvent.press(getByTestId("test-filters-days-4"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ days: 4 }),
    );

    // Change min weeks
    fireEvent.changeText(getByTestId("test-filters-min-weeks"), "8");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ minWeeks: 8 }),
    );

    // Change max weeks
    fireEvent.changeText(getByTestId("test-filters-max-weeks"), "16");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxWeeks: 16 }),
    );
  });
});

describe("ProgramsSearchRoute filter and pagination integration", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
  });

  it("(id: 96d40fb2, 96d40fb5) drives tag chips from server availableTags and sends repeated tag= on multi-select", async () => {
    mockApiFetch.mockResolvedValue({
      programs: [
        { program_id: "p1", name: "Full Body Build", description: "d" },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false },
      availableTags: ["Cardio", "Strength"],
    });

    const { getByTestId, findByTestId } = render(<ProgramsSearchRoute />);

    // Type query to trigger search
    fireEvent.changeText(getByTestId("programs-search-input"), "body");

    await waitFor(() => {
      expect(callsTo("/api/programs/search").length).toBe(1);
    });

    // Open filter panel
    const filterToggle = getByTestId("programs-search-filter-toggle");
    fireEvent.press(filterToggle);

    // Tag chips from availableTags are present
    const cardioChip = await findByTestId("programs-search-filter-tag-Cardio");
    const strengthChip = await findByTestId("programs-search-filter-tag-Strength");
    expect(cardioChip).toBeTruthy();
    expect(strengthChip).toBeTruthy();

    // Select both tags
    fireEvent.press(cardioChip);
    fireEvent.press(strengthChip);

    await waitFor(() => {
      const lastCall = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
      const url = String(lastCall[0]);
      expect(url).toContain("tag=Cardio");
      expect(url).toContain("tag=Strength");
    });
  });

  it("(id: 96d40fb1) sends level, days, minWeeks, maxWeeks via filter panel", async () => {
    mockApiFetch.mockResolvedValue({
      programs: [{ program_id: "p1", name: "P1", description: "d" }],
      pagination: { page: 1, limit: 20, total: 1, hasMore: false },
      availableTags: ["Core"],
    });

    const { getByTestId, findByTestId } = render(<ProgramsSearchRoute />);

    // Open filter panel
    fireEvent.press(getByTestId("programs-search-filter-toggle"));

    // Select level, days, minWeeks, maxWeeks
    const levelChip = await findByTestId("programs-search-filter-level-Beginner");
    fireEvent.press(levelChip);

    const daysChip = await findByTestId("programs-search-filter-days-3");
    fireEvent.press(daysChip);

    const minWeeksInput = getByTestId("programs-search-filter-min-weeks");
    fireEvent.changeText(minWeeksInput, "4");

    const maxWeeksInput = getByTestId("programs-search-filter-max-weeks");
    fireEvent.changeText(maxWeeksInput, "12");

    await waitFor(() => {
      const lastCall = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
      const url = String(lastCall[0]);
      expect(url).toContain("level=Beginner");
      expect(url).toContain("days=3");
      expect(url).toContain("minWeeks=4");
      expect(url).toContain("maxWeeks=12");
    });
  });

  it("(id: 96d40fb3, 96d40fb5) loads more results and appends page 2 when hasMore is true, then resets to page 1 on new query", async () => {
    // Page 1 mock response
    mockApiFetch.mockImplementation(async (path: string) => {
      const url = String(path);
      if (url.includes("page=2")) {
        return {
          programs: [{ program_id: "prog-2", name: "Program Two", description: "second" }],
          pagination: { page: 2, limit: 20, total: 2, totalPages: 2, hasMore: false },
          availableTags: ["Strength"],
        };
      }
      return {
        programs: [{ program_id: "prog-1", name: "Program One", description: "first" }],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 2, hasMore: true },
        availableTags: ["Strength"],
      };
    });

    const { getByTestId, findByTestId, queryByTestId } = render(<ProgramsSearchRoute />);

    // Search query
    fireEvent.changeText(getByTestId("programs-search-input"), "program");

    // Page 1 renders Program One
    const item1 = await findByTestId("programs-search-results-item-prog-1");
    expect(item1).toBeTruthy();

    // Load more button is rendered because hasMore is true
    const loadMoreButton = await findByTestId("programs-search-results-load-more");
    expect(loadMoreButton).toBeTruthy();

    // Click load more
    await act(async () => {
      fireEvent.press(loadMoreButton);
    });

    // Page 2 request fired
    await waitFor(() => {
      const page2Calls = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).includes("page=2"),
      );
      expect(page2Calls.length).toBeGreaterThan(0);
    });

    // Both Program One and Program Two are present in the list (appends, does NOT replace)
    const item2 = await findByTestId("programs-search-results-item-prog-2");
    expect(item2).toBeTruthy();
    expect(getByTestId("programs-search-results-item-prog-1")).toBeTruthy();

    // Load more button is now gone since page 2 returned hasMore: false
    expect(queryByTestId("programs-search-results-load-more")).toBeNull();

    // A new query resets to page 1
    fireEvent.changeText(getByTestId("programs-search-input"), "new search");
    await waitFor(() => {
      const lastCall = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
      const url = String(lastCall[0]);
      expect(url).toContain("q=new+search");
      expect(url).not.toContain("page=");
    });
  });
});
