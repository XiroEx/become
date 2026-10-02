import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { PlanCard, DASHBOARD_PLAN_METERS } from "@/components/dashboard/PlanCard";
import { DashboardScreen } from "@/components/DashboardScreen";
import type { EntitlementsSnapshot } from "@become/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockEntitlementsData: EntitlementsSnapshot | null = null;
jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    ...actual,
    useEntitlements: () => ({
      data: mockEntitlementsData,
      loading: false,
      enforced: mockEntitlementsData?.enforced ?? false,
      refresh: jest.fn(),
      feature: jest.fn(),
      canCreate: jest.fn(),
    }),
  };
});

const FREE_SNAPSHOT: EntitlementsSnapshot = {
  role: "member",
  tier: "free",
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {
    "ai-food-estimate": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: 1,
      used: 0,
      remaining: 1,
      resetsAt: null,
      window: "day",
    },
    "workout-generation": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: 3,
      used: 1,
      remaining: 2,
      resetsAt: null,
      window: "week",
    },
    "custom-programs": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: 3,
      used: 2,
      remaining: 1,
      resetsAt: null,
      window: "lifetime",
    },
    "mind-sessions": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: 10,
      used: 4,
      remaining: 6,
      resetsAt: null,
      window: "lifetime",
    },
  },
};

const PLUS_SNAPSHOT: EntitlementsSnapshot = {
  role: "member",
  tier: "plus",
  enforced: true,
  grandfathered: false,
  subscription: {
    status: "active",
    currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
  checkoutAvailable: false,
  features: {
    "ai-food-estimate": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: null,
      used: 5,
      remaining: null,
      resetsAt: null,
      window: "day",
    },
  },
};

describe("Dashboard Plan Meters Card (NP-158, id: e015ca3a)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockEntitlementsData = null;
  });

  it("(id: e015ca3a) The plan card is absent when entitlements are not enforced (null snapshot)", () => {
    mockEntitlementsData = null;
    const { queryByTestId } = render(<PlanCard />);
    expect(queryByTestId("dashboard-plan-card")).toBeNull();
  });

  it("(id: e015ca3a) The plan card is absent when enforced is false", () => {
    mockEntitlementsData = { ...FREE_SNAPSHOT, enforced: false };
    const { queryByTestId } = render(<PlanCard />);
    expect(queryByTestId("dashboard-plan-card")).toBeNull();
  });

  it("(id: e015ca3a) Shows the same four meters as the web for a free member when enforced is true", () => {
    mockEntitlementsData = FREE_SNAPSHOT;
    const { getByTestId, getByText } = render(<PlanCard />);

    expect(getByTestId("dashboard-plan-card")).toBeTruthy();
    expect(getByText("Free plan")).toBeTruthy();
    expect(getByText("See Plus")).toBeTruthy();

    // Verify exactly the 4 web meters
    expect(DASHBOARD_PLAN_METERS.map((m) => m.feature)).toEqual([
      "ai-food-estimate",
      "workout-generation",
      "custom-programs",
      "mind-sessions",
    ]);

    // 1. AI food scans with 'today' suffix
    expect(getByText("AI food scans")).toBeTruthy();
    expect(getByTestId("plan-meter-ai-food-estimate-count").props.children).toContain("0/1 today");

    // 2. Workout generations with 'this week' suffix
    expect(getByText("Workout generations")).toBeTruthy();
    expect(getByTestId("plan-meter-workout-generation-count").props.children).toContain("1/3 this week");

    // 3. Custom programs
    expect(getByText("Custom programs")).toBeTruthy();
    expect(getByTestId("plan-meter-custom-programs-count").props.children).toContain("2/3");

    // 4. Mind sessions
    expect(getByText("Mind sessions")).toBeTruthy();
    expect(getByTestId("plan-meter-mind-sessions-count").props.children).toContain("4/10");
  });

  it("navigates to /plan when See Plus is pressed", () => {
    mockEntitlementsData = FREE_SNAPSHOT;
    const onOpenPlan = jest.fn();
    const { getByTestId } = render(<PlanCard onOpenPlan={onOpenPlan} />);

    fireEvent.press(getByTestId("dashboard-plan-card-see-plus"));
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it("navigates via router.push(/plan) when onOpenPlan prop is not provided", () => {
    mockEntitlementsData = FREE_SNAPSHOT;
    const { getByTestId } = render(<PlanCard />);

    fireEvent.press(getByTestId("dashboard-plan-card-see-plus"));
    expect(mockPush).toHaveBeenCalledWith("/plan");
  });

  it("renders Plus state when member has Plus and navigates to /plan on press", () => {
    mockEntitlementsData = PLUS_SNAPSHOT;
    const { getByTestId, getByText } = render(<PlanCard />);

    expect(getByTestId("dashboard-plan-card")).toBeTruthy();
    expect(getByText("Plus — everything unlocked")).toBeTruthy();

    fireEvent.press(getByTestId("dashboard-plan-card"));
    expect(mockPush).toHaveBeenCalledWith("/plan");
  });

  it("renders spent meter with amber styling and bar when remaining is 0", () => {
    mockEntitlementsData = {
      ...FREE_SNAPSHOT,
      features: {
        ...FREE_SNAPSHOT.features,
        "ai-food-estimate": {
          ...FREE_SNAPSHOT.features["ai-food-estimate"]!,
          used: 1,
          remaining: 0,
          canCreate: false,
        },
      },
    };
    const { getByTestId } = render(<PlanCard />);
    const bar = getByTestId("plan-meter-ai-food-estimate-bar");
    expect(bar.props.className).toContain("bg-amber-500");
    const count = getByTestId("plan-meter-ai-food-estimate-count");
    expect(count.props.className).toContain("text-amber-600");
  });

  it("renders inside DashboardScreen at the bottom of the card stack", () => {
    mockEntitlementsData = FREE_SNAPSHOT;
    const { getByTestId, getByText } = render(
      <DashboardScreen
        streakDays={1}
        todayWorkout={null}
        onStartWorkout={() => {}}
        onOpenCalendar={() => {}}
        onSubmitCheckIn={() => {}}
      />,
    );

    expect(getByTestId("dashboard-plan-card")).toBeTruthy();
    expect(getByText("Free plan")).toBeTruthy();
  });
});
