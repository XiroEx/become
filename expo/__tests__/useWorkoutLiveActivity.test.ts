/**
 * ─── useWorkoutLiveActivity: start / update / end, driven by React state ──
 */
import { act, renderHook } from "@testing-library/react-native";
import { useWorkoutLiveActivity } from "@/lib/live/liveActivity/useWorkoutLiveActivity";
import {
  createWorkoutLiveActivityHandle,
  type WorkoutLiveActivityFactory,
  type WorkoutLiveActivityInstance,
  type WorkoutLiveActivityProps,
} from "@/lib/live/liveActivity/workoutLiveActivity";

interface Recording {
  factory: WorkoutLiveActivityFactory;
  started: WorkoutLiveActivityProps[];
  updated: WorkoutLiveActivityProps[];
  ended: (WorkoutLiveActivityProps | undefined)[];
}

function recordingFactory(): Recording {
  const rec: Partial<Recording> = { started: [], updated: [], ended: [] };
  const instance: WorkoutLiveActivityInstance = {
    update: async (props) => {
      rec.updated!.push(props);
    },
    end: async (props) => {
      rec.ended!.push(props);
    },
  };
  rec.factory = {
    start: (props) => {
      rec.started!.push(props);
      return instance;
    },
  };
  return rec as Recording;
}

const BASE = {
  workoutTitle: "Upper Body",
  exerciseName: "Bench Press",
  setLabel: "Set 1 of 4",
  phase: "exercise" as const,
  restEndsAtMs: null,
  restTotalSec: null,
};

describe("useWorkoutLiveActivity", () => {
  it("starts once the session is active, with the first snapshot", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const { rerender } = renderHook(
      (props: { active: boolean }) =>
        useWorkoutLiveActivity({
          ...BASE,
          active: props.active,
          handle,
          factory: rec.factory,
        }),
      { initialProps: { active: false } },
    );
    expect(rec.started).toEqual([]);

    act(() => rerender({ active: true }));
    expect(rec.started).toEqual([BASE]);
    // Re-rendering with the same `active: true` must not start a second time.
    act(() => rerender({ active: true }));
    expect(rec.started).toEqual([BASE]);
  });

  it("pushes an update — with the exact rest end instant handed in — when the description changes", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const endsAt = Date.now() + 90_000;
    const { rerender } = renderHook(
      (props: { phase: "exercise" | "rest"; restEndsAtMs: number | null }) =>
        useWorkoutLiveActivity({
          ...BASE,
          active: true,
          phase: props.phase,
          restEndsAtMs: props.restEndsAtMs,
          restTotalSec: props.restEndsAtMs !== null ? 90 : null,
          handle,
          factory: rec.factory,
        }),
      { initialProps: { phase: "exercise" as const, restEndsAtMs: null } },
    );
    expect(rec.started).toEqual([BASE]);

    act(() => rerender({ phase: "rest", restEndsAtMs: endsAt }));
    expect(rec.updated).toEqual([
      { ...BASE, phase: "rest", restEndsAtMs: endsAt, restTotalSec: 90 },
    ]);
    // The instant carried to the activity is `endsAt`, verbatim — never a
    // value recomputed in this hook.
    expect(rec.updated[0]?.restEndsAtMs).toBe(endsAt);
  });

  it("ends the activity when `active` turns false", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const { rerender } = renderHook(
      (props: { active: boolean }) =>
        useWorkoutLiveActivity({
          ...BASE,
          active: props.active,
          handle,
          factory: rec.factory,
        }),
      { initialProps: { active: true } },
    );
    expect(rec.started).toEqual([BASE]);

    act(() => rerender({ active: false }));
    expect(rec.ended).toEqual([undefined]);
  });

  it("ends the activity on unmount — the discard path, which simply removes the screen", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const { unmount } = renderHook(() =>
      useWorkoutLiveActivity({
        ...BASE,
        active: true,
        handle,
        factory: rec.factory,
      }),
    );
    expect(rec.started).toEqual([BASE]);
    expect(rec.ended).toEqual([]);

    act(() => unmount());
    expect(rec.ended).toEqual([undefined]);
  });

  it("never starts when the session was never active", () => {
    const rec = recordingFactory();
    const handle = createWorkoutLiveActivityHandle();
    const { unmount } = renderHook(() =>
      useWorkoutLiveActivity({
        ...BASE,
        active: false,
        handle,
        factory: rec.factory,
      }),
    );
    unmount();
    expect(rec.started).toEqual([]);
    expect(rec.ended).toEqual([]);
  });
});
