import { Keyboard } from "react-native";
import { act, renderHook } from "@testing-library/react-native";
import { useRestTimer } from "@/lib/live/useRestTimer";
import type { RestAlertDeps } from "@/lib/live/restAlert";
import type { RestEndAlertDeps } from "@/lib/live/restEndAlert";

function makeMockIntervalImpl(): {
  setI: typeof setInterval;
  clearI: typeof clearInterval;
} {
  let nextId = 0;
  const setI = (() => ++nextId) as unknown as typeof setInterval;
  const clearI = (() => {}) as unknown as typeof clearInterval;
  return { setI, clearI };
}

function noopRestAlertDeps(): RestAlertDeps {
  return {
    isGranted: jest.fn().mockResolvedValue(false),
    schedule: jest.fn().mockResolvedValue("id"),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
}

function noopRestEndAlertDeps(): RestEndAlertDeps {
  return {
    haptic: jest.fn(),
    playSound: jest.fn(),
  };
}

/**
 * Card: "When entering reps and weight on live view the keyboard prompts us
 * and doesn't go away when your at rest" — the member types weight/reps,
 * taps Done, and the on-screen keyboard from that focused input stayed up
 * over the REST overlay until they tapped away themselves. `rest.start` is
 * the one place both Live (`LiveWorkoutClient`'s Live inputs) and Track (the
 * NP-082 shared rest timer) begin a rest, so dismissing the keyboard there
 * covers both call sites with one fix.
 */
describe("useRestTimer — dismisses the keyboard when a rest starts", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("calls Keyboard.dismiss() when start() begins a rest", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const { setI, clearI } = makeMockIntervalImpl();
    const { result } = renderHook(() =>
      useRestTimer({
        setIntervalImpl: setI,
        clearIntervalImpl: clearI,
        restAlertDeps: noopRestAlertDeps(),
        restEndAlertDeps: noopRestEndAlertDeps(),
      }),
    );

    expect(dismiss).not.toHaveBeenCalled();

    act(() => {
      result.current.start(90);
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
  });

  it("dismisses again on every subsequent start() (a new set completed mid-rest)", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const { setI, clearI } = makeMockIntervalImpl();
    const { result } = renderHook(() =>
      useRestTimer({
        setIntervalImpl: setI,
        clearIntervalImpl: clearI,
        restAlertDeps: noopRestAlertDeps(),
        restEndAlertDeps: noopRestEndAlertDeps(),
      }),
    );

    act(() => {
      result.current.start(60);
    });
    act(() => {
      result.current.start(90);
    });

    expect(dismiss).toHaveBeenCalledTimes(2);
  });
});
