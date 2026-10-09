/* eslint-disable import/first */
import { render } from "@testing-library/react-native";
import { CalorieRing } from "../components/nutrition/CalorieRing";
import { DateNav } from "../components/nutrition/DateNav";
import { WaterTracker } from "../components/nutrition/WaterTracker";
import { NutritionConsultantTeaser } from "../components/nutrition/NutritionConsultantTeaser";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
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
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn().mockImplementation((path: string) => {
      if (path.includes("/api/nutrition/day/")) {
        return Promise.resolve({
          date: "2026-06-03",
          logs: [],
          dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
        });
      }
      if (path.includes("/api/nutrition/goals")) {
        return Promise.resolve({
          calories: 2000,
          protein: 150,
          carbs: 200,
          fats: 65,
          waterGoal: 64,
        });
      }
      if (path.includes("/api/nutrition/tags")) {
        return Promise.resolve({ tags: ["breakfast", "lunch", "dinner", "snack"] });
      }
      if (path.includes("/api/nutrition/plans/day/")) {
        return Promise.resolve({ date: "2026-06-03", plans: [] });
      }
      if (path.includes("/api/profile")) {
        return Promise.resolve({
          profile: { targetWeight: { weight: 175, unit: "lbs", direction: "lose", paceStatus: "on_track" } },
        });
      }
      return Promise.resolve({});
    }),
  };
});

import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

describe("NP-370: Spacing/typography/layout native vs web parity", () => {
  describe("1. Header Chrome & View Selector", () => {
    it("renders subtitle with text-sm (14px) and buttons with 40px height and rounded-xl (12px)", async () => {
      mockParams = {};
      const { getByTestId, queryByTestId, getByText } = render(<NutritionIndexRoute />);

      // Subtitle is text-sm mt-1 (14px vs 12px)
      const subtitle = getByText("Track your food, macros, and hydration");
      expect(subtitle.props.className).toContain("text-sm");
      expect(subtitle.props.className).toContain("mt-1");

      // My Stuff button: 40px height, rounded-xl (12px radius)
      const myStuffBtn = getByTestId("nutrition-my-stuff-button");
      expect(myStuffBtn.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
        }),
      );

      // Timeline button: 40px height, rounded-xl (12px radius)
      const timelineBtn = getByTestId("nutrition-timeline-button");
      expect(timelineBtn.props.style).toEqual(
        expect.objectContaining({
          height: 40,
          borderRadius: 12,
        }),
      );

      // 3-segment Day/Week/Month selector removed from day tab
      expect(queryByTestId("nutrition-view-selector")).toBeNull();
    });
  });

  describe("2. Search & Quick Capture Row", () => {
    it("renders search input, camera button, and upload button at 40px height with 20px icons", async () => {
      mockParams = {};
      const { getByTestId } = render(<NutritionIndexRoute />);

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
    it("renders date label as text-sm (14px), chevron 14px, and 'Today' as plain text uppercase", () => {
      const { getByTestId } = render(
        <DateNav
          dateKey="2026-06-03"
          isToday={true}
          onPrev={jest.fn()}
          onNext={jest.fn()}
        />,
      );

      const dateLabel = getByTestId("nutrition-current-date");
      expect(dateLabel.props.className).toContain("text-sm");

      const todayBadge = getByTestId("nutrition-today-badge");
      // Plain text instead of pill badge
      expect(todayBadge.props.className).toContain("text-[10px]");
      expect(todayBadge.props.className).toContain("font-medium");
      expect(todayBadge.props.className).toContain("uppercase");
      expect(todayBadge.props.className).not.toContain("rounded-full");
      expect(todayBadge.props.className).not.toContain("bg-emerald-500/10");
    });
  });

  describe("4. Calorie Ring & Goal Line", () => {
    it("renders center number as text-2xl font-bold, goal line outside card below it, macro track at h-2.5, labels at text-sm font-medium, and 4px rounded chips", () => {
      const { getByTestId } = render(
        <CalorieRing
          consumed={1200}
          goal={2000}
          protein={{ current: 100, goal: 150 }}
          carbs={{ current: 150, goal: 200 }}
          fats={{ current: 50, goal: 65 }}
          goalLine="2,000 cal/day, on track for 175 lbs"
        />,
      );

      // Center number is text-2xl font-bold (24px)
      const centerNumber = getByTestId("day-totals-kcal");
      expect(centerNumber.props.className).toContain("text-2xl font-bold");

      // Goal line is rendered outside card below it with -mt-2 text-center text-xs
      const goalLine = getByTestId("nutrition-goal-line");
      expect(goalLine.props.children).toBe("2,000 cal/day, on track for 175 lbs");
      expect(goalLine.props.className).toContain("-mt-2");
      expect(goalLine.props.className).toContain("text-center");
      expect(goalLine.props.className).toContain("text-xs");

      // Macro tracks are h-2.5 (10px height)
      const proteinTrack = getByTestId("macro-track-protein");
      expect(proteinTrack.props.className).toContain("h-2.5");

      // Macro chips have 4px rectangular radius
      const proteinPill = getByTestId("day-totals-protein-pill");
      expect(proteinPill.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 4,
        }),
      );
    });
  });

  describe("5. Water Tracker & Quick Actions", () => {
    it("renders WaterTracker header at text-sm and quick-add buttons with 8px radius and muted background", () => {
      const { getByTestId } = render(
        <WaterTracker
          current={32}
          goal={64}
          onAddWater={jest.fn()}
        />,
      );

      const headerLabel = getByTestId("nutrition-water-label");
      expect(headerLabel.props.className).toContain("text-sm");

      const add8Btn = getByTestId("nutrition-water-add-8");
      expect(add8Btn.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 8,
        }),
      );
    });

    it("renders Consultant teaser with 16px radius, 16px padding, and 40x40 rounded-xl (12px) badge", () => {
      const { getByTestId } = render(<NutritionConsultantTeaser />);
      const teaser = getByTestId("nutrition-consultant-teaser");
      expect(teaser.props.style).toEqual(
        expect.objectContaining({
          borderRadius: 16,
        }),
      );
    });

    it("renders quick action tiles with 8px radius icon badges", async () => {
      mockParams = {};
      const { getByTestId } = render(<NutritionIndexRoute />);

      const quickAddBtn = getByTestId("nutrition-quick-add-button");
      const quickAddBadge = quickAddBtn.findByProps({ className: "bg-green-100 dark:bg-green-900/30" });
      expect(quickAddBadge.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 8,
        }),
      );

      const myStuffTile = getByTestId("nutrition-tile-my-stuff");
      const myStuffBadge = myStuffTile.findByProps({ className: "bg-orange-100 dark:bg-orange-900/30" });
      expect(myStuffBadge.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 8,
        }),
      );

      const mealPlanTile = getByTestId("nutrition-tile-meal-plan");
      const mealPlanBadge = mealPlanTile.findByProps({ className: "bg-blue-100 dark:bg-blue-900/30" });
      expect(mealPlanBadge.props.style).toEqual(
        expect.objectContaining({
          width: 40,
          height: 40,
          borderRadius: 8,
        }),
      );
    });
  });
});
