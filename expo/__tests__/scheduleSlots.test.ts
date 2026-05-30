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
      phaseIndex: 0,
      workoutIndex: 0,
      status: "scheduled",
    });
    expect(slots[1]).toEqual({
      date: "2026-06-03",
      programId: "prog-1",
      phaseIndex: 1,
      workoutIndex: 1,
      status: "completed",
    });
  });

  it("narrows an unknown status to 'scheduled' and tolerates empty input", () => {
    const slots = toScheduledSlots({
      schedules: [
        {
          programId: "p",
          scheduledWorkouts: [
            { date: "2026-06-01T00:00:00.000Z", status: "weird" },
          ],
        },
      ],
    });
    expect(slots[0]!.status).toBe("scheduled");
    expect(toScheduledSlots(null)).toEqual([]);
    expect(toScheduledSlots({ schedules: [] })).toEqual([]);
  });
});
