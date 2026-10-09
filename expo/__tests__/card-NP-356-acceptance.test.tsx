/* eslint-disable import/first */
// Card NP-356: Spacing/type: Programs Browse & Filters - Recommended card title wrap &
// 2-line layout, search input label & inset icon, filter panel typography
//
// Acceptance tests covering visual parity pass (native vs web), Android S23 Ultra
// (One UI 7, font scale 0.9, logical 412x915, DPR 3.5), build 24f4e34d:
//
// 1. Recommended for You Card:
//    - Allows title to wrap cleanly to 2 lines (numberOfLines={2}) so long titles fit.
//    - Target user text uses text-sm (14px) instead of text-xs.
//    - Chevron icon size is 20 (h-5 w-5).
//    - Card container padding is 16px (p-4).
// 2. Browse Programs Section Heading & Search Bar:
//    - Heading renders total count in text-sm font-normal text-muted-foreground, outside bold title.
//    - Filters toggle button uses size 16 Filter icon and text-sm font-medium typography.
//    - Search input removes the extraneous "Search programs" label above the field and embeds
//      the Search magnifier icon inside the left of the input field with pl-10 inset padding.
//    - Accessibility label "Search programs" is preserved for screen readers.
// 3. Browse Programs List Cards:
//    - Moves duration/frequency chips below the title rather than inline right.
//    - Allows title to wrap to 2 lines (numberOfLines={2}).
//    - Preserves plain border and DOM structure (NP-327 regression test).
// 4. Filters Panel:
//    - Container padding aligned to 16px (p-4) with mb-4.
//    - Filter chips (Tags & Experience Level) use text-sm font-medium (14px).
//    - Clear filters button uses text-sm font-medium.

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

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { View } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Search } from "lucide-react-native";
import { apiFetch } from "@become/api-client";
import { Input } from "@/components/Input";
import { ProgramsList, type ProgramSummary } from "@/components/programs/ProgramsList";
import ProgramsBrowseRoute from "../app/(app)/(tabs)/programming/browse";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-356: Programs Browse & Filters Spacing and Typography", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
  });

  describe("(id: np356-01) Recommended for You Card", () => {
    it("source enforces 2-line title wrap, text-sm target user, size 20 chevron, and 16px padding", () => {
      const src = readExpo("components/programs/ProgramsCatalog.tsx");
      const recSection = src.slice(
        src.indexOf("{/* Recommended Programs Section"),
        src.indexOf("{/* Browse Heading"),
      );

      // Title wraps to 2 lines
      expect(recSection).toContain('numberOfLines={2}');

      // Target user uses text-sm
      expect(recSection).toContain('className="text-muted-foreground text-sm mt-1"');
      expect(recSection).not.toContain('className="text-muted-foreground text-xs mt-1"');

      // Chevron size is 20
      expect(recSection).toContain("size={20}");

      // Card padding is 16px
      expect(recSection).toContain("padding: 16");
    });

    it("renders recommended program with 2-line title and text-sm target user", async () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        if (fetchPath.startsWith("/api/profile")) {
          return { profile: { fitnessGoal: "gain_muscle", experienceLevel: "intermediate" } };
        }
        if (fetchPath.startsWith("/api/programs/search") || fetchPath === "/api/programs") {
          return {
            programs: [
              {
                program_id: "rec-1",
                name: "BECOME — 12 Week Fat-Loss Foundation Program",
                description: "Full body hypertrophy",
                duration_weeks: 12,
                training_days_per_week: 4,
                goal: "gain_muscle",
                target_user: "Beginner to Intermediate",
                tags: ["Foundation"],
              },
            ],
            pagination: { hasMore: false, total: 1 },
            availableTags: ["Foundation"],
          };
        }
        if (fetchPath.startsWith("/api/programs/saved")) {
          return { savedPrograms: [] };
        }
        return {};
      });

      const { getByTestId, getByText } = render(<ProgramsBrowseRoute />);

      await waitFor(() => {
        expect(getByTestId("programming-browse-recommended")).toBeTruthy();
      });

      const title = getByText("BECOME — 12 Week Fat-Loss Foundation Program");
      expect(title.props.numberOfLines).toBe(2);

      const targetUser = getByText("Beginner to Intermediate");
      expect(targetUser.props.className).toContain("text-sm");
    });
  });

  describe("(id: np356-02) Browse Programs Section Heading & Search Bar", () => {
    it("source separates total count from bold heading, configures filter button and search input", () => {
      const src = readExpo("components/programs/ProgramsCatalog.tsx");

      // Heading row has count in distinct text-sm font-normal text element
      expect(src).toContain('text-muted-foreground text-sm font-normal');
      expect(src).toContain('({displayTotal})');

      // Filter toggle button uses Filter size 16 and text-sm font-medium
      const filterButtonSection = src.slice(
        src.indexOf('testID="programming-browse-filter-toggle"'),
        src.indexOf('{/* Search Input */}'),
      );
      expect(filterButtonSection).toContain("size={16}");
      expect(filterButtonSection).toContain("text-sm font-medium");

      // Search input removes label and embeds Search icon
      const searchSection = src.slice(
        src.indexOf('{/* Search Input */}'),
        src.indexOf('{/* Expanded Filter Panel'),
      );
      expect(searchSection).not.toContain('label="Search programs"');
      expect(searchSection).toContain('accessibilityLabel="Search programs"');
      expect(searchSection).toContain("leftIcon=");
      expect(searchSection).toContain("<Search");
    });

    it("Input component supports leftIcon with pl-10 inset padding and omits label element", () => {
      const { queryByTestId, getByTestId } = render(
        <Input
          testID="test-search-field"
          accessibilityLabel="Search test"
          placeholder="Search..."
          leftIcon={<Search size={18} testID="test-magnifier" />}
        />,
      );

      // Label element does not render when label prop is omitted
      expect(queryByTestId("test-search-field-label")).toBeNull();

      // TextInput receives pl-10 inset padding class and retains accessibilityLabel
      const input = getByTestId("test-search-field");
      expect(input.props.className).toContain("pl-10");
      expect(input.props.accessibilityLabel).toBe("Search test");

      // leftIcon is rendered inside the field
      expect(getByTestId("test-magnifier")).toBeTruthy();
    });
  });

  describe("(id: np356-03) Browse Programs List Cards", () => {
    it("source renders duration/frequency chips below title with numberOfLines={2}", () => {
      const src = readExpo("components/programs/ProgramsList.tsx");
      const itemSection = src.slice(
        src.indexOf('accessibilityLabel={`Open program ${item.name}`}'),
        src.indexOf("visibleTags.length > 0"),
      );

      expect(itemSection).toContain("numberOfLines={2}");
      // Chips are placed after title in their own row
      const titleIndex = itemSection.indexOf("numberOfLines={2}");
      const chipsIndex = itemSection.indexOf("item.durationWeeks");
      expect(chipsIndex).toBeGreaterThan(titleIndex);
    });

    it("renders chips below title and preserves plain card border (NP-327)", () => {
      const programs: ProgramSummary[] = [
        {
          id: "prog-browse-1",
          name: "BECOME — 12 Week Fat-Loss Foundation Program",
          description: "Full body transformation",
          durationWeeks: 12,
          trainingDaysPerWeek: 4,
          targetUser: "Intermediate",
        },
      ];

      const { getByTestId, getByText } = render(<ProgramsList programs={programs} />);

      const title = getByText("BECOME — 12 Week Fat-Loss Foundation Program");
      expect(title.props.numberOfLines).toBe(2);

      expect(getByText("12w")).toBeTruthy();
      expect(getByText("4x/wk")).toBeTruthy();
      expect(getByText("Intermediate")).toBeTruthy();

      // NP-327 regression test: Card border is plain (1px) with no left accent stripe
      const card = getByTestId("programs-list-item-prog-browse-1").parent?.parent?.parent;
      expect(card).toBeTruthy();
      const style = card!.props.style as Record<string, unknown>;
      expect(style.borderWidth).toBe(1);
      expect(style.borderLeftWidth).toBeUndefined();
      expect(style.borderLeftColor).toBeUndefined();
    });
  });

  describe("(id: np356-04) Filters Panel Typography & Padding", () => {
    it("source aligns filter container padding to 16px (p-4), chip typography to text-sm, and clear button to text-sm", () => {
      const src = readExpo("components/programs/ProgramsCatalog.tsx");
      const filterPanelSection = src.slice(
        src.indexOf("{/* Expanded Filter Panel"),
        src.indexOf("{/* Error State */}"),
      );

      // Container uses p-4 (16px) and mb-4
      expect(filterPanelSection).toContain('className="p-4 rounded-xl border border-border bg-card mb-4"');
      expect(filterPanelSection).not.toContain('className="p-3 rounded-xl');

      // Chips use text-sm font-medium
      expect(filterPanelSection).toContain("text-sm");
      expect(filterPanelSection).not.toContain('className={`text-xs');

      // Clear filters button uses text-sm
      expect(filterPanelSection).toContain('className="text-destructive text-sm font-medium"');
      expect(filterPanelSection).not.toContain('className="text-destructive text-xs');
    });

    it("toggles filter panel and displays chips with text-sm typography", async () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        if (fetchPath.startsWith("/api/programs/search") || fetchPath === "/api/programs") {
          return {
            programs: [
              {
                program_id: "p1",
                name: "Program 1",
                description: "d1",
                duration_weeks: 4,
                training_days_per_week: 3,
                target_user: "Beginner",
                tags: ["Hypertrophy"],
              },
            ],
            pagination: { hasMore: false, total: 1 },
            availableTags: ["Hypertrophy"],
          };
        }
        if (fetchPath.startsWith("/api/profile")) {
          return { profile: null };
        }
        if (fetchPath.startsWith("/api/programs/saved")) {
          return { savedPrograms: [] };
        }
        return {};
      });

      const { getByTestId, getByText } = render(<ProgramsBrowseRoute />);

      await waitFor(() => {
        expect(getByTestId("programming-browse-filter-toggle")).toBeTruthy();
      });

      // Open filter panel
      fireEvent.press(getByTestId("programming-browse-filter-toggle"));

      await waitFor(() => {
        expect(getByTestId("programming-browse-tag-Hypertrophy")).toBeTruthy();
      });

      const tagText = getByText("Hypertrophy");
      expect(tagText.props.className).toContain("text-sm");

      const levelText = getByText("Beginner");
      expect(levelText.props.className).toContain("text-sm");
    });
  });
});
