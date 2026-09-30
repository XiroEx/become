import { ScheduleApiResponseSchema } from "@become/api-client";
import {
  toScheduledSlots,
  workoutIndexFromDayLabel,
} from "@/lib/schedule/scheduleSlots";

describe("workoutIndexFromDayLabel", () => {
  it("parses the trailing day number to a 0-based index", () => {
    expect(workoutIndexFromDayLabel("Day 1")).toBe(0);
    expect(workoutIndexFromDayLabel("Day 12")).toBe(11);
    expect(workoutIndexFromDayLabel("Rest")).toBe(0);
    expect(workoutIndexFromDayLabel(undefined)).toBe(0);
  });
});

describe("toScheduledSlots", () => {
  it("flattens nested schedules → slots with reduced date + indices", () => {
    const slots = toScheduledSlots({
      schedules: [
        {
          programId: "prog-1",
          scheduledWorkouts: [
            {
              date: "2026-06-01T00:00:00.000Z",
              dayLabel: "Day 1",
              status: "scheduled",
              phase: 1,
            },
            {
              date: "2026-06-03T00:00:00.000Z",
              dayLabel: "Day 2",
              status: "completed",
              phase: 2,
            },
          ],
        },
      ],
    });

    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual({
      date: "2026-06-01",
      programId: "prog-1",
      phase: 1,
      phaseIndex: 0,
      dayLabel: "Day 1",
      workoutIndex: 0,
      status: "scheduled",
    });
    expect(slots[1]).toEqual({
      date: "2026-06-03",
      programId: "prog-1",
      phase: 2,
      phaseIndex: 1,
      dayLabel: "Day 2",
      workoutIndex: 1,
      status: "completed",
    });
  });

  it("reads the slot date as a DAY MARKER, never through the device offset", () => {
    // A slot date is written at 00:00Z and denotes a calendar day. Anyone west
    // of UTC reading it as a local instant lands on the day before — which is
    // what put today's session on yesterday's square.
    const slots = toScheduledSlots({
      schedules: [
        {
          programId: "p",
          scheduledWorkouts: [
            { date: "2026-06-01T00:00:00.000Z", status: "scheduled" },
          ],
        },
      ],
    });
    expect(slots[0]!.date).toBe("2026-06-01");
    expect(new Date("2026-06-01T00:00:00.000Z").getTime()).toBe(
      Date.UTC(2026, 5, 1),
    );
  });

  it("narrows an unknown status to 'scheduled' and tolerates empty input", () => {
    // The narrowing lives in the shared schema now, which is where the response
    // is parsed — so this goes through the parse the app itself does rather
    // than handing toScheduledSlots a shape no response can have.
    const parsed = ScheduleApiResponseSchema.parse({
      schedules: [
        {
          programId: "p",
          scheduledWorkouts: [
            { date: "2026-06-01T00:00:00.000Z", status: "weird" },
          ],
        },
      ],
    });
    expect(toScheduledSlots(parsed)[0]!.status).toBe("scheduled");
    expect(toScheduledSlots(null)).toEqual([]);
    expect(toScheduledSlots({ schedules: [] })).toEqual([]);
  });
});
