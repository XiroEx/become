/**
 * NP-200 acceptance: the Android ongoing notification for the live workout —
 * shown with the exercise when the workout opens, refreshed with the rest
 * countdown on every set, and dismissed when the member leaves (finish or
 * discard, which both unmount this component in the real app — see
 * `useWorkoutNotification.ts`).
 *
 * The native module does not exist under Jest, so these tests inject a
 * recording `workoutNotificationNative` instead of the real
 * `expo-notifications` wrapper (same arrangement `card-NP-188-acceptance`
 * uses for the Live Activity factory).
 */
import { act, fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import {
  createWorkoutNotificationHandle,
  formatClockTime,
  WORKOUT_NOTIFICATION_CHANNEL_ID,
  WORKOUT_NOTIFICATION_ID,
  type WorkoutNotificationNative,
} from "@/lib/live/liveActivity/workoutNotification";

interface Scheduled {
  identifier: string;
  content: {
    title: string;
    body: string;
    sticky?: boolean;
    autoDismiss?: boolean;
    sound?: boolean;
  };
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

function mockInterval(): {
  setI: typeof setInterval;
  clearI: typeof clearInterval;
  tick: (n: number) => void;
} {
  let fn: (() => void) | null = null;
  const setI = ((f: () => void) => {
    fn = f;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) fn?.();
  };
  return { setI, clearI, tick };
}

const WORKOUT: LiveWorkoutViewModel = {
  programId: "p",
  workoutTitle: "Upper Body",
  exercises: [{ slug: "bench", name: "Bench Press", sets: 2, restSec: 90 }],
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("NP-200 acceptance", () => {
  it("e015cb14: shows the exercise, then the rest countdown at the exact instant the in-app timer uses", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const nowMs = 1_000_000;
    const { setI, clearI } = mockInterval();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={WORKOUT}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restTimerNow={() => nowMs}
        workoutNotificationHandle={handle}
        workoutNotificationNative={rec.native}
        workoutNotificationNow={() => nowMs}
      />,
    );
    await flush();

    // The row appears as soon as the workout is on screen, showing the
    // exercise — lifting, not resting — on its own channel, as an ongoing
    // (non-swipeable) silent row.
    expect(rec.scheduled).toHaveLength(1);
    expect(rec.scheduled[0]?.identifier).toBe(WORKOUT_NOTIFICATION_ID);
    expect(rec.scheduled[0]?.trigger).toEqual({
      channelId: WORKOUT_NOTIFICATION_CHANNEL_ID,
    });
    expect(rec.scheduled[0]?.content.title).toBe("Upper Body");
    expect(rec.scheduled[0]?.content.body).toBe("Bench Press · Set 1 of 2");
    expect(rec.scheduled[0]?.content.sticky).toBe(true);
    expect(rec.scheduled[0]?.content.sound).toBe(false);

    // Completing the first set starts a 90s rest.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    });
    await flush();
    const restDisplay = getByTestId("live-workout-rest-time").props.children;
    expect(restDisplay).toBe("1:30");

    const lastUpdate = rec.scheduled[rec.scheduled.length - 1];
    expect(lastUpdate?.identifier).toBe(WORKOUT_NOTIFICATION_ID);
    // THE RULE THAT TRAVELS: the row's rest countdown names the same
    // instant the in-app countdown is built from — `nowMs + 90_000` at
    // press time. Both count down from that one `endsAt`; the row's text
    // is the remainder at its refresh instant.
    expect(lastUpdate?.content.body).toBe(
      `Bench Press · Set 2 of 2 · Rest 1:30, back at ${formatClockTime(nowMs + 90_000)}`,
    );
    expect(lastUpdate?.content.body).toContain("Bench Press");
  });

  it("e015cb15: finishing or discarding — unmounting the live screen — dismisses the row", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    const { setI, clearI } = mockInterval();
    const { unmount } = render(
      <LiveWorkoutClient
        workout={WORKOUT}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        workoutNotificationHandle={handle}
        workoutNotificationNative={rec.native}
      />,
    );
    await flush();
    expect(rec.scheduled).toHaveLength(1);
    expect(rec.dismissed).toEqual([]);

    // The route renders either `LiveWorkoutClient` or the finish summary,
    // never both — and discarding navigates away — so in the app this
    // unmount IS "finished or discarded".
    act(() => unmount());
    await flush();
    expect(rec.dismissed).toEqual([WORKOUT_NOTIFICATION_ID]);
  });

  it("never shows when there is nothing to show yet (the route's loading placeholder)", async () => {
    const rec = recordingNative();
    const handle = createWorkoutNotificationHandle();
    render(
      <LiveWorkoutClient
        workout={{ programId: "p", workoutTitle: "Loading…", exercises: [] }}
        workoutNotificationHandle={handle}
        workoutNotificationNative={rec.native}
      />,
    );
    await flush();
    expect(rec.scheduled).toEqual([]);
  });
});
