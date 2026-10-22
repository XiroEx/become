/**
 * ─── useWorkoutNotification: show / refresh / dismiss, driven by React state
 */
import { act, renderHook } from "@testing-library/react-native";
import { useWorkoutNotification } from "@/lib/live/liveActivity/useWorkoutNotification";
import {
  createWorkoutNotificationHandle,
  WORKOUT_NOTIFICATION_ID,
  type WorkoutNotificationNative,
  type WorkoutNotificationProps,
} from "@/lib/live/liveActivity/workoutNotification";

interface Scheduled {
  identifier: string;
  content: { title: string; body: string };
  trigger: { channelId: string };
}

interface Recording {
  native: WorkoutNotificationNative;
  scheduled: Scheduled[];
  dismissed: string[];
}

function recordingNative(): Recording {
  const rec: Partial<Recording> = { scheduled: [], dismissed: [] };
  rec.native = {
    schedule: async (request) => {
      rec.scheduled!.push(request as Scheduled);
      return request.identifier;
    },
    dismiss: async (identifier) => {
      rec.dismissed!.push(identifier);
    },
    isGranted: async () => true,
    ensureChannel: async () => undefined,
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useWorkoutNotification", () => {
  it("shows the row once the session is active, with the first snapshot", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const { rerender } = renderHook(
      (props: { active: boolean }) =>
        useWorkoutNotification({
          ...BASE,
          active: props.active,
          handle,
          native: rec.native,
        }),
      { initialProps: { active: false } },
    );
    await flush();
    expect(rec.scheduled).toEqual([]);

    rerender({ active: true });
    await flush();
    expect(rec.scheduled).toHaveLength(1);
    expect(rec.scheduled[0]?.identifier).toBe(WORKOUT_NOTIFICATION_ID);
    expect(rec.scheduled[0]?.content.title).toBe("Upper Body");
    // Re-rendering with the same `active: true` must not post a second row.
    rerender({ active: true });
    await flush();
    expect(rec.scheduled).toHaveLength(1);
  });

  it("refreshes the row — with the exact rest end instant handed in — when the description changes", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const endsAt = Date.now() + 90_000;
    const { rerender } = renderHook(
      (props: { phase: "exercise" | "rest"; restEndsAtMs: number | null }) =>
        useWorkoutNotification({
          ...BASE,
          active: true,
          phase: props.phase,
          restEndsAtMs: props.restEndsAtMs,
          restTotalSec: props.restEndsAtMs !== null ? 90 : null,
          handle,
          native: rec.native,
        }),
      { initialProps: { phase: "exercise" as const, restEndsAtMs: null } },
    );
    await flush();
    expect(rec.scheduled).toHaveLength(1);

    rerender({ phase: "rest", restEndsAtMs: endsAt });
    await flush();
    expect(rec.scheduled).toHaveLength(2);
    expect(rec.scheduled[1]?.identifier).toBe(WORKOUT_NOTIFICATION_ID);
    expect(rec.scheduled[1]?.content.body).toContain("Rest");
  });

  it("dismisses the row when `active` turns false", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const { rerender } = renderHook(
      (props: { active: boolean }) =>
        useWorkoutNotification({
          ...BASE,
          active: props.active,
          handle,
          native: rec.native,
        }),
      { initialProps: { active: true } },
    );
    await flush();
    expect(rec.scheduled).toHaveLength(1);

    rerender({ active: false });
    await flush();
    expect(rec.dismissed).toEqual([WORKOUT_NOTIFICATION_ID]);
  });

  it("dismisses the row on unmount — the discard path, which simply removes the screen", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const { unmount } = renderHook(() =>
      useWorkoutNotification({
        ...BASE,
        active: true,
        handle,
        native: rec.native,
      }),
    );
    await flush();
    expect(rec.scheduled).toHaveLength(1);
    expect(rec.dismissed).toEqual([]);

    act(() => unmount());
    await flush();
    expect(rec.dismissed).toEqual([WORKOUT_NOTIFICATION_ID]);
  });

  it("never shows when the session was never active", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const { unmount } = renderHook(() =>
      useWorkoutNotification({
        ...BASE,
        active: false,
        handle,
        native: rec.native,
      }),
    );
    await flush();
    unmount();
    await flush();
    expect(rec.scheduled).toEqual([]);
    expect(rec.dismissed).toEqual([]);
  });

  it("starts once the native wrapper arrives late (the route loads it in an effect)", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const { rerender } = renderHook(
      (props: { native: WorkoutNotificationNative | null }) =>
        useWorkoutNotification({
          ...BASE,
          active: true,
          handle,
          native: props.native,
        }),
      { initialProps: { native: null as WorkoutNotificationNative | null } },
    );
    await flush();
    expect(rec.scheduled).toEqual([]);

    rerender({ native: rec.native });
    await flush();
    expect(rec.scheduled).toHaveLength(1);
  });
});

export type { WorkoutNotificationProps };
