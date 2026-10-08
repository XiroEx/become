// NP-331 — ANDROID: SYSTEM BACK IN A WORKOUT ASKS 'LEAVE WORKOUT?' TWICE,
// AND ASKS EVEN WHEN NOTHING WAS ENTERED.
//
// Full-pass gaps against the web (build 24f4e34d, Android S23 Ultra, One UI 7):
//   1. Press the Android back button on a program workout or quick session:
//      the system dialog `Leave workout? You have unsaved sets. Leave without saving?`
//      appears. Tap LEAVE and the same dialog appears a second time; only the
//      second LEAVE exits. Cause: useLiveBackGuard's BackHandler calls router.back(),
//      which fires beforeRemove, showing confirmLeaveAlert again.
//   2. The guard was enabled as soon as the workout loaded, warning about unsaved
//      sets even when no set had a value or tick. Web exits without prompt when
//      nothing was logged. Guard is now enabled only when the grid has a typed or
//      completed set.
//   3. LEAVE exits with one dialog on Android hardware back and in-app exit.
//   4. STAY keeps the workout.
//   5. iOS swipe-back remains guarded when there is entered work.

import { act, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useLiveBackGuard } from "@/lib/live/useLiveBackGuard";
import { hasWorkoutProgress } from "@/lib/live/liveWorkoutCache";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useNavigation: () => null,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
}));

function GuardHarness({
  enabled,
  navigation,
  backHandler,
}: {
  enabled: boolean;
  navigation?: import("@/lib/live/useLiveBackGuard").BackGuardNavigator | null;
  backHandler?: import("@/lib/android/backHandler").BackHandlerLike | null;
}) {
  useLiveBackGuard({ enabled, navigation, backHandler });
  return null;
}

describe("card-NP-331: Android leave guard & unsaved work gating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Requirement 1 & 2: Single dialog on Android hardware back", () => {
    it("tapping LEAVE exits with one dialog and bypasses beforeRemove", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      let hardwareBackHandler: (() => boolean) | null = null;
      const fakeBackHandler = {
        addEventListener: jest.fn(
          (_event: "hardwareBackPress", handler: () => boolean) => {
            hardwareBackHandler = handler;
            return { remove: jest.fn() };
          },
        ),
      };

      let beforeRemoveHandler:
        | ((e: { preventDefault: () => void; data: { action: unknown } }) => void)
        | null = null;
      const navigation = {
        setOptions: jest.fn(),
        addListener: jest.fn(
          (
            _event: "beforeRemove",
            handler: (e: {
              preventDefault: () => void;
              data: { action: unknown };
            }) => void,
          ) => {
            beforeRemoveHandler = handler;
            return jest.fn();
          },
        ),
        dispatch: jest.fn(),
      };

      render(
        <GuardHarness
          enabled={true}
          navigation={navigation}
          backHandler={fakeBackHandler}
        />,
      );

      // 1. Android hardware back is pressed
      let handled = false;
      act(() => {
        handled = hardwareBackHandler ? hardwareBackHandler() : false;
      });
      expect(handled).toBe(true);
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        "Leave workout?",
        "You have unsaved sets. Leave without saving?",
        expect.any(Array),
      );

      // 2. User taps 'Leave'
      const buttons = alertSpy.mock.calls[0]?.[2] as {
        text: string;
        onPress?: () => void;
      }[];
      const leaveButton = buttons.find((b) => b.text === "Leave");
      expect(leaveButton).toBeDefined();

      act(() => {
        leaveButton?.onPress?.();
      });

      // router.back() was called
      expect(mockBack).toHaveBeenCalledTimes(1);

      // router.back() triggers the navigator's beforeRemove listener
      const preventDefault = jest.fn();
      act(() => {
        beforeRemoveHandler?.({
          preventDefault,
          data: { action: { type: "GO_BACK" } },
        });
      });

      // The beforeRemove guard is bypassed because leaving is already confirmed!
      expect(preventDefault).not.toHaveBeenCalled();
      // Alert was NOT shown a second time: exactly 1 alert call
      expect(alertSpy).toHaveBeenCalledTimes(1);

      alertSpy.mockRestore();
    });

    it("tapping STAY keeps the workout and allows continuing without exiting", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      let hardwareBackHandler: (() => boolean) | null = null;
      const fakeBackHandler = {
        addEventListener: jest.fn(
          (_event: "hardwareBackPress", handler: () => boolean) => {
            hardwareBackHandler = handler;
            return { remove: jest.fn() };
          },
        ),
      };

      render(
        <GuardHarness
          enabled={true}
          backHandler={fakeBackHandler}
        />,
      );

      act(() => {
        hardwareBackHandler?.();
      });
      expect(alertSpy).toHaveBeenCalledTimes(1);

      const buttons = alertSpy.mock.calls[0]?.[2] as {
        text: string;
        onPress?: () => void;
      }[];
      const stayButton = buttons.find((b) => b.text === "Stay");
      expect(stayButton).toBeDefined();
      act(() => {
        stayButton?.onPress?.();
      });

      // router.back() was not called
      expect(mockBack).not.toHaveBeenCalled();

      // Subsequent back press still shows the prompt
      act(() => {
        hardwareBackHandler?.();
      });
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(mockBack).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  describe("Requirement 3: In-app exit shows one dialog", () => {
    it("intercepts beforeRemove and exits after single confirmation", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      let beforeRemoveHandler:
        | ((e: { preventDefault: () => void; data: { action: unknown } }) => void)
        | null = null;
      const dispatch = jest.fn((action: unknown) => {
        // Navigator re-fires beforeRemove with the dispatched action
        if (beforeRemoveHandler) {
          const preventDefault = jest.fn();
          beforeRemoveHandler({ preventDefault, data: { action } });
          expect(preventDefault).not.toHaveBeenCalled();
        }
      });
      const navigation = {
        setOptions: jest.fn(),
        addListener: jest.fn(
          (
            _event: "beforeRemove",
            handler: (e: {
              preventDefault: () => void;
              data: { action: unknown };
            }) => void,
          ) => {
            beforeRemoveHandler = handler;
            return jest.fn();
          },
        ),
        dispatch,
      };

      render(<GuardHarness enabled={true} navigation={navigation} />);

      const preventDefault = jest.fn();
      act(() => {
        beforeRemoveHandler?.({
          preventDefault,
          data: { action: { type: "REPLACE", payload: { name: "overview" } } },
        });
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      // Tapping Leave executes dispatch
      const buttons = alertSpy.mock.calls[0]?.[2] as {
        text: string;
        onPress?: () => void;
      }[];
      act(() => {
        buttons.find((b) => b.text === "Leave")?.onPress?.();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "REPLACE",
        payload: { name: "overview" },
      });
      // Alert was NOT shown again
      expect(alertSpy).toHaveBeenCalledTimes(1);

      alertSpy.mockRestore();
    });
  });

  describe("Requirement 4: Guard only when there is entered work", () => {
    it("returns false for blank / untouched grids and true when progress exists", () => {
      // Nothing entered
      expect(hasWorkoutProgress({})).toBe(false);
      expect(
        hasWorkoutProgress({
          bench: [
            {
              reps: null,
              weight: null,
              completed: false,
              durationSec: null,
              distance: null,
              speed: null,
            },
          ],
        }),
      ).toBe(false);

      // Typed reps
      expect(
        hasWorkoutProgress({
          bench: [{ reps: 8, weight: null, completed: false }],
        }),
      ).toBe(true);

      // Typed weight
      expect(
        hasWorkoutProgress({
          bench: [{ reps: null, weight: 135, completed: false }],
        }),
      ).toBe(true);

      // Completed set
      expect(
        hasWorkoutProgress({
          bench: [{ reps: null, weight: null, completed: true }],
        }),
      ).toBe(true);

      // Cardio duration / distance / speed
      expect(
        hasWorkoutProgress({
          row: [{ reps: null, weight: null, completed: false, durationSec: 60 }],
        }),
      ).toBe(true);
      expect(
        hasWorkoutProgress({
          run: [{ reps: null, weight: null, completed: false, distance: 500 }],
        }),
      ).toBe(true);
      expect(
        hasWorkoutProgress({
          bike: [{ reps: null, weight: null, completed: false, speed: 12 }],
        }),
      ).toBe(true);
    });

    it("when enabled is false, does not attach beforeRemove listener and enables swipe gesture", () => {
      const setOptions = jest.fn();
      const addListener = jest.fn();
      const navigation = {
        setOptions,
        addListener,
        dispatch: jest.fn(),
      };
      render(<GuardHarness enabled={false} navigation={navigation} />);

      expect(setOptions).not.toHaveBeenCalled();
      expect(addListener).not.toHaveBeenCalled();
    });
  });
});
