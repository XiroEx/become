/* eslint-disable import/first */
// The schedule mutations hook, action by action (NP-021).
//
// It used to send `Record<string, unknown>` at PATCH /api/schedule and parse
// the answer with `z.object({}).passthrough()` — so no action had a shape in
// either direction, and a body missing the field its action requires was
// discovered as a 400 on a device. It now takes the shared discriminated union
// and parses each of the two real answers.
//
// What this file checks: every one of the eight actions goes out through the
// hook with its own typed body, and the two answer shapes come back PARSED.
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch, SCHEDULE_PATCH_ACTIONS } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  useScheduleMutations,
  type SchedulePatchInput,
} from "@/lib/schedule/useScheduleMutations";

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SLOT_ANSWER = {
  message: "Schedule updated: skip",
  schedule: {
    programId: "prog-1",
    scheduledWorkouts: [
      {
        date: "2026-06-01T00:00:00.000Z",
        programId: "prog-1",
        phase: 1,
        dayLabel: "Day 1",
        workoutTitle: "Lower A",
        status: "skipped",
      },
    ],
  },
};

const PROGRAM_ANSWER = {
  message: "Program paused",
  programId: "prog-1",
};

/** One body per action, each typed by its own member of the union. */
const BODIES: SchedulePatchInput[] = [
  { programId: "prog-1", action: "skip", workoutDate: "2026-06-01" },
  { programId: "prog-1", action: "unskip", workoutDate: "2026-06-01" },
  { programId: "prog-1", action: "uncomplete", workoutDate: "2026-06-01" },
  {
    programId: "prog-1",
    action: "reschedule",
    workoutDate: "2026-06-01",
    newDate: "2026-06-02",
  },
  {
    programId: "prog-1",
    action: "swap",
    workoutDate: "2026-06-01",
    swapWithDate: "2026-06-03",
  },
  { programId: "prog-1", action: "shift", days: 2 },
  { programId: "prog-1", action: "pause" },
  { programId: "prog-1", action: "resume", resumeDate: "2026-06-05" },
];

const PROGRAM_LEVEL = new Set(["shift", "pause", "resume"]);

describe("useScheduleMutations", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("sends every PATCH action with its own typed body", async () => {
    // Every action the route accepts is covered, so adding one to the union
    // without sending it here fails this test rather than going unexercised.
    expect(BODIES.map((b) => b.action)).toEqual([...SCHEDULE_PATCH_ACTIONS]);

    mockApiFetch.mockImplementation((_path: string, _schema, init) => {
      const body = (init as { body?: { action?: string } }).body;
      return Promise.resolve(
        PROGRAM_LEVEL.has(body?.action ?? "") ? PROGRAM_ANSWER : SLOT_ANSWER,
      );
    });

    const onSuccess = jest.fn();
    const { result } = renderHook(() =>
      useScheduleMutations({ getToken: () => "test-jwt", onSuccess }),
    );

    for (const body of BODIES) {
      await act(async () => {
        await result.current.patch(body);
      });
    }

    expect(mockApiFetch).toHaveBeenCalledTimes(BODIES.length);
    BODIES.forEach((body, index) => {
      const call = mockApiFetch.mock.calls[index]!;
      expect(call[0]).toBe("/api/schedule");
      expect(call[2]).toEqual(
        expect.objectContaining({
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          body,
        }),
      );
    });
    // Each one re-pulls the grid.
    expect(onSuccess).toHaveBeenCalledTimes(BODIES.length);
  });

  it("parses the slot-action answer, so the caller gets the new slots", async () => {
    mockApiFetch.mockImplementation((_path: string, schema: { parse: (v: unknown) => unknown }) =>
      // apiFetch parses with the schema the hook handed it; mirror that here so
      // the test exercises the real schema and not just the mock's object.
      Promise.resolve(schema.parse(SLOT_ANSWER)),
    );

    const { result } = renderHook(() =>
      useScheduleMutations({ getToken: () => "test-jwt" }),
    );

    let answer: unknown;
    await act(async () => {
      answer = await result.current.reschedule({
        programId: "prog-1",
        workoutDate: "2026-06-01",
        newDate: "2026-06-02",
      });
    });

    // The hook fills the action in, so a screen cannot send the wrong one.
    expect(mockApiFetch.mock.calls[0]![2]).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: {
          programId: "prog-1",
          action: "reschedule",
          workoutDate: "2026-06-01",
          newDate: "2026-06-02",
        },
      }),
    );
    expect(answer).toEqual(SLOT_ANSWER);
  });

  it("parses the program-action answer, which carries no slots at all", async () => {
    mockApiFetch.mockImplementation((_path: string, schema: { parse: (v: unknown) => unknown }) =>
      Promise.resolve(schema.parse(PROGRAM_ANSWER)),
    );

    const { result } = renderHook(() =>
      useScheduleMutations({ getToken: () => "test-jwt" }),
    );

    let answer: unknown;
    await act(async () => {
      answer = await result.current.patch({ programId: "prog-1", action: "pause" });
    });
    expect(answer).toEqual(PROGRAM_ANSWER);
  });

  it("PUTs the settings update and parses its answer", async () => {
    const SETTINGS_ANSWER = {
      message: "Schedule settings updated and future workouts regenerated",
      schedule: {
        programId: "prog-1",
        settings: { trainingDays: [1, 3, 5], startDate: "2026-06-01T00:00:00.000Z" },
        totalScheduledWorkouts: 12,
        pastWorkouts: 5,
        futureWorkouts: 7,
      },
    };
    mockApiFetch.mockImplementation((_path: string, schema: { parse: (v: unknown) => unknown }) =>
      Promise.resolve(schema.parse(SETTINGS_ANSWER)),
    );

    const { result } = renderHook(() =>
      useScheduleMutations({ getToken: () => "test-jwt" }),
    );

    let answer: unknown;
    await act(async () => {
      answer = await result.current.updateSettings({
        programId: "prog-1",
        trainingDays: [1, 3, 5],
      });
    });

    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/schedule/settings");
    // PUT, not PATCH — the settings route has no other method.
    expect(call[2]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: { programId: "prog-1", trainingDays: [1, 3, 5] },
      }),
    );
    expect(answer).toEqual(SETTINGS_ANSWER);
  });

  it("never sends its own tz: the transport reports the device offset", async () => {
    // `apiFetch` merges `tz` (minutes west of UTC) and `tzZone` into every
    // date-scoped write body, per request, because DST moves the offset. A hook
    // that put its own in would be reporting a zone it guessed.
    mockApiFetch.mockResolvedValue(SLOT_ANSWER);
    const { result } = renderHook(() =>
      useScheduleMutations({ getToken: () => "test-jwt" }),
    );
    await act(async () => {
      await result.current.patch({ programId: "prog-1", action: "pause" });
    });
    const sent = mockApiFetch.mock.calls[0]![2] as {
      body: Record<string, unknown>;
    };
    expect(sent.body.tz).toBeUndefined();
    expect(sent.body.tzZone).toBeUndefined();
  });
});
