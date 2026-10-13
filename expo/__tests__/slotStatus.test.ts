import {
  slotForDate,
  slotsForDate,
  quickSessionsForDate,
  slotKey,
  statusForDate,
  sortSlotsByDate,
  upcomingSlots,
  isMakeupWorkout,
  quickSessionStatus,
  toQuickCalItems,
  type ScheduledSlot,
  type QuickCalItem,
} from "@/lib/schedule/slotStatus";

const slots: ScheduledSlot[] = [
  { date: "2026-05-27", programId: "p1", phaseIndex: 0, workoutIndex: 0, status: "scheduled" },
  { date: "2026-05-26", programId: "p1", phaseIndex: 0, workoutIndex: 0, status: "completed" },
  { date: "2026-05-25", programId: "p1", phaseIndex: 0, workoutIndex: 0, status: "missed" },
  { date: "2026-05-28", programId: "p1", phaseIndex: 0, workoutIndex: 1, status: "scheduled" },
];

describe("slotForDate / statusForDate", () => {
  it("returns the slot for a matching date", () => {
    const s = slotForDate(slots, "2026-05-26");
    expect(s?.status).toBe("completed");
  });

  it("returns null when no slot on that date", () => {
    expect(slotForDate(slots, "2026-05-01")).toBeNull();
  });

  it("statusForDate returns 'none' when no slot", () => {
    expect(statusForDate(slots, "2026-05-01")).toBe("none");
  });

  it("statusForDate returns the slot's status", () => {
    expect(statusForDate(slots, "2026-05-27")).toBe("scheduled");
    expect(statusForDate(slots, "2026-05-25")).toBe("missed");
  });
});

// The key is what resets RescheduleModal's form (it has no re-seeding effect),
// so two different slots must never produce the same one.
describe("slotKey", () => {
  it("is stable for the same slot", () => {
    expect(slotKey(slots[0]!)).toBe(slotKey({ ...slots[0]! }));
  });

  it("changes with the date, the program, the phase and the workout", () => {
    const base = slots[0]!;
    const keys = new Set([
      slotKey(base),
      slotKey({ ...base, date: "2026-06-01" }),
      slotKey({ ...base, programId: "p2" }),
      slotKey({ ...base, phaseIndex: 1 }),
      slotKey({ ...base, workoutIndex: 1 }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("does not change with the status — the same workout is the same slot", () => {
    const base = slots[0]!;
    expect(slotKey({ ...base, status: "completed" })).toBe(slotKey(base));
  });

  it("gives every slot in a schedule its own key", () => {
    expect(new Set(slots.map(slotKey)).size).toBe(slots.length);
  });
});

describe("sortSlotsByDate", () => {
  it("returns slots in ascending date order", () => {
    const out = sortSlotsByDate(slots);
    expect(out.map((s) => s.date)).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
    ]);
  });

  it("is non-mutating", () => {
    const before = slots.map((s) => s.date);
    sortSlotsByDate(slots);
    expect(slots.map((s) => s.date)).toEqual(before);
  });
});

describe("upcomingSlots", () => {
  it("filters out past dates and sorts the rest", () => {
    const out = upcomingSlots(slots, "2026-05-27");
    expect(out.map((s) => s.date)).toEqual(["2026-05-27", "2026-05-28"]);
  });

  it("returns empty array when nothing is upcoming", () => {
    expect(upcomingSlots(slots, "2026-12-01")).toEqual([]);
  });
});

describe("slotsForDate", () => {
  it("returns all slots matching the given date", () => {
    const multiSlots: ScheduledSlot[] = [
      { date: "2026-05-26", programId: "p1", phaseIndex: 0, workoutIndex: 0, status: "completed" },
      { date: "2026-05-26", programId: "p2", phaseIndex: 0, workoutIndex: 0, status: "scheduled" },
      { date: "2026-05-27", programId: "p1", phaseIndex: 0, workoutIndex: 1, status: "scheduled" },
    ];
    const match = slotsForDate(multiSlots, "2026-05-26");
    expect(match).toHaveLength(2);
    expect(match[0]?.programId).toBe("p1");
    expect(match[1]?.programId).toBe("p2");
  });
});

describe("isMakeupWorkout", () => {
  it("returns true when completedAt's local date is strictly after the slot date marker", () => {
    expect(isMakeupWorkout("2026-05-11", "2026-05-12T14:30:00Z")).toBe(true);
    expect(isMakeupWorkout("2026-05-11", "2026-05-15T00:00:00Z")).toBe(true);
  });

  it("returns false when completed on the same date or missing", () => {
    expect(isMakeupWorkout("2026-05-11", "2026-05-11T14:30:00Z")).toBe(false);
    expect(isMakeupWorkout("2026-05-11", undefined)).toBe(false);
    expect(isMakeupWorkout("2026-05-11", null)).toBe(false);
  });
});

describe("quickSessionStatus", () => {
  const today = "2026-09-30"; // Wednesday

  it("marks completed when completed is true", () => {
    expect(quickSessionStatus({ date: "2026-09-28T12:00:00Z", completed: true }, today)).toBe("completed");
    expect(quickSessionStatus({ date: "2026-10-02T12:00:00Z", completed: true }, today)).toBe("completed");
  });

  it("marks skipped when skipped is true", () => {
    expect(quickSessionStatus({ date: "2026-09-28T12:00:00Z", skipped: true }, today)).toBe("skipped");
  });

  it("marks planned when future or today and incomplete", () => {
    // Friday quick session when today is Wednesday
    expect(quickSessionStatus({ date: "2026-10-02T12:00:00Z" }, today)).toBe("planned");
    // Today's session
    expect(quickSessionStatus({ date: "2026-09-30T15:00:00Z" }, today)).toBe("planned");
  });

  it("marks incomplete when past and not completed", () => {
    expect(quickSessionStatus({ date: "2026-09-29T12:00:00Z" }, today)).toBe("incomplete");
  });
});

describe("toQuickCalItems and quickSessionsForDate", () => {
  it("converts raw logs to QuickCalItems and filters by date", () => {
    const rawLogs = [
      {
        kind: "quick",
        sessionId: "s1",
        title: "Friday Quick",
        date: "2026-10-02T12:00:00Z",
        completed: false,
        exerciseCount: 3,
        duration: 25,
      },
      {
        kind: "program",
        date: "2026-10-02T12:00:00Z",
        completed: false,
      },
    ];
    const items = toQuickCalItems(rawLogs, "2026-09-30");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Friday Quick");
    expect(items[0]?.status).toBe("planned");

    const onFriday = quickSessionsForDate(items, "2026-10-02");
    expect(onFriday).toHaveLength(1);
    const onThursday = quickSessionsForDate(items, "2026-10-01");
    expect(onThursday).toHaveLength(0);
  });
});
