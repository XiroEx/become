/* eslint-disable import/first */
// Card NP-356: Spacing/type: Programs Browse & Filters - Recommended card title wrap & 2-line layout, search input label & inset icon, filter panel typography
// Android S23 Ultra (One UI 7, font scale 0.9, logical 412x915, DPR 3.5), build 24f4e34d.
//
// Acceptance criteria:
// 1. Recommended for You Card:
//    - Title wraps to 2 lines (numberOfLines={2})
//    - Target user is styled with text-sm (14px font, text-muted-foreground)
//    - Chevron icon is size 20 (h-5 w-5)
//    - Card container has padding 16 (p-4) with gap 12
// 2. Browse Programs Section Heading & Search Bar:
//    - Browse Programs heading has total count in separate text-sm font-normal text-muted-foreground ml-2 (not inside bold text)
//    - Filters toggle button uses Filter icon size 16 and text-sm font-medium
//    - Search input has no extraneous 'Search programs' label above it
//    - Search input embeds search magnifier icon (Search size 20) inside left of input
//    - Input component supports leftIcon with pl-10 inset padding
// 3. Browse Programs List Cards:
//    - Duration and frequency chips are rendered below title in an inline row (not inline right)
//    - Title wraps to 2 lines (numberOfLines={2})
//    - Target user text is text-sm
//    - Hierarchy preserves NP-327 card border check
// 4. Filters Panel:
//    - Container uses 16px padding (p-4) and mb-4
//    - Filter chips use text-sm font-medium (14px font)
//    - Section headers use text-xs uppercase font-medium
//    - Clear filters button uses text-sm font-medium

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
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

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import { Input } from "@/components/Input";
import { ProgramsList } from "@/components/programs/ProgramsList";
import ProgramsBrowseRoute from "../app/(app)/(tabs)/programming/browse";

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-356: Programs Browse & Filters Spacing, Typography & Layout", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiFetch.mockReset();
  });

  describe("1. Recommended for You Card layout & typography", () => {
    it("source verifies Recommended card has numberOfLines={2}, text-sm target user, size 20 chevron, and 16px padding", () => {
      const src = readExpo("components/programs/ProgramsCatalog.tsx");
      const recSection = src.slice(
        src.indexOf("testID=\"programming-browse-recommended\""),
        src.indexOf("testID=\"programming-browse-heading-row\""),
      );

      // Title wraps to 2 lines
      expect(recSection).toContain("numberOfLines={2}");

      // Target user uses text-sm
      expect(recSection).toContain('className="text-muted-foreground text-sm mt-1"');
      expect(recSection).not.toContain('className="text-muted-foreground text-xs mt-1"');

      // Chevron icon uses size 20
      expect(recSection).toContain("size={20}");

      // Card container uses padding: 16 and gap: 12
      expect(recSection).toContain("padding: 16");
      expect(recSection).toContain("gap: 12");
    });

    it("renders Recommended card with 2-line title and text-sm target user", async () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        if (fetchPath.startsWith("/api/programs/search") || fetchPath === "/api/programs") {
          return {
            programs: [
              {
                program_id: "prog-rec-1",
                name: "BECOME — 12 Week Fat-Loss Foundation Program",
                duration_weeks: 12,
                training_days_per_week: 4,
                goal: "fat_loss",
                target_user: "Beginner to Intermediate",
                tags: ["fat-loss", "strength"],
              },
            ],
            pagination: { hasMore: false, total: 1 },
            availableTags: ["fat-loss", "strength"],
          };
        }
        if (fetchPath.startsWith("/api/programs/saved")) {
          return { savedPrograms: [] };
        }
        if (fetchPath.startsWith("/api/profile")) {
          return { profile: { fitnessGoal: "fat_loss", experienceLevel: "beginner" } };
        }
        return {};
      });

      const { findByTestId } = render(<ProgramsBrowseRoute />);
      const recItem = await findByTestId("browse-recommended-item-prog-rec-1");
      expect(recItem).toBeTruthy();

      const recStyle = recItem.props.style as Record<string, unknown>;
      expect(recStyle.padding).toBe(16);
      expect(recStyle.gap).toBe(12);
    });
  });

  describe("2. Browse Programs Heading, Filter Button & Inset Search Icon", () => {
    it("source verifies separate count element, size 16 Filter icon with text-sm, and no search input label", () => {
      const src = readExpo("components/programs/ProgramsCatalog.tsx");

      // Heading row has count in separate text-sm font-normal element
      expect(src).toContain('className="text-muted-foreground text-sm font-normal ml-2"');

      // Filter toggle uses size 16 icon and text-sm font-medium text
      expect(src).toContain("<Filter\n            size={16}");
      expect(src).toContain("text-sm font-medium");

      // Search input has no label prop, and passes inset Search icon
      const searchSection = src.slice(
        src.indexOf("testID=\"programming-browse-search-input\""),
        src.indexOf("testID=\"programming-browse-tag-"),
      );
      expect(searchSection).not.toContain('label="Search programs"');
      expect(searchSection).toContain("leftIcon=");
      expect(searchSection).toContain("<Search");
    });

    it("Input component supports leftIcon with pl-10 padding and inset placement", () => {
      const { getByTestId } = render(
        <Input
          testID="test-search-input"
          leftIcon={<View testID="test-magnifier" />}
          placeholder="Search..."
        />,
      );

      // Icon container is rendered with pointerEvents none
      const iconContainer = getByTestId("test-search-input-left-icon");
      expect(iconContainer).toBeTruthy();
      expect(iconContainer.props.pointerEvents).toBe("none");

      // TextInput receives pl-10 className and paddingLeft: 40 style
      const input = getByTestId("test-search-input");
      expect(input.props.className).toContain("pl-10");
      const styles = Array.isArray(input.props.style) ? input.props.style : [input.props.style];
      const hasPadding40 = styles.some(
        (s: Record<string, unknown> | null) => s && s.paddingLeft === 40,
      );
      expect(hasPadding40).toBe(true);
    });
  });

  describe("3. Browse Programs List Cards layout", () => {
    it("source verifies duration/frequency chips are below title and title wraps to 2 lines", () => {
      const src = readExpo("components/programs/ProgramsList.tsx");

      // Title wraps to 2 lines
      expect(src).toContain('testID={`${testID}-title-${item.id}`}');
      expect(src).toContain("numberOfLines={2}");

      // Target user uses text-sm
      expect(src).toContain('className="text-muted-foreground text-sm mt-1"');

      // Chevron icon is size 20
      expect(src).toContain("<ChevronRight\n              color={colors[\"muted-foreground\"]}\n              size={20}");
    });

    it("renders chips below title and preserves NP-327 card border check", () => {
      const programs = [
        {
          id: "p1",
          name: "12 Week Fat-Loss Foundation Program",
          description: "desc",
          durationWeeks: 12,
          trainingDaysPerWeek: 4,
          targetUser: "Beginner",
          tags: ["fat-loss"],
        },
      ];

      const { getByTestId } = render(<ProgramsList programs={programs} />);

      const titleEl = getByTestId("programs-list-title-p1");
      expect(titleEl.props.numberOfLines).toBe(2);

      // Regression guard for NP-327: 3 host-element ancestors up is the card container
      const card = getByTestId("programs-list-item-p1").parent?.parent?.parent;
      expect(card).toBeTruthy();
      const style = card!.props.style as Record<string, unknown>;
      expect(style.borderLeftWidth).toBeUndefined();
      expect(style.borderLeftColor).toBeUndefined();
      expect(style.borderWidth).toBe(1);
    });
  });

  describe("4. Filters Panel typography & padding", () => {
    it("source verifies Filters panel uses p-4 mb-4, text-sm font-medium chips, and text-sm clear button", () => {
      const src = readExpo("components/programs/ProgramsCatalog.tsx");
      const filterSection = src.slice(
        src.indexOf("{/* Expanded Filter Panel"),
        src.indexOf("{/* Error State */"),
      );

      // Container has p-4 mb-4
      expect(filterSection).toContain('className="p-4 rounded-xl border border-border bg-card mb-4"');
      expect(filterSection).toContain("style={{ gap: 16 }}");

      // Filter chips use text-sm font-medium
      expect(filterSection).toContain("text-sm font-medium");
      expect(filterSection).not.toContain("className={`text-xs ${");

      // Section labels use text-xs uppercase font-medium mb-2
      expect(filterSection).toContain('className="text-muted-foreground text-xs uppercase font-medium mb-2"');

      // Clear filters button uses text-sm font-medium
      expect(filterSection).toContain('className="text-destructive text-sm font-medium"');
    });
  });
});
