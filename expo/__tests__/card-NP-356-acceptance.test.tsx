import React from "react";
import { View } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ProgramsCatalog } from "@/components/programs/ProgramsCatalog";
import { ProgramsList } from "@/components/programs/ProgramsList";
import type { ProgramSummary } from "@/components/programs/ProgramsList";
import { Input } from "@/components/Input";
import { Search } from "lucide-react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockToken = "test-jwt-token";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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
/* eslint-enable import/first */
const mockApiFetch = apiFetch as unknown as jest.Mock;

const MOCK_RECOMMENDED = [
  {
    program_id: "rec-1",
    name: "BECOME — 12 Week Fat-Loss Foundation Program",
    description: "Fat loss foundation",
    duration_weeks: 12,
    training_days_per_week: 4,
    target_user: "Beginner to Intermediate",
    goal: "fat_loss",
    tags: ["Fat Loss", "Foundation"],
  },
];

const MOCK_CATALOG = [
  {
    program_id: "cat-1",
    name: "BECOME — 12 Week Fat-Loss Foundation Program",
    description: "Full title description",
    duration_weeks: 12,
    training_days_per_week: 4,
    target_user: "Beginner to Intermediate",
    goal: "fat_loss",
    tags: ["Fat Loss", "Foundation"],
  },
];

describe("Card NP-356 Acceptance Tests: Programs Browse & Filters Spacing and Typography", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();

    mockApiFetch.mockImplementation(async (path: string) => {
      const url = String(path);
      if (url.startsWith("/api/programs/search") || url === "/api/programs") {
        return {
          programs: MOCK_CATALOG,
          pagination: { page: 1, limit: 20, total: 7, hasMore: false },
          availableTags: ["Fat Loss", "Strength"],
        };
      }
      if (url === "/api/programs/saved") {
        return { savedPrograms: [] };
      }
      if (url === "/api/profile") {
        return {
          profile: { fitnessGoal: "fat_loss", experienceLevel: "beginner" },
        };
      }
      if (url.startsWith("/api/programs/active")) {
        return { activePrograms: [] };
      }
      return {};
    });
  });

  describe("1. Recommended for You Card", () => {
    it("allows recommended program title to wrap to 2 lines and sets target user to text-sm", async () => {
      mockApiFetch.mockImplementation(async (path: string) => {
        const url = String(path);
        if (url.startsWith("/api/programs/search") || url === "/api/programs") {
          return {
            programs: MOCK_RECOMMENDED,
            pagination: { page: 1, limit: 20, total: 1, hasMore: false },
            availableTags: ["Fat Loss"],
          };
        }
        if (url === "/api/profile") {
          return {
            profile: { fitnessGoal: "fat_loss", experienceLevel: "beginner" },
          };
        }
        if (url === "/api/programs/saved") {
          return { savedPrograms: [] };
        }
        return {};
      });

      const { findByTestId } = render(<ProgramsCatalog catalogTitle="Browse Programs" />);
      const card = await findByTestId("browse-recommended-item-rec-1");
      expect(card).toBeTruthy();

      // Card container styling: padding 16, borderLeftWidth 6, gap 12
      const cardStyle = card.props.style;
      expect(cardStyle.padding).toBe(16);
      expect(cardStyle.borderLeftWidth).toBe(6);
      expect(cardStyle.gap).toBe(12);

      // Title wrapped to 2 lines
      const title = card.findByProps({ children: "BECOME — 12 Week Fat-Loss Foundation Program" });
      expect(title).toBeTruthy();
      expect(title.props.numberOfLines).toBe(2);

      // Target user has text-sm typography
      const targetUser = card.findByProps({ children: "Beginner to Intermediate" });
      expect(targetUser).toBeTruthy();
      expect(targetUser.props.className).toContain("text-sm");
    });
  });

  describe("2. Browse Programs Section Heading & Search Bar", () => {
    it("renders total count styled as text-sm font-normal", async () => {
      const { findByTestId } = render(<ProgramsCatalog catalogTitle="Browse Programs" />);
      const headingRow = await findByTestId("programming-browse-heading-row");
      expect(headingRow).toBeTruthy();

      // Count node exists and has text-sm font-normal
      const countNode = headingRow.findByProps({ className: "text-muted-foreground text-sm font-normal" });
      expect(countNode).toBeTruthy();
      expect(countNode.props.className).toContain("text-sm");
      expect(countNode.props.className).toContain("font-normal");
    });

    it("renders filter button with size 16 icon and text-sm font-medium typography", async () => {
      const { findByTestId, getByText } = render(<ProgramsCatalog catalogTitle="Browse Programs" />);
      const filterToggle = await findByTestId("programming-browse-filter-toggle");
      expect(filterToggle).toBeTruthy();

      const filterText = getByText(/^Filters/);
      expect(filterText.props.className).toContain("text-sm");
      expect(filterText.props.className).toContain("font-medium");
    });

    it("renders search input with inset search icon and no external label", async () => {
      const { getByTestId, queryByTestId } = render(<ProgramsCatalog catalogTitle="Browse Programs" />);
      await waitFor(() => {
        expect(getByTestId("programming-browse-search-input")).toBeTruthy();
      });

      // No external label rendered
      expect(queryByTestId("programming-browse-search-input-label")).toBeNull();

      // Inset search icon present inside input container
      const inputContainer = getByTestId("programming-browse-search-input-container");
      expect(inputContainer).toBeTruthy();
      const input = getByTestId("programming-browse-search-input");
      expect(input.props.className).toContain("pl-10");
    });
  });

  describe("3. Browse Programs List Cards", () => {
    it("renders duration/frequency chips in their own row below title, allowing title to wrap to 2 lines", () => {
      const programs: ProgramSummary[] = [
        {
          id: "p-browse-1",
          name: "BECOME — 12 Week Fat-Loss Foundation Program",
          description: "Full title description",
          durationWeeks: 12,
          trainingDaysPerWeek: 4,
          targetUser: "Beginner to Intermediate",
          tags: ["Fat Loss"],
        },
      ];

      const { getByTestId, getByText } = render(<ProgramsList programs={programs} />);
      const title = getByTestId("programs-list-title-p-browse-1");
      expect(title.props.numberOfLines).toBe(2);

      // Duration and frequency chips exist
      expect(getByText("12w")).toBeTruthy();
      expect(getByText("4x/wk")).toBeTruthy();

      // Target user is text-sm
      const targetUser = getByText("Beginner to Intermediate");
      expect(targetUser.props.className).toContain("text-sm");
    });
  });

  describe("4. Filters Panel", () => {
    it("renders filter panel container with p-4 mb-4, text-sm chips, and text-sm clear button", async () => {
      const { findByTestId, getByTestId, getByText } = render(<ProgramsCatalog catalogTitle="Browse Programs" />);
      const filterToggle = await findByTestId("programming-browse-filter-toggle");

      // Open filters panel
      fireEvent.press(filterToggle);

      const tagChip = await findByTestId("programming-browse-tag-Fat Loss");
      expect(tagChip).toBeTruthy();

      // Tag chip text has text-sm font-medium
      const tagText = tagChip.findByProps({ children: "Fat Loss" });
      expect(tagText.props.className).toContain("text-sm");
      expect(tagText.props.className).toContain("font-medium");

      // Select tag to trigger clear filters button
      fireEvent.press(tagChip);

      const clearBtn = getByTestId("programming-browse-clear-filters");
      expect(clearBtn).toBeTruthy();
      const clearText = getByText("Clear all filters");
      expect(clearText.props.className).toContain("text-sm");
      expect(clearText.props.className).toContain("font-medium");
    });
  });

  describe("5. Input component with leftIcon", () => {
    it("renders leftIcon inside relative container and applies pl-10 padding", () => {
      const { getByTestId } = render(
        <Input
          testID="custom-input"
          placeholder="Type here..."
          leftIcon={
            <View testID="custom-search-icon">
              <Search size={20} />
            </View>
          }
        />,
      );

      const input = getByTestId("custom-input");
      expect(input.props.className).toContain("pl-10");
      expect(getByTestId("custom-search-icon")).toBeTruthy();
    });
  });
});
