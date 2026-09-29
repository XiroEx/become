import {
  slotForDate,
  slotKey,
  statusForDate,
  sortSlotsByDate,
  upcomingSlots,
  type ScheduledSlot,
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
