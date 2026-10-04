/**
 * NP-082 acceptance: rest timer that survives the lock screen, plus the
 * rules that travel from the web (parseRestTime verbatim, smart defaults,
 * group rest) so both apps rest the same time for the same exercise.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import {
  LiveWorkoutClient,
  parseRestSeconds,
  restAfterStep,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import type { RestAlertDeps } from "@/lib/live/restAlert";

function mockInterval(): {
  setI: typeof setInterval;
  clearI: typeof clearInterval;
  tick: (n: number) => void;
} {
  let fn: (() => void) | null = null;
  const setI = ((cb: () => void) => {
    fn = cb;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return { setI, clearI, tick: (n: number) => { for (let i = 0; i < n; i++) fn?.(); } };
}

function grantedAlertDeps(): RestAlertDeps & {
  schedule: jest.Mock;
  cancel: jest.Mock;
} {
  return {
    isGranted: jest.fn(async () => true),
    schedule: jest.fn(async () => "notif-1"),
    cancel: jest.fn(async () => undefined),
  };
}

describe("NP-082 acceptance", () => {
  it("e015c87a: locking the phone during a 90 s rest and unlocking after 60 s shows 30 s left", () => {
    let nowMs = 1_000_000;
    let tickFn: (() => void) | null = null;
    const setI = ((cb: () => void) => {
      tickFn = cb;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval;
    const clearI = (() => {
      tickFn = null;
    }) as unknown as typeof clearInterval;
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "W",
          exercises: [{ slug: "a", name: "A", sets: 2, restSec: 90 }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restTimerNow={() => nowMs}
      />,
    );
    // Complete the first set of two: rest starts at 90 s.
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("1:30");
    // The phone locks: no ticks fire for 60 s. On unlock the next display
    // tick reads the clock from endsAt — 30 s left, not 90 minus
    // ticks-that-never-ran.
    act(() => {
      nowMs += 60_000;
      tickFn?.();
    });
    expect(getByTestId("live-workout-rest-time").props.children).toBe("0:30");
  });

  it("e015c87c: a program exercise with rest '2 min' rests 120 s natively", () => {
    expect(parseRestSeconds("2 min")).toBe(120);
    expect(parseRestSeconds("90s")).toBe(90);
    expect(parseRestSeconds("3min")).toBe(180);
    const workout: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "W",
      exercises: [{ slug: "a", name: "A", sets: 1, restSec: 120 }],
    };
    const { setI, clearI } = mockInterval();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={workout}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
      />,
    );
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("2:00");
  });

  it("smart defaults match the web: reps_weight 3 min, bodyweight 90 s, else 60 s", () => {
    const heavy = { slug: "h", name: "H", sets: 1, trackingType: "reps_weight" };
    const body = { slug: "b", name: "B", sets: 1, trackingType: "reps_bodyweight" };
    const other = { slug: "o", name: "O", sets: 1, trackingType: "time" };
    const step = { groupId: null, isLastInRound: false };
    expect(restAfterStep(step, heavy)).toBe(180);
    expect(restAfterStep(step, body)).toBe(90);
    expect(restAfterStep(step, other)).toBe(60);
  });

  it("group rest: no rest inside a round, groupRest after the last exercise", () => {
    const ex = {
      slug: "a",
      name: "A",
      sets: 1,
      trackingType: "reps_weight",
      groupId: "g1",
      groupRest: "60s",
    };
    expect(
      restAfterStep({ groupId: "g1", isLastInRound: false }, ex),
    ).toBe(0);
    expect(restAfterStep({ groupId: "g1", isLastInRound: true }, ex)).toBe(60);
  });

  it("skip cancels the locked-phone alert", async () => {
    const deps = grantedAlertDeps();
    const { setI, clearI } = mockInterval();
    const { getByTestId, findByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "W",
          exercises: [{ slug: "a", name: "A", sets: 2, restSec: 90 }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restAlertDeps={deps}
      />,
    );
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    await findByTestId("live-workout-rest");
    expect(deps.schedule).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("live-workout-rest-skip"));
    expect(deps.cancel).toHaveBeenCalledTimes(1);
  });

  it("a new set cancels the previous alert and schedules a fresh one", async () => {
    const deps = grantedAlertDeps();
    const { setI, clearI } = mockInterval();
    const { getByTestId, findByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "W",
          exercises: [{ slug: "a", name: "A", sets: 3, restSec: 90 }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restAlertDeps={deps}
      />,
    );
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    await findByTestId("live-workout-rest");
    expect(deps.schedule).toHaveBeenCalledTimes(1);
    // The second set's checkbox is the member's own call: toggling it
    // completes the set and starts a fresh rest (cancelling the old alert).
    fireEvent.press(getByTestId("live-workout-a-set-1-complete"));
    await waitFor(() => expect(deps.cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(deps.schedule).toHaveBeenCalledTimes(2));
  });

  it("without granted permission the timer stays in-app (no schedule call)", async () => {
    const deps: RestAlertDeps & { schedule: jest.Mock; cancel: jest.Mock } = {
      isGranted: jest.fn(async () => false),
      schedule: jest.fn(async () => "notif-1"),
      cancel: jest.fn(async () => undefined),
    };
    const { setI, clearI } = mockInterval();
    const { getByTestId, findByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "W",
          exercises: [{ slug: "a", name: "A", sets: 2, restSec: 90 }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
        restAlertDeps={deps}
      />,
    );
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    await findByTestId("live-workout-rest");
    expect(deps.schedule).not.toHaveBeenCalled();
    expect(getByTestId("live-workout-rest-time").props.children).toBe("1:30");
  });

  it("set complete fires a haptic (expo-haptics impactAsync)", () => {
    (Haptics.impactAsync as unknown as jest.Mock).mockClear();
    const { setI, clearI } = mockInterval();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "W",
          exercises: [{ slug: "a", name: "A", sets: 2, restSec: 90 }],
        }}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
      />,
    );
    // The checkbox toggles `completed` directly — the member's own call —
    // so the set-complete haptic fires without needing typed inputs.
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });
});
