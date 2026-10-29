/**
 * ─── The Lock Screen buttons, app side ─────────────────────────────────────
 *
 * `useLiveActivityControls` mirrors the Live Activity's − / + / Log set
 * buttons into the live workout: the steppers call `onAdjustWeight` with the
 * signed step, Log calls `onLogSet` (the on-screen Complete path) unless the
 * member is resting. The listener registration is DI (`subscribe`), so these
 * tests never need the native module.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  LIVE_ACTIVITY_LOG_SET,
  LIVE_ACTIVITY_REPS_DOWN,
  LIVE_ACTIVITY_REPS_UP,
  LIVE_ACTIVITY_REST_SKIP,
  LIVE_ACTIVITY_REST_TOGGLE,
  LIVE_ACTIVITY_WEIGHT_DOWN,
  LIVE_ACTIVITY_WEIGHT_UP,
  useLiveActivityControls,
  type AddUserInteractionListener,
  type LiveActivityUserInteraction,
} from "@/lib/live/liveActivity/useLiveActivityControls";
import { WORKOUT_LIVE_ACTIVITY_NAME } from "@/lib/live/liveActivity/workoutLiveActivity";

function subscribable() {
  let listener: ((event: LiveActivityUserInteraction) => void) | null = null;
  const remove = jest.fn();
  const subscribe: AddUserInteractionListener = (next) => {
    listener = next;
    return { remove };
  };
  const fire = (event: LiveActivityUserInteraction) => {
    act(() => {
      listener?.(event);
    });
  };
  return { subscribe, fire, remove };
}

function baseOptions(over: Record<string, unknown> = {}) {
  return {
    weightStep: 5,
    onAdjustWeight: jest.fn(),
    onLogSet: jest.fn(),
    resting: false,
    ...over,
  };
}

describe("useLiveActivityControls", () => {
  it("maps weight-up / weight-down to the signed step", () => {
    const { subscribe, fire } = subscribable();
    const onAdjustWeight = jest.fn();
    renderHook(() =>
      useLiveActivityControls({ ...baseOptions(), subscribe, onAdjustWeight }),
    );
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_WEIGHT_UP });
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_WEIGHT_DOWN });
    expect(onAdjustWeight).toHaveBeenNthCalledWith(1, 5);
    expect(onAdjustWeight).toHaveBeenNthCalledWith(2, -5);
  });

  it("runs the on-screen Complete path on log-set", () => {
    const { subscribe, fire } = subscribable();
    const onLogSet = jest.fn();
    renderHook(() =>
      useLiveActivityControls({ ...baseOptions(), subscribe, onLogSet }),
    );
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_LOG_SET });
    expect(onLogSet).toHaveBeenCalledTimes(1);
  });

  it("ignores log-set while resting, but still steps the next set's weight", () => {
    const { subscribe, fire } = subscribable();
    const onAdjustWeight = jest.fn();
    const onLogSet = jest.fn();
    renderHook(() =>
      useLiveActivityControls({
        ...baseOptions(),
        subscribe,
        onAdjustWeight,
        onLogSet,
        resting: true,
      }),
    );
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_LOG_SET });
    expect(onLogSet).not.toHaveBeenCalled();
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_WEIGHT_UP });
    expect(onAdjustWeight).toHaveBeenCalledWith(5);
  });

  it("ignores unknown targets", () => {
    const { subscribe, fire } = subscribable();
    const onAdjustWeight = jest.fn();
    const onLogSet = jest.fn();
    renderHook(() =>
      useLiveActivityControls({ ...baseOptions(), subscribe, onAdjustWeight, onLogSet }),
    );
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: "something-else" });
    fire({ source: "SomeOtherWidget", target: "refresh" });
    expect(onAdjustWeight).not.toHaveBeenCalled();
    expect(onLogSet).not.toHaveBeenCalled();
  });

  it("accepts an event with no source — the targets are this activity's own", () => {
    const { subscribe, fire } = subscribable();
    const onLogSet = jest.fn();
    renderHook(() =>
      useLiveActivityControls({ ...baseOptions(), subscribe, onLogSet }),
    );
    fire({ target: LIVE_ACTIVITY_LOG_SET });
    expect(onLogSet).toHaveBeenCalledTimes(1);
  });

  it("removes the subscription on unmount and never throws when subscribing fails", () => {
    const { subscribe, remove } = subscribable();
    const { unmount } = renderHook(() =>
      useLiveActivityControls({ ...baseOptions(), subscribe }),
    );
    act(() => unmount());
    expect(remove).toHaveBeenCalledTimes(1);

    const throwing: AddUserInteractionListener = () => {
      throw new Error("no ActivityKit module");
    };
    expect(() =>
      renderHook(() =>
        useLiveActivityControls({ ...baseOptions(), subscribe: throwing }),
      ).unmount(),
    ).not.toThrow();
  });

  it("steps reps by one each way (Jon, 2026-10-29)", () => {
    const { subscribe, fire } = subscribable();
    const onAdjustReps = jest.fn();
    renderHook(() =>
      useLiveActivityControls({ ...baseOptions(), subscribe, onAdjustReps }),
    );
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_REPS_UP });
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_REPS_DOWN });
    expect(onAdjustReps).toHaveBeenNthCalledWith(1, 1);
    expect(onAdjustReps).toHaveBeenNthCalledWith(2, -1);
  });

  it("pauses/resumes and skips the rest only while resting", () => {
    const { subscribe, fire } = subscribable();
    const onToggleRest = jest.fn();
    const onSkipRest = jest.fn();
    const { rerender } = renderHook(
      ({ resting }: { resting: boolean }) =>
        useLiveActivityControls({
          ...baseOptions(),
          subscribe,
          resting,
          onToggleRest,
          onSkipRest,
        }),
      { initialProps: { resting: false } },
    );
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_REST_TOGGLE });
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_REST_SKIP });
    expect(onToggleRest).not.toHaveBeenCalled();
    expect(onSkipRest).not.toHaveBeenCalled();
    rerender({ resting: true });
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_REST_TOGGLE });
    fire({ source: WORKOUT_LIVE_ACTIVITY_NAME, target: LIVE_ACTIVITY_REST_SKIP });
    expect(onToggleRest).toHaveBeenCalledTimes(1);
    expect(onSkipRest).toHaveBeenCalledTimes(1);
  });
});
