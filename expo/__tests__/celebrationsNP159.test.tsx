import React from "react";
import { render, fireEvent, renderHook, act, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import {
  StreakMilestoneModal,
  MILESTONE_LABELS,
  MILESTONE_MESSAGES,
} from "@/components/StreakMilestoneModal";
import {
  GoalAchievedModal,
  formatWeightWithUnit,
} from "@/components/GoalAchievedModal";
import { DashboardScreen } from "@/components/DashboardScreen";
import { StreaksScreen } from "@/components/streaks/StreaksScreen";
import type { GoalReached, StreaksPayload } from "@become/api-client";
import { apiFetch } from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";
import { createOfflineWrites } from "@/lib/offline/writes";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import type { ConnectivitySource } from "@/lib/offline/connectivity";
import type { TokenStore } from "@/lib/auth/secureStoreToken";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    token: "test-token",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

describe("NP-159: Streak milestone and goal-reached celebrations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
  });

  // ─── Acceptance Criterion 1: e015ca3f ──────────────────────────────────────
  describe("e015ca3f: Crossing the 7-day milestone natively shows the milestone modal once", () => {
    it("renders the 7-day milestone modal with label, days, motivational message, and Let's Keep Going button", () => {
      const onClose = jest.fn();
      const mockHaptic = jest.fn();

      const { getByTestId, getByText } = render(
        <StreakMilestoneModal
          visible={true}
          milestone={7}
          streakDays={7}
          onClose={onClose}
          haptic={mockHaptic}
          testID="streak-modal"
        />,
      );

      // Verify header and milestone copy
      expect(getByTestId("streak-modal-label")).toBeTruthy();
      expect(getByText("1-Week Streak!")).toBeTruthy();
      expect(getByTestId("streak-modal-days")).toBeTruthy();
      expect(getByText("7")).toBeTruthy();
      expect(getByText("days in a row")).toBeTruthy();
      expect(getByTestId("streak-modal-message")).toBeTruthy();
      expect(getByText("A full week. Most people quit before this.")).toBeTruthy();

      // Verify fire icon
      expect(getByTestId("streak-modal-fire")).toBeTruthy();
      expect(getByText("🔥")).toBeTruthy();

      // Verify haptic was triggered
      expect(mockHaptic).toHaveBeenCalledTimes(1);

      // Tap Let's Keep Going button
      const button = getByTestId("streak-modal-button");
      fireEvent.press(button);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("fires celebrationHaptic via expo-haptics notificationAsync by default", () => {
      render(
        <StreakMilestoneModal
          visible={true}
          milestone={7}
          streakDays={7}
          onClose={jest.fn()}
        />,
      );

      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });

    it("renders nothing when milestone is null or visible is false", () => {
      const { queryByTestId: query1 } = render(
        <StreakMilestoneModal
          visible={false}
          milestone={7}
          streakDays={7}
          onClose={jest.fn()}
          testID="streak-modal-hidden"
        />,
      );
      expect(query1("streak-modal-hidden-card")).toBeNull();

      const { queryByTestId: query2 } = render(
        <StreakMilestoneModal
          visible={true}
          milestone={null}
          streakDays={7}
          onClose={jest.fn()}
          testID="streak-modal-null"
        />,
      );
      expect(query2("streak-modal-null-card")).toBeNull();
    });

    it("supports all defined milestone levels and falls back gracefully", () => {
      const milestones = [3, 7, 14, 30, 50, 100, 200, 365];
      for (const m of milestones) {
        expect(MILESTONE_LABELS[m]).toBeDefined();
        expect(MILESTONE_MESSAGES[m]).toBeDefined();

        const { getByText } = render(
          <StreakMilestoneModal
            visible={true}
            milestone={m}
            streakDays={m}
            onClose={jest.fn()}
          />,
        );
        expect(getByText(`${MILESTONE_LABELS[m]}!`)).toBeTruthy();
        expect(getByText(MILESTONE_MESSAGES[m]!)).toBeTruthy();
      }

      // Fallback for custom milestone
      const { getByText: getCustom } = render(
        <StreakMilestoneModal
          visible={true}
          milestone={45}
          streakDays={45}
          onClose={jest.fn()}
        />,
      );
      expect(getCustom("45-Day Streak!")).toBeTruthy();
      expect(getCustom("You're on a serious run. Keep going.")).toBeTruthy();
    });

    it("dismisses on backdrop press", () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <StreakMilestoneModal
          visible={true}
          milestone={7}
          streakDays={7}
          onClose={onClose}
          testID="streak-modal"
        />,
      );

      fireEvent.press(getByTestId("streak-modal-backdrop"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("shows on StreaksScreen when milestoneCelebration prop is provided", () => {
      const onCloseCelebration = jest.fn();
      const samplePayload: StreaksPayload = {
        todayKey: "2026-10-02",
        minVisible: 3,
        overall: {
          current: 7,
          best: 7,
          freezes: 1,
          milestonesReached: [3, 7],
          nextMilestone: 14,
          activeToday: true,
          lastActivityDate: "2026-10-02",
        },
        pillars: {
          workout: { unit: "days", current: 2, best: 5, thisWeek: 2, target: 3, metThisWeek: false, weekLost: false, weeksOnTarget: 1, remainingThisWeek: 1 },
          nutrition: { unit: "days", current: 7, best: 7, activeToday: true },
          mindset: { unit: "days", current: 7, best: 7, activeToday: true },
          super: {
            unit: "days",
            current: 2,
            best: 4,
            activeToday: false,
            today: { nutrition: true, mindset: true, trained: false, restDay: false, weekOnTrack: true },
            freeze: { available: true, returnsOn: null, usedDays: [], frozenToday: false },
          },
        },
        credits: { workout: [], nutrition: [], mindset: [] },
      };

      const { getByTestId, getByText } = render(
        <StreaksScreen
          data={samplePayload}
          milestoneCelebration={7}
          onCloseMilestoneCelebration={onCloseCelebration}
        />,
      );

      expect(getByTestId("streaks-screen-milestone-modal-card")).toBeTruthy();
      expect(getByText("1-Week Streak!")).toBeTruthy();

      fireEvent.press(getByTestId("streaks-screen-milestone-modal-button"));
      expect(onCloseCelebration).toHaveBeenCalledTimes(1);
    });

    it("workout completion captures streak.newMilestone and exposes celebration controls", async () => {
      const store = createMemoryKeyValueStore();

      mockApiFetch.mockImplementation((path: string) => {
        const url = String(path);
        if (url.startsWith("/api/programs/current-workout")) {
          return Promise.resolve({
            workout: {
              title: "Full Body Workout",
              day: "Day 1",
              exercises: [
                {
                  exerciseSlug: "squat",
                  name: "Barbell Squat",
                  sets: 1,
                  reps: "5",
                  trackingType: "reps_weight",
                  targetWeightLbs: 225,
                },
              ],
            },
          });
        }
        if (url.startsWith("/api/workouts")) {
          return Promise.resolve({
            success: true,
            streak: {
              streakDays: 7,
              streakExtended: true,
              newMilestone: 7,
              freezeUsed: false,
              longestStreak: 7,
            },
          });
        }
        return Promise.resolve({});
      });

      const { result } = renderHook(() =>
        useLiveWorkout("prog_1", "Day 1", undefined, {
          cacheStore: store,
          initialOriginKey: "2026-10-02",
          getNow: () => new Date("2026-10-02T10:00:00Z"),
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Complete the workout
      await act(async () => {
        await result.current.onFinish();
      });

      // Crossing 7-day milestone sets streakMilestone
      expect(result.current.streakMilestone).toBe(7);
      expect(result.current.workoutStreakDays).toBe(7);

      // Clearing dismisses celebration
      act(() => {
        result.current.clearStreakMilestone();
      });
      expect(result.current.streakMilestone).toBeNull();
    });
  });

  // ─── Acceptance Criterion 2: e015ca40 ──────────────────────────────────────
  describe("e015ca40: A weigh-in that reaches the goal shows the goal-reached modal and the goal tile updates", () => {
    const sampleGoalReached: GoalReached = {
      pillar: "nutrition",
      direction: "lose",
      unit: "lbs",
      targetWeight: 175,
      startWeight: 190,
      currentWeight: 175,
      totalChange: 15,
      days: 42,
    };

    it("renders the goal-reached modal with trophy, current weight, timeline and actions", () => {
      const onClose = jest.fn();
      const onSetNextGoal = jest.fn();
      const mockHaptic = jest.fn();

      const { getByTestId, getByText } = render(
        <GoalAchievedModal
          visible={true}
          reached={sampleGoalReached}
          onClose={onClose}
          onSetNextGoal={onSetNextGoal}
          haptic={mockHaptic}
          testID="goal-modal"
        />,
      );

      // Verify header, trophy, weight and timeline
      expect(getByTestId("goal-modal-trophy-badge")).toBeTruthy();
      expect(getByTestId("goal-modal-headline")).toBeTruthy();
      expect(getByText("Goal Reached!")).toBeTruthy();

      expect(getByTestId("goal-modal-current-weight")).toBeTruthy();
      expect(getByText("175 lbs")).toBeTruthy();

      expect(getByTestId("goal-modal-timeline")).toBeTruthy();
      expect(getByText(/190 lbs → 175 lbs/)).toBeTruthy();
      expect(getByText(/15 lbs lost in 42 days/)).toBeTruthy();

      // Verify message
      expect(getByTestId("goal-modal-message")).toBeTruthy();
      expect(getByText(/That's every meal logged, every workout shown up for/)).toBeTruthy();

      // Verify haptic was triggered
      expect(mockHaptic).toHaveBeenCalledTimes(1);

      // Verify Set Your Next Goal button
      const nextBtn = getByTestId("goal-modal-set-next-goal");
      fireEvent.press(nextBtn);
      expect(onSetNextGoal).toHaveBeenCalledTimes(1);

      // Verify Keep going button
      const keepBtn = getByTestId("goal-modal-keep-going");
      fireEvent.press(keepBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("fires celebrationHaptic via expo-haptics notificationAsync by default", () => {
      render(
        <GoalAchievedModal
          visible={true}
          reached={sampleGoalReached}
          onClose={jest.fn()}
        />,
      );

      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });

    it("formats timeline for gain direction correctly", () => {
      const gainGoal: GoalReached = {
        pillar: "nutrition",
        direction: "gain",
        unit: "kg",
        targetWeight: 80,
        startWeight: 75,
        currentWeight: 80.2,
        totalChange: 5.2,
        days: 60,
      };

      const { getByText } = render(
        <GoalAchievedModal
          visible={true}
          reached={gainGoal}
          onClose={jest.fn()}
        />,
      );

      expect(getByText("80.2 kg")).toBeTruthy();
      expect(getByText(/75 kg → 80 kg/)).toBeTruthy();
      expect(getByText(/5.2 kg gained in 60 days/)).toBeTruthy();
    });

    it("renders nothing when reached is null or visible is false", () => {
      const { queryByTestId: query1 } = render(
        <GoalAchievedModal
          visible={false}
          reached={sampleGoalReached}
          onClose={jest.fn()}
          testID="goal-modal-hidden"
        />,
      );
      expect(query1("goal-modal-hidden-card")).toBeNull();

      const { queryByTestId: query2 } = render(
        <GoalAchievedModal
          visible={true}
          reached={null}
          onClose={jest.fn()}
          testID="goal-modal-null"
        />,
      );
      expect(query2("goal-modal-null-card")).toBeNull();
    });

    it("renders both celebration modals on DashboardScreen when triggered", () => {
      const onCloseMilestone = jest.fn();
      const onCloseGoal = jest.fn();
      const onSetNextGoal = jest.fn();

      const statData: DashboardStatData = {
        streakDays: 7,
        todaysMood: 4,
        recentMoods: [4],
        thisWeekWorkouts: 2,
        weeklyTarget: 3,
        fitnessGoal: "lose_weight",
        nutritionDirection: "lose",
        targetWeightKg: 79.3,
        startWeightKg: 86.1,
        latestWeight: 175,
        earliestWeight: 190,
        weightUnit: "lbs",
        pace: { status: "on", eta: "reached", behindByKg: 0 },
        caloriesConsumed: 1800,
        caloriesGoal: 2000,
        waterCurrent: 64,
        waterGoal: 64,
        totalWorkouts: 25,
        weightEntries: [{ date: "2026-10-02", value: 175 }],
      };

      const { getByTestId, getByText } = render(
        <DashboardScreen
          streakDays={7}
          todayWorkout={null}
          onStartWorkout={jest.fn()}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
          onSubmitWeight={jest.fn()}
          onSubmitMood={jest.fn()}
          statData={statData}
          milestoneCelebration={7}
          onCloseMilestoneCelebration={onCloseMilestone}
          goalCelebration={sampleGoalReached}
          onCloseGoalCelebration={onCloseGoal}
          onSetNextGoal={onSetNextGoal}
        />,
      );

      // Milestone modal is visible
      expect(getByTestId("dashboard-streak-milestone-modal-card")).toBeTruthy();
      expect(getByText("1-Week Streak!")).toBeTruthy();

      // Goal achieved modal is visible
      expect(getByTestId("dashboard-goal-achieved-modal-card")).toBeTruthy();
      expect(getByText("Goal Reached!")).toBeTruthy();
      expect(getByText("175 lbs")).toBeTruthy();

      // Tap dismiss on milestone modal
      fireEvent.press(getByTestId("dashboard-streak-milestone-modal-button"));
      expect(onCloseMilestone).toHaveBeenCalledTimes(1);

      // Tap keep going on goal modal
      fireEvent.press(getByTestId("dashboard-goal-achieved-modal-keep-going"));
      expect(onCloseGoal).toHaveBeenCalledTimes(1);

      // Tap set next goal on goal modal
      fireEvent.press(getByTestId("dashboard-goal-achieved-modal-set-next-goal"));
      expect(onSetNextGoal).toHaveBeenCalledTimes(1);
    });

    it("verifies formatWeightWithUnit handles integer and floating point correctly", () => {
      expect(formatWeightWithUnit(175, "lbs")).toBe("175 lbs");
      expect(formatWeightWithUnit(175.0, "lbs")).toBe("175 lbs");
      expect(formatWeightWithUnit(175.4, "lbs")).toBe("175.4 lbs");
      expect(formatWeightWithUnit(80.2, "kg")).toBe("80.2 kg");
    });
  });

  // ─── Offline Writes Response Parsing ───────────────────────────────────────
  describe("Offline writes parses streak.newMilestone and goalReached from responses", () => {
    function makeWritesMock() {
      const storageMap = new Map<string, string>();
      const storage: AsyncStorageLike = {
        getItem: jest.fn(async (k) => storageMap.get(k) ?? null),
        setItem: jest.fn(async (k, v) => { storageMap.set(k, v); }),
        removeItem: jest.fn(async (k) => { storageMap.delete(k); }),
      };
      const connectivity: ConnectivitySource = {
        isConnected: jest.fn(async () => true),
        subscribe: jest.fn(() => () => {}),
      };
      const tokenStore: TokenStore = {
        get: jest.fn(async () => "test-token"),
        set: jest.fn(async () => {}),
        clear: jest.fn(async () => {}),
      };

      const writes = createOfflineWrites({
        storage,
        connectivity,
        tokenStore,
        baseUrl: "https://example.com",
        maxRetries: 1,
        initialBackoffMs: 1,
        maxBackoffMs: 1,
      });

      return { writes };
    }

    it("captures streak.newMilestone from mood logging response", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        date: "2026-10-02",
        applied: true,
        streak: {
          streakDays: 7,
          streakExtended: true,
          newMilestone: 7,
        },
      });

      const { writes } = makeWritesMock();
      let capturedResponse: unknown = null;

      const status = await writes.logMood(4, {
        onResponse: (r) => { capturedResponse = r; },
      });

      expect(status).toBe("sent");
      const lastMood = writes.getLastMoodResponse();
      expect(lastMood).toBeDefined();
      expect(lastMood?.streak?.newMilestone).toBe(7);
      expect(lastMood?.streak?.streakDays).toBe(7);
      expect(capturedResponse).toEqual(lastMood);
    });

    it("captures goalReached and streak.newMilestone from weight logging response", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        date: "2026-10-02",
        applied: true,
        streak: {
          streakDays: 14,
          streakExtended: true,
          newMilestone: 14,
        },
        goalReached: {
          pillar: "nutrition",
          direction: "lose",
          unit: "lbs",
          targetWeight: 175,
          startWeight: 190,
          currentWeight: 175,
          totalChange: 15,
          days: 42,
        },
      });

      const { writes } = makeWritesMock();
      let capturedResponse: unknown = null;

      const status = await writes.logWeight(175, {
        onResponse: (r) => { capturedResponse = r; },
      });

      expect(status).toBe("sent");
      const lastWeight = writes.getLastWeightResponse();
      expect(lastWeight).toBeDefined();
      expect(lastWeight?.streak?.newMilestone).toBe(14);
      expect(lastWeight?.goalReached).toBeDefined();
      expect(lastWeight?.goalReached?.currentWeight).toBe(175);
      expect(lastWeight?.goalReached?.targetWeight).toBe(175);
      expect(capturedResponse).toEqual(lastWeight);
    });
  });
});
