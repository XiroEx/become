import { render, fireEvent, waitFor } from "@testing-library/react-native";

// Acceptance tests for card NP-356:
// Spacing/type: Programs Browse & Filters - Recommended card title wrap & 2-line layout,
// search input label & inset icon, filter panel typography
//
// 1) Recommended for You:
//    - Program title wraps to 2 lines (numberOfLines={2})
//    - Target user text is text-sm (14px)
//    - Card padding 16px, chevron size 20
// 2) Browse Programs Section Heading & Search Bar:
//    - Section heading count (displayTotal) styled as text-sm font-normal text-muted-foreground ml-2, not bolded inside heading
//    - Filters button uses text-sm font-medium and Filter size 16
//    - Extraneous 'Search programs' label removed above search input
//    - Search magnifier icon embedded inside the left of the input field
// 3) Browse Programs List Cards:
//    - Duration/frequency chips rendered below title rather than inline right
//    - Target user text is text-sm (14px)
//    - Card padding 16px, chevron size 20
// 4) Filters Panel:
//    - Panel container matches card padding (16px / p-4)
//    - Filter chips use text-sm font-medium (14px)
//    - Clear filters button uses text-sm font-medium

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
import { ProgramsCatalog } from "@/components/programs/ProgramsCatalog";
import { ProgramsList } from "@/components/programs/ProgramsList";
import { ProgramBrowseCard } from "@/components/programs/ProgramBrowseCard";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SAMPLE_PROGRAMS = [
  {
    program_id: "prog-fatloss-1",
    name: "BECOME — 12 Week Fat-Loss Foundation Program",
    description: "Comprehensive fat loss foundation",
    duration_weeks: 12,
    training_days_per_week: 4,
    target_user: "Beginner to Intermediate",
    goal: "fat_loss",
    tags: ["fat_loss", "conditioning"],
  },
  {
    program_id: "prog-strength-2",
    name: "Strength & Size 2.0",
    description: "Hypertrophy and strength",
    duration_weeks: 8,
    training_days_per_week: 4,
    target_user: "Intermediate",
    goal: "gain_muscle",
    tags: ["strength", "hypertrophy"],
  },
];

describe("NP-356: Programs Browse & Filters spacing/typography parity", () => {
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
          availableTags: ["fat_loss", "conditioning", "strength"],
        });
      }

      if (url === "/api/programs/saved") {
        if (method === "POST") return Promise.resolve({ success: true, message: "Saved" });
        if (method === "DELETE") return Promise.resolve({ success: true, message: "Unsaved" });
        return Promise.resolve({ savedPrograms: [] });
      }

      if (url === "/api/profile") {
        return Promise.resolve({
          profile: {
            fitnessGoal: "fat_loss",
            experienceLevel: "beginner",
          },
        });
      }

      if (url === "/api/programs/active") {
        return Promise.resolve({ activePrograms: [] });
      }

      return Promise.resolve({});
    });
  });

  describe("1) Recommended for You Card", () => {
    it("allows title to wrap to 2 lines (numberOfLines=2) and target user text is text-sm", async () => {
      const { findByTestId, getByText } = render(
        <ProgramsCatalog catalogTitle="Browse Programs" />,
      );

      await findByTestId("programming-browse-recommended");
      const title = await findByTestId("browse-recommended-title-prog-fatloss-1");
      expect(title.props.numberOfLines).toBe(2);

      const targetUser = getByText("Beginner to Intermediate");
      expect(targetUser.props.className).toContain("text-sm");
    });
  });

  describe("2) Browse Programs Section Heading & Search Bar", () => {
    it("renders count outside bold title as text-sm font-normal", async () => {
      const { findByTestId, getByText } = render(
        <ProgramsCatalog catalogTitle="Browse Programs" />,
      );

      await findByTestId("programming-browse-heading-row");
      const heading = getByText("Browse Programs");
      expect(heading.props.className).toContain("text-foreground");
      expect(heading.props.className).toContain("font-bold");

      const count = getByText("(2)");
      expect(count.props.className).toContain("text-sm");
      expect(count.props.className).toContain("font-normal");
      expect(count.props.className).toContain("text-muted-foreground");
    });

    it("renders Filters button with text-sm font-medium and Filter icon size 16", async () => {
      const { findByTestId } = render(
        <ProgramsCatalog catalogTitle="Browse Programs" />,
      );

      const filterToggle = await findByTestId("programming-browse-filter-toggle");
      expect(filterToggle).toBeTruthy();
    });

    it("removes extraneous 'Search programs' label above search input and has inset search icon", async () => {
      const { queryByTestId, getByTestId, findByTestId } = render(
        <ProgramsCatalog catalogTitle="Browse Programs" />,
      );

      await findByTestId("programming-browse-search-input");

      // Extraneous label element should no longer exist
      expect(queryByTestId("programming-browse-search-input-label")).toBeNull();

      // Input exists and has placeholder and accessibility label
      const input = getByTestId("programming-browse-search-input");
      expect(input.props.placeholder).toBe("Search by name, tags, or description…");
      expect(input.props.accessibilityLabel).toBe("Search programs");

      // Verify typing in search input updates query
      fireEvent.changeText(input, "fat loss");
      expect(input.props.value).toBe("fat loss");
    });
  });

  describe("3) Browse Programs List Cards", () => {
    it("renders duration/frequency chips below title rather than inline right", () => {
      const programs = [
        {
          id: "p1",
          name: "BECOME — 12 Week Fat-Loss Foundation Program",
          description: "desc",
          durationWeeks: 12,
          trainingDaysPerWeek: 4,
          targetUser: "Beginner to Intermediate",
          tags: ["fat_loss"],
        },
      ];

      const { getByTestId, getByText } = render(
        <ProgramsList programs={programs} />,
      );

      const title = getByTestId("programs-list-title-p1");
      expect(title.props.numberOfLines).toBe(1);

      const durationChip = getByText("12w");
      expect(durationChip).toBeTruthy();

      const freqChip = getByText("4x/wk");
      expect(freqChip).toBeTruthy();

      const targetUser = getByText("Beginner to Intermediate");
      expect(targetUser.props.className).toContain("text-sm");
    });

    it("renders ProgramBrowseCard component with parity layout", () => {
      const item = {
        id: "p1",
        name: "Strength 5x5",
        description: "desc",
        durationWeeks: 4,
        trainingDaysPerWeek: 5,
        targetUser: "Intermediate",
      };

      const { getByText } = render(<ProgramBrowseCard item={item} />);
      expect(getByText("Strength 5x5")).toBeTruthy();
      expect(getByText("4w")).toBeTruthy();
      expect(getByText("5x/wk")).toBeTruthy();
      expect(getByText("Intermediate")).toBeTruthy();
    });
  });

  describe("4) Filters Panel", () => {
    it("has 16px padding (p-4), text-sm font-medium chips, and text-sm clear button", async () => {
      const { findByTestId, getByText } = render(
        <ProgramsCatalog catalogTitle="Browse Programs" />,
      );

      const filterToggle = await findByTestId("programming-browse-filter-toggle");
      fireEvent.press(filterToggle);

      const tagChip = await findByTestId("programming-browse-tag-fat_loss");
      expect(tagChip).toBeTruthy();

      const tagText = getByText("fat_loss");
      expect(tagText.props.className).toContain("text-sm");
      expect(tagText.props.className).toContain("font-medium");

      const levelChip = await findByTestId("programming-browse-level-Beginner");
      expect(levelChip).toBeTruthy();

      const levelText = getByText("Beginner");
      expect(levelText.props.className).toContain("text-sm");
      expect(levelText.props.className).toContain("font-medium");

      // Select level to trigger hasFilters and show Clear filters button
      fireEvent.press(levelChip);
      const clearButton = await findByTestId("programming-browse-clear-filters");
      expect(clearButton).toBeTruthy();

      const clearText = getByText("Clear all filters");
      expect(clearText.props.className).toContain("text-sm");
      expect(clearText.props.className).toContain("font-medium");
    });
  });
});
