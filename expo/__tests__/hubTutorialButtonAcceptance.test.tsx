/* eslint-disable import/first */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Jon Don",
      email: "jon@example.com",
      profileIcon: "summit",
      avatarUrl: null,
    },
    token: "test-jwt",
    status: "signed-in",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn().mockImplementation(async (path: string) => {
      if (path === "/api/mind/state") {
        return {
          currentDay: 1,
          streak: 3,
          level: 1,
          levelXp: 10,
          levelProgress: { current: 10, needed: 100, pct: 0.1 },
          lastMainSessionAt: null,
          mainSessionAvailable: true,
          locked: false,
        };
      }
      if (path === "/api/mind/identity") {
        return {
          profile: { onboardingCompleted: true },
          identityStatements: [],
        };
      }
      if (path.startsWith("/api/mind/session")) {
        return { streak: 3, lastBreathAt: null, mainSessionAvailable: true };
      }
      if (path.startsWith("/api/mind/progress")) {
        return { chapter: 1, xp: 50 };
      }
      if (path.startsWith("/api/nutrition/day")) {
        return { logs: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 };
      }
      if (path.startsWith("/api/nutrition/goals")) {
        return { calories: 2000, protein: 150, carbs: 200, fat: 65 };
      }
      if (path.startsWith("/api/nutrition/schedule")) {
        return { windows: [] };
      }
      if (path.startsWith("/api/nutrition/progress")) {
        return { streak: 1 };
      }
      if (path === "/api/profile") {
        return { name: "Jon Don", email: "jon@example.com", onboardingCompleted: true };
      }
      if (path === "/api/dashboard/tiles") {
        return { tiles: [], sections: [] };
      }
      if (path === "/api/dashboard") {
        return { activePrograms: [], streak: { current: 3 }, todayWorkout: null };
      }
      if (path === "/api/me/consent") {
        return { consentGiven: true };
      }
      return {};
    }),
  };
});

import { NativeTourOverlay } from "@/components/tour/NativeTourOverlay";
import {
  NATIVE_TOUR_HUBS,
  NATIVE_TOUR_PROGRESS_KEY,
  WEB_TOUR_PROGRESS_KEY,
} from "@/lib/tour/tourConfig";
import {
  getNativeTourProgress,
  hasSettledNativeTour,
  resetNativeTourProgress,
  setNativeTourStatus,
} from "@/lib/tour/nativeTourProgress";
import * as tourRequest from "@/lib/tour/nativeTourRequest";
import {
  requestNativeTourHub,
  requestNativeTourReplay,
  subscribeNativeTourHubRequests,
} from "@/lib/tour/nativeTourRequest";
import { createMemoryAsyncStorage, type AsyncStorageLike } from "@/lib/query/persistor";
import { DashboardScreen } from "@/components/DashboardScreen";
import ProgrammingIndexRoute from "@/app/(app)/(tabs)/programming/index";
import NutritionIndexRoute from "@/app/(app)/(tabs)/nutrition/index";
import MindRoute from "@/app/(app)/(tabs)/mind/index";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
/* eslint-enable import/first */

describe("Hub Tutorial Button Acceptance (card 96d41010)", () => {
  let storage: AsyncStorageLike;
  let onLoaded: jest.Mock;

  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
    storage = createMemoryAsyncStorage();
    onLoaded = jest.fn();
  });

  async function renderOverlayLoaded() {
    const utils = render(
      <NativeTourOverlay storage={storage} onLoaded={onLoaded} />,
    );
    await waitFor(() => expect(onLoaded).toHaveBeenCalled(), { timeout: 10000 });
    return utils;
  }

  describe("(id: 96d41011) Each of the five hubs has Help in the avatar menu with an accessibility label", () => {
    async function openMenuAndHelp(
      renderResult: ReturnType<typeof render>,
    ) {
      const { getByTestId, findByTestId } = renderResult;
      fireEvent.press(getByTestId("page-header-avatar-button"));
      const button = await findByTestId("page-header-help-item");
      return button;
    }

    it("DashboardScreen menu has Help with accessibility label and role", async () => {
      const hubSpy = jest.spyOn(tourRequest, "requestNativeTourHub");
      const rendered = render(
        <DashboardScreen
          streakDays={5}
          todayWorkout={null}
          onStartWorkout={jest.fn()}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
        />,
      );

      const button = await openMenuAndHelp(rendered);
      expect(button).toBeTruthy();
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityLabel).toBe("Help");

      fireEvent.press(button);
      expect(hubSpy).toHaveBeenCalledWith("dashboard");
      hubSpy.mockRestore();
    });

    it("ProgrammingIndexRoute menu has Help with accessibility label and role", async () => {
      const hubSpy = jest.spyOn(tourRequest, "requestNativeTourHub");
      const rendered = render(<ProgrammingIndexRoute />);

      const button = await openMenuAndHelp(rendered);
      expect(button).toBeTruthy();
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityLabel).toBe("Help");

      fireEvent.press(button);
      expect(hubSpy).toHaveBeenCalledWith("programming");
      hubSpy.mockRestore();
    });

    it("NutritionIndexRoute menu has Help with accessibility label and role", async () => {
      const hubSpy = jest.spyOn(tourRequest, "requestNativeTourHub");
      const rendered = render(<NutritionIndexRoute />);

      const button = await openMenuAndHelp(rendered);
      expect(button).toBeTruthy();
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityLabel).toBe("Help");

      fireEvent.press(button);
      expect(hubSpy).toHaveBeenCalledWith("nutrition");
      hubSpy.mockRestore();
    });

    it("MindRoute menu has Help with accessibility label and role", async () => {
      const hubSpy = jest.spyOn(tourRequest, "requestNativeTourHub");
      const rendered = render(<MindRoute />);

      const button = await openMenuAndHelp(rendered);
      expect(button).toBeTruthy();
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityLabel).toBe("Help");

      fireEvent.press(button);
      expect(hubSpy).toHaveBeenCalledWith("mind");
      hubSpy.mockRestore();
    });

    it("ProfileScreen menu has Help with accessibility label and role", async () => {
      const hubSpy = jest.spyOn(tourRequest, "requestNativeTourHub");
      const rendered = render(<ProfileScreen />);

      const button = await openMenuAndHelp(rendered);
      expect(button).toBeTruthy();
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityLabel).toBe("Help");

      fireEvent.press(button);
      expect(hubSpy).toHaveBeenCalledWith("profile");
      hubSpy.mockRestore();
    });
  });

  describe("(id: 96d41012) Tapping it shows only that hub's card, using the copy already in NATIVE_TOUR_HUBS", () => {
    it.each(NATIVE_TOUR_HUBS)(
      "shows only the '$id' hub's card with its exact title and description",
      async (hub) => {
        // Tour settled upfront
        await setNativeTourStatus("completed", storage);
        const { getByTestId, queryByTestId } = await renderOverlayLoaded();

        expect(queryByTestId("native-tour-prompt")).toBeNull();
        expect(queryByTestId("native-tour-step")).toBeNull();

        act(() => {
          requestNativeTourHub(hub.id);
        });

        // The card for this hub is visible
        expect(getByTestId("native-tour-step")).toBeTruthy();
        expect(getByTestId("native-tour-step-title").props.children).toBe(hub.title);
        expect(getByTestId("native-tour-step-body").props.children).toBe(hub.description);

        // Does NOT show multi-step indicator or advance buttons
        expect(queryByTestId("native-tour-step-count")).toBeNull();
        expect(queryByTestId("native-tour-step-next")).toBeNull();
        expect(queryByTestId("native-tour-step-back")).toBeNull();
        expect(queryByTestId("native-tour-step-skip")).toBeNull();

        // Shows "Done" button to dismiss
        expect(getByTestId("native-tour-step-done")).toBeTruthy();

        // Dismissing via Done closes the modal
        fireEvent.press(getByTestId("native-tour-step-done"));
        expect(queryByTestId("native-tour-step")).toBeNull();

        // No router navigation was triggered
        expect(mockReplace).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      },
    );

    it("can also be dismissed via the backdrop", async () => {
      await setNativeTourStatus("completed", storage);
      const { getByTestId, queryByTestId } = await renderOverlayLoaded();

      act(() => {
        requestNativeTourHub("dashboard");
      });
      expect(getByTestId("native-tour-step")).toBeTruthy();

      fireEvent.press(getByTestId("native-tour-step-backdrop"));
      expect(queryByTestId("native-tour-step")).toBeNull();
    });
  });

  describe("(id: 96d41013) Using it never marks the tour settled and never re-prompts the full tour", () => {
    it("when tour was already settled, viewing and closing a solo hub card leaves status settled without re-prompting", async () => {
      await setNativeTourStatus("completed", storage);
      const { getByTestId, queryByTestId } = await renderOverlayLoaded();

      act(() => {
        requestNativeTourHub("mind");
      });
      fireEvent.press(getByTestId("native-tour-step-done"));

      expect(queryByTestId("native-tour-step")).toBeNull();
      expect(queryByTestId("native-tour-prompt")).toBeNull();

      const progress = await getNativeTourProgress(storage);
      expect(progress.status).toBe("completed");
      expect(hasSettledNativeTour(progress)).toBe(true);
    });

    it("when tour was NOT yet settled, viewing and closing a solo hub card does not mark it settled", async () => {
      // Unsettled tour (first run): phase resolves to "prompt"
      const { getByTestId, queryByTestId } = await renderOverlayLoaded();
      expect(queryByTestId("native-tour-prompt")).toBeTruthy();

      // Open a solo hub card
      act(() => {
        requestNativeTourHub("programming");
      });
      expect(getByTestId("native-tour-step")).toBeTruthy();

      // Close it
      fireEvent.press(getByTestId("native-tour-step-done"));
      expect(queryByTestId("native-tour-step")).toBeNull();

      // Tour was never marked settled: progress is still unset
      const progress = await getNativeTourProgress(storage);
      expect(hasSettledNativeTour(progress)).toBe(false);
      expect(progress.status).toBe("unset");
    });
  });

  describe("(id: 96d41014) Settings -> Help -> 'Take the app tour' still works unchanged", () => {
    it("resets tour progress and asks for a replay via requestNativeTourReplay", async () => {
      await setNativeTourStatus("completed", storage);
      const { getByTestId, queryByTestId } = await renderOverlayLoaded();
      expect(queryByTestId("native-tour-prompt")).toBeNull();

      // Simulate Settings replay action:
      await resetNativeTourProgress(storage);
      act(() => {
        requestNativeTourReplay();
      });

      // Shows the upfront prompt again
      expect(getByTestId("native-tour-prompt")).toBeTruthy();
      expect(getByTestId("native-tour-prompt-walkthrough")).toBeTruthy();
      expect(getByTestId("native-tour-prompt-decline")).toBeTruthy();
    });
  });

  describe("(id: 96d41015) Tests cover the hub-scoped request and prove it writes no tour progress", () => {
    it("subscribeNativeTourHubRequests registers and unsubscribes cleanly", () => {
      const calls: string[] = [];
      const unsubscribe = subscribeNativeTourHubRequests((hubId) => {
        calls.push(hubId);
      });

      requestNativeTourHub("dashboard");
      expect(calls).toEqual(["dashboard"]);

      unsubscribe();
      requestNativeTourHub("mind");
      // No more calls after unsubscribe
      expect(calls).toEqual(["dashboard"]);
    });

    it("proves viewing and closing every hub writes zero items to storage", async () => {
      const setItemSpy = jest.spyOn(storage, "setItem");
      const removeItemSpy = jest.spyOn(storage, "removeItem");

      const { getByTestId } = await renderOverlayLoaded();

      for (const hub of NATIVE_TOUR_HUBS) {
        setItemSpy.mockClear();
        removeItemSpy.mockClear();

        act(() => {
          requestNativeTourHub(hub.id);
        });

        fireEvent.press(getByTestId("native-tour-step-done"));

        expect(setItemSpy).not.toHaveBeenCalled();
        expect(removeItemSpy).not.toHaveBeenCalled();
      }

      // Native progress key and web progress key are both never touched
      expect(await storage.getItem(NATIVE_TOUR_PROGRESS_KEY)).toBeNull();
      expect(await storage.getItem(WEB_TOUR_PROGRESS_KEY)).toBeNull();

      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();
    });
  });
});
