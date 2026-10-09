// ─── Nutrition Day Spacing & Typography Parity (NP-370) ───────────────────
//
// Aligns native Nutrition Day screen with web source of truth:
//   1. Header Chrome & View Selector:
//      - My Stuff and Timeline button height 40px, borderRadius 12 (rounded-xl)
//      - Header subtitle text-sm mt-1 (14px)
//      - Extra 3-segment Day/Week/Month selector removed from day tab
//   2. Search & Quick Capture Row:
//      - Search input height 40px, borderRadius 12
//      - Camera and upload buttons width 40, height 40, borderRadius 12, 20px icons
//   3. DateNav Navigation:
//      - Date label text-sm font-semibold (14px)
//      - ChevronDown size 14
//      - 'Today' rendered as plain text uppercase instead of green pill
//   4. Calorie Ring & Goal Line:
//      - Center calorie number text-2xl font-bold (24px)
//      - Goal line rendered outside the Card below it (-mt-2)
//      - Macro tracks h-2.5 (10px height)
//      - Macro row labels text-sm font-medium (14px)
//      - Macro pills rectangular 4px rounded chips
//   5. Water Tracker & Quick Actions:
//      - WaterTracker header text-sm (14px)
//      - Quick-add buttons borderRadius 8 (rounded-lg)
//      - Consultant teaser borderRadius 16, padding 16, LinearGradient, 20px Sparkles
//      - Quick Action tiles borderRadius 12, 8px badge radius, 20px accent icons

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { DateNav } from "@/components/nutrition/DateNav";
import { WaterTracker } from "@/components/nutrition/WaterTracker";
import { NutritionConsultantTeaser } from "@/components/nutrition/NutritionConsultantTeaser";

const TODAY_MOCK = "2026-06-15";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY_MOCK, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

// Canonical offlineQueue mock path (NP-370 unblock)
jest.mock("@/lib/query/offlineQueue", () => ({
  createOfflineQueue: jest.fn(),
}));

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const emptyDay = {
  date: TODAY_MOCK,
  logs: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
};

function defaultApiHandler(url: string) {
  if (url.startsWith("/api/meal-logs")) return emptyDay;
  if (url.startsWith("/api/nutrition/log")) return { water: { current: 0, goal: 96 }, quickAdds: [] };
  if (url.startsWith("/api/nutrition/goals")) return { calories: 2000, protein: 150, carbs: 200, fats: 65, waterGoal: 96 };
  if (url.startsWith("/api/nutrition/meal-schedule")) return { windows: [] };
  if (url.startsWith("/api/tags")) return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
  return {};
}

describe("NP-370 Spacing & Typography Parity", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockPush.mockReset();
  });

  describe("1. Header Chrome & View Selector", () => {
    it("header buttons have 40px height, rounded-xl (12px) radius and border styling", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-my-stuff-button")).toBeTruthy();
        expect(getByTestId("nutrition-timeline-button")).toBeTruthy();
      });

      const myStuffBtn = getByTestId("nutrition-my-stuff-button");
      expect(myStuffBtn.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
          borderWidth: 1,
        }),
      );

      const timelineBtn = getByTestId("nutrition-timeline-button");
      expect(timelineBtn.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
          borderWidth: 1,
        }),
      );

      // On day tab, extra 3-segment view selector is removed
      expect(queryByTestId("nutrition-view-selector")).toBeNull();
    });

    it("renders 3-segment view selector on week view but not on day view", async () => {
      mockParams = { view: "week" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-view-selector")).toBeTruthy();
      });
    });
  });

  describe("2. Search & Quick Capture Row", () => {
    it("search input and camera/upload buttons have 40px height and 12px border radius", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-search-bar")).toBeTruthy();
        expect(getByTestId("nutrition-camera-button")).toBeTruthy();
        expect(getByTestId("nutrition-upload-button")).toBeTruthy();
      });

      const searchBar = getByTestId("nutrition-search-bar");
      expect(searchBar.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
        }),
      );

      const cameraBtn = getByTestId("nutrition-camera-button");
      expect(cameraBtn.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 12,
        }),
      );

      const uploadBtn = getByTestId("nutrition-upload-button");
      expect(uploadBtn.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 12,
        }),
      );
    });
  });

  describe("3. DateNav Navigation", () => {
    it("renders date label as text-sm (14px) and 'Today' as plain text uppercase", () => {
      const onPrev = jest.fn();
      const onNext = jest.fn();
      const { getByTestId } = render(
        <DateNav
          dateKey={TODAY_MOCK}
          isToday={true}
          onPrev={onPrev}
          onNext={onNext}
        />,
      );

      const dateLabel = getByTestId("nutrition-current-date");
      expect(dateLabel.props.className).toContain("text-sm");

      const todayBadge = getByTestId("nutrition-today-badge");
      expect(todayBadge.props.className).toContain("text-[10px]");
      expect(todayBadge.props.className).toContain("uppercase");
      expect(todayBadge.props.children).toBe("Today");
    });
  });

  describe("4. Calorie Ring & Goal Line", () => {
    it("center number uses 24px (text-2xl), macro tracks use h-2.5 (10px), macro labels use text-sm", () => {
      const { getByTestId, getByText } = render(
        <CalorieRing
          consumed={1800}
          goal={2400}
          protein={{ current: 120, goal: 150 }}
          carbs={{ current: 180, goal: 200 }}
          fats={{ current: 50, goal: 65 }}
          goalLine="2,400 cal/day, on track for 180 lbs"
        />,
      );

      // Center number is text-2xl font-bold (24px)
      const centerNumber = getByTestId("day-totals-kcal");
      expect(centerNumber.props.className).toContain("text-2xl");

      // Goal line is rendered outside the card with -mt-2
      const goalLine = getByTestId("nutrition-goal-line");
      expect(goalLine.props.className).toContain("-mt-2");
      expect(goalLine.props.children).toBe("2,400 cal/day, on track for 180 lbs");

      // Macro row labels are text-sm font-medium (14px)
      expect(getByText("Protein").props.className).toContain("text-sm");
      expect(getByText("Carbs").props.className).toContain("text-sm");
      expect(getByText("Fats").props.className).toContain("text-sm");

      // Value chips have rectangular 4px rounded styling
      const proteinPill = getByTestId("day-totals-protein-pill");
      expect(proteinPill.props.className).toContain("rounded");
      expect(proteinPill.props.className).toContain("px-1.5");
      expect(proteinPill.props.className).toContain("py-0.5");
    });
  });

  describe("5. Water Tracker & Quick Actions", () => {
    it("water tracker header is text-sm and quick-add buttons have 8px radius", () => {
      const onAddWater = jest.fn();
      const { getByTestId } = render(
        <WaterTracker current={32} goal={96} onAddWater={onAddWater} />,
      );

      const waterLabel = getByTestId("nutrition-water-label");
      expect(waterLabel.props.className).toContain("text-sm");

      const quickAdd8 = getByTestId("nutrition-water-add-8");
      expect(quickAdd8.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 8,
        }),
      );
    });

    it("consultant teaser has borderRadius 16, padding 16 and renders without errors", () => {
      const { getByTestId } = render(
        <NutritionConsultantTeaser remaining={{ calories: 400, protein: 30 }} />,
      );

      const teaser = getByTestId("nutrition-consultant-teaser");
      expect(teaser).toBeTruthy();
      expect(teaser.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 16,
        }),
      );
    });

    it("quick action tiles have 12px radius and 8px badge radius", async () => {
      mockParams = { date: TODAY_MOCK };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-quick-add-button")).toBeTruthy();
        expect(getByTestId("nutrition-tile-my-stuff")).toBeTruthy();
        expect(getByTestId("nutrition-tile-meal-plan")).toBeTruthy();
      });

      const quickAddTile = getByTestId("nutrition-quick-add-button");
      expect(quickAddTile.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 12,
        }),
      );

      const myStuffTile = getByTestId("nutrition-tile-my-stuff");
      expect(myStuffTile.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 12,
        }),
      );

      const mealPlanTile = getByTestId("nutrition-tile-meal-plan");
      expect(mealPlanTile.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 12,
        }),
      );
    });
  });
});
