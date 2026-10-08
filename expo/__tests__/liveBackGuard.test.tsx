/**
 * NP-082 & NP-331 back guard: confirm before leaving the live workout with
 * unsaved sets (Android back through `useAndroidBackHandler`, iOS swipe-back
 * disabled + `beforeRemove` confirm).
 *
 * NP-331 fixes:
 * 1. Only one dialog when leaving on Android hardware back (bypasses beforeRemove
 *    once confirmed).
 * 2. Only one dialog on in-app exit / swipe-back (re-dispatch bypasses beforeRemove).
 * 3. Tapping 'Stay' cancels the leave and keeps the guard active.
 * 4. Only guarded when there is entered work (typed values or completed sets).
 */
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

describe("useLiveBackGuard (NP-082 & NP-331)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("disables the iOS swipe-back while there is unsaved work, restores after", () => {
    const setOptions = jest.fn();
    const addListener = jest.fn(() => jest.fn());
    const navigation = {
      setOptions,
      addListener,
      dispatch: jest.fn(),
    };
    const { unmount } = render(
      <GuardHarness enabled navigation={navigation} />,
    );
    expect(setOptions).toHaveBeenCalledWith({ gestureEnabled: false });
    expect(addListener).toHaveBeenCalledWith(
      "beforeRemove",
      expect.any(Function),
    );
    unmount();
    expect(setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });

  it("beforeRemove is intercepted and offers Stay / Leave; tapping Leave exits with one dialog", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    let beforeRemoveHandler: ((e: { preventDefault: () => void; data: { action: unknown } }) => void) | null = null;
    const dispatch = jest.fn((action: unknown) => {
      // Simulate navigator re-firing beforeRemove upon dispatch
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
    render(<GuardHarness enabled navigation={navigation} />);
    const preventDefault = jest.fn();
    act(() => {
      beforeRemoveHandler?.({ preventDefault, data: { action: { type: "GO_BACK" } } });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      "Leave workout?",
      expect.stringContaining("unsaved"),
      expect.any(Array),
    );

    // Tapping Leave dispatches the held navigation action and does NOT trigger alert a second time.
    const buttons = alertSpy.mock.calls[0]?.[2] as {
      text: string;
      onPress?: () => void;
    }[];
    act(() => {
      buttons.find((b) => b.text === "Leave")?.onPress?.();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
    // Still only 1 alert call — never asked twice!
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("disabled: no swipe-back change and no beforeRemove listener", () => {
    const navigation = {
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
    };
    render(<GuardHarness enabled={false} navigation={navigation} />);
    expect(navigation.setOptions).not.toHaveBeenCalled();
    expect(navigation.addListener).not.toHaveBeenCalled();
  });

  it("Android hardware back asks once, and tapping Leave bypasses beforeRemove (single dialog exit)", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    let hardwareBackHandler: (() => boolean) | null = null;
    const fakeBackHandler = {
      addEventListener: jest.fn((_event: "hardwareBackPress", handler: () => boolean) => {
        hardwareBackHandler = handler;
        return { remove: jest.fn() };
      }),
    };

    let beforeRemoveHandler: ((e: { preventDefault: () => void; data: { action: unknown } }) => void) | null = null;
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
        enabled
        navigation={navigation}
        backHandler={fakeBackHandler}
      />,
    );

    expect(fakeBackHandler.addEventListener).toHaveBeenCalledWith(
      "hardwareBackPress",
      expect.any(Function),
    );

    // User presses Android back
    let intercepted = false;
    act(() => {
      intercepted = hardwareBackHandler ? hardwareBackHandler() : false;
    });
    expect(intercepted).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      "Leave workout?",
      expect.stringContaining("unsaved"),
      expect.any(Array),
    );

    // User taps Leave
    const buttons = alertSpy.mock.calls[0]?.[2] as {
      text: string;
      onPress?: () => void;
    }[];
    act(() => {
      buttons.find((b) => b.text === "Leave")?.onPress?.();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);

    // router.back() triggers navigator's beforeRemove listener
    const preventDefault = jest.fn();
    act(() => {
      beforeRemoveHandler?.({ preventDefault, data: { action: { type: "GO_BACK" } } });
    });

    // Bypassed! preventDefault was NOT called, no second dialog was shown
    expect(preventDefault).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("Android hardware back: tapping Stay keeps the workout and prompts again on subsequent press", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    let hardwareBackHandler: (() => boolean) | null = null;
    const fakeBackHandler = {
      addEventListener: jest.fn((_event: "hardwareBackPress", handler: () => boolean) => {
        hardwareBackHandler = handler;
        return { remove: jest.fn() };
      }),
    };

    render(
      <GuardHarness
        enabled
        backHandler={fakeBackHandler}
      />,
    );

    // First press
    act(() => {
      hardwareBackHandler?.();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);

    // Tapping Stay (no onPress or empty) does not trigger router.back()
    expect(mockBack).not.toHaveBeenCalled();

    // Second press prompts again
    act(() => {
      hardwareBackHandler?.();
    });
    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(mockBack).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("hasWorkoutProgress accurately detects whether workout has entered work", () => {
    // Empty or untouched workout
    expect(hasWorkoutProgress({})).toBe(false);
    expect(
      hasWorkoutProgress({
        squat: [
          { reps: null, weight: null, completed: false },
          { reps: null, weight: null, completed: false },
        ],
      }),
    ).toBe(false);

    // Typed reps or weight
    expect(
      hasWorkoutProgress({
        squat: [{ reps: 10, weight: null, completed: false }],
      }),
    ).toBe(true);
    expect(
      hasWorkoutProgress({
        squat: [{ reps: null, weight: 100, completed: false }],
      }),
    ).toBe(true);

    // Completed set (even without reps/weight, or skipped)
    expect(
      hasWorkoutProgress({
        squat: [{ reps: null, weight: null, completed: true }],
      }),
    ).toBe(true);

    // Cardio / duration / distance / speed
    expect(
      hasWorkoutProgress({
        run: [{ reps: null, weight: null, completed: false, durationSec: 300 }],
      }),
    ).toBe(true);
    expect(
      hasWorkoutProgress({
        run: [{ reps: null, weight: null, completed: false, distance: 1000 }],
      }),
    ).toBe(true);
    expect(
      hasWorkoutProgress({
        run: [{ reps: null, weight: null, completed: false, speed: 6.5 }],
      }),
    ).toBe(true);
  });
});
