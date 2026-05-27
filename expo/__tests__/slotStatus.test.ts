import {
  slotForDate,
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
