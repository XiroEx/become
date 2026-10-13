import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { MoodGatewayBanner } from "@/components/dashboard/MoodGatewayBanner";
import { DashboardScreen } from "@/components/DashboardScreen";
import { moodGateway, type MoodLevel } from "@become/core";
import type { MindSummaryResponse } from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const MOCK_MIND: MindSummaryResponse = {
  todayKey: "2026-10-02",
  level: 3,
  levelPct: 50,
  chapter: 1,
  chapterName: "Introduction",
  sessionsIntoChapter: 2,
  sessionsPerChapter: 5,
  sessionDoneToday: false,
  mainSessionAvailable: true,
  sessionsLast7Days: 2,
  moodCheckinsLast7Days: 3,
  todayMood: null,
  lastState: null,
};

describe("Mood to Mind Gateway Banner (NP-158, id: e015ca3b)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe("Standalone MoodGatewayBanner with moodBridge wording", () => {
    const moods: MoodLevel[] = [1, 2, 3, 4, 5];

    test.each(moods)(
      "(id: e015ca3b) renders exact headline and body from moodBridge.ts for mood %i",
      (m) => {
        const expected = moodGateway(m);
        const { getByTestId, getByText } = render(
          <MoodGatewayBanner mood={m} onDismiss={() => {}} />,
        );

        expect(getByTestId("mood-gateway-banner")).toBeTruthy();
        expect(getByText(new RegExp(expected.headline))).toBeTruthy();
        expect(getByText(new RegExp(expected.body))).toBeTruthy();
        expect(getByText("Mindset")).toBeTruthy();
      },
    );

    it("(id: e015ca3b) opens the Mind tab when Mindset CTA is pressed", () => {
      const onOpenMind = jest.fn();
      const { getByTestId } = render(
        <MoodGatewayBanner mood={3} onDismiss={() => {}} onOpenMind={onOpenMind} />,
      );

      fireEvent.press(getByTestId("mood-gateway-banner-cta"));
      expect(onOpenMind).toHaveBeenCalledTimes(1);
    });

    it("falls back to router.push(/(tabs)/mind) when onOpenMind is omitted", () => {
      const { getByTestId } = render(
        <MoodGatewayBanner mood={3} onDismiss={() => {}} />,
      );

      fireEvent.press(getByTestId("mood-gateway-banner-cta"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind");
    });

    it("calls onDismiss when dismiss button is pressed", () => {
      const onDismiss = jest.fn();
      const { getByTestId } = render(
        <MoodGatewayBanner mood={3} onDismiss={onDismiss} />,
      );

      fireEvent.press(getByTestId("mood-gateway-banner-dismiss"));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("Dashboard integration", () => {
    it("(id: e015ca3b) gateway line appears under tiles after check-in closes with a mood", async () => {
      const onOpenMind = jest.fn();
      const onSubmitCheckIn = jest.fn();

      const { getByTestId, queryByTestId, getByText } = render(
        <DashboardScreen
          streakDays={2}
          todayWorkout={null}
          onStartWorkout={() => {}}
          onOpenCalendar={() => {}}
          onSubmitCheckIn={onSubmitCheckIn}
          onOpenMind={onOpenMind}
          checkInOpen={true}
          mind={MOCK_MIND}
        />,
      );

      // Initially, no gateway banner before mood is logged
      expect(queryByTestId("mood-gateway-banner")).toBeNull();

      // Submit check-in modal with mood 4 ("Pretty Good")
      // In CheckInModal: select mood 4 then press Save
      fireEvent.press(getByText("Pretty Good"));
      fireEvent.press(getByTestId("dashboard-checkin-modal-submit"));

      await waitFor(() => {
        expect(onSubmitCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({ mood: 4 }),
        );
      });

      // The gateway banner now appears once
      await waitFor(() => {
        expect(getByTestId("mood-gateway-banner")).toBeTruthy();
      });

      // Shows mood 4 copy from moodBridge
      const copy4 = moodGateway(4);
      expect(getByText(new RegExp(copy4.headline))).toBeTruthy();
      expect(getByText(new RegExp(copy4.body))).toBeTruthy();

      // Pressing CTA opens Mind tab
      fireEvent.press(getByTestId("mood-gateway-banner-cta"));
      expect(onOpenMind).toHaveBeenCalledTimes(1);

      // Dismissing removes it
      fireEvent.press(getByTestId("mood-gateway-banner-dismiss"));
      expect(queryByTestId("mood-gateway-banner")).toBeNull();
    });

    it("(id: e015ca3b) gateway line hides once today's Mind session is done", () => {
      const { queryByTestId } = render(
        <DashboardScreen
          streakDays={2}
          todayWorkout={null}
          onStartWorkout={() => {}}
          onOpenCalendar={() => {}}
          onSubmitCheckIn={() => {}}
          gatewayMood={2}
          mind={{
            ...MOCK_MIND,
            sessionDoneToday: true,
          }}
        />,
      );

      // Even with gatewayMood=2, sessionDoneToday hides the gateway banner
      expect(queryByTestId("mood-gateway-banner")).toBeNull();
    });

    it("(id: e015ca3b) is gone on next load (clean initial state)", () => {
      const { queryByTestId } = render(
        <DashboardScreen
          streakDays={2}
          todayWorkout={null}
          onStartWorkout={() => {}}
          onOpenCalendar={() => {}}
          onSubmitCheckIn={() => {}}
          mind={MOCK_MIND}
        />,
      );

      // On a fresh mount/load with no gatewayMood passed, banner is absent
      expect(queryByTestId("mood-gateway-banner")).toBeNull();
    });
  });
});
