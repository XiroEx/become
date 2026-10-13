import {
  computeWeekStripDayStatus,
  getWeekDays,
  isSameDay,
  toLocalDateKey,
  weekLabel,
  weekStartFor,
} from "@/lib/workout/dayStatus";
import { formatStartLabel } from "@/lib/workout/formatStartLabel";

describe("computeWeekStripDayStatus", () => {
  it("REGRESSION: a completed quick session wins even when the program slot for the day is still scheduled", () => {
    const status = computeWeekStripDayStatus(
      [{ status: "scheduled" }],
      [{ completed: true }],
    );
    expect(status).toBe("completed");
  });

  it("a completed quick session wins over a missed program slot", () => {
    const status = computeWeekStripDayStatus(
      [{ status: "missed" }],
      [{ completed: true }],
    );
    expect(status).toBe("completed");
  });

  it("a completed program workout still reads as completed with no quick sessions", () => {
    const status = computeWeekStripDayStatus(
      [{ status: "completed" }],
      undefined,
    );
    expect(status).toBe("completed");
  });

  it("multiple program slots: any one completed is enough, even if the first slot is not", () => {
    const status = computeWeekStripDayStatus(
      [{ status: "scheduled" }, { status: "completed" }],
      undefined,
    );
    expect(status).toBe("completed");
  });

  it("an uncompleted quick session with no program slot reads as a pending quick session", () => {
    const status = computeWeekStripDayStatus(undefined, [{ completed: false }]);
    expect(status).toBe("quick");
  });

  it("a scheduled program slot with no quick sessions falls back to the program status", () => {
    const status = computeWeekStripDayStatus(
      [{ status: "scheduled" }],
      undefined,
    );
    expect(status).toBe("scheduled");
  });

  it("a scheduled program slot with an incomplete quick session still falls back to the program status", () => {
    const status = computeWeekStripDayStatus(
      [{ status: "scheduled" }],
      [{ completed: false }],
    );
    expect(status).toBe("scheduled");
  });

  it("nothing scheduled and no quick sessions reads as rest", () => {
    const status = computeWeekStripDayStatus(undefined, undefined);
    expect(status).toBe("rest");
  });

  it("an empty workouts array with no quick sessions still reads as rest", () => {
    const status = computeWeekStripDayStatus([], []);
    expect(status).toBe("rest");
  });
});

describe("week strip date calculations", () => {
  const base = new Date(2026, 8, 30); // Wed Sep 30 2026

  it("weekStartFor computes Sunday of the week", () => {
    const sunday = weekStartFor(0, base);
    expect(sunday.getDay()).toBe(0);
    expect(sunday.getDate()).toBe(27); // Sep 27 2026
  });

  it("getWeekDays returns 7 days starting from Sunday", () => {
    const days = getWeekDays(0, base);
    expect(days).toHaveLength(7);
    expect(days[0]!.getDay()).toBe(0); // Sun
    expect(days[6]!.getDay()).toBe(6); // Sat
  });

  it("toLocalDateKey formats YYYY-MM-DD in local time", () => {
    expect(toLocalDateKey(new Date(2026, 8, 30))).toBe("2026-09-30");
  });

  it("isSameDay checks same year, month, date", () => {
    expect(isSameDay(new Date(2026, 8, 30, 10), new Date(2026, 8, 30, 22))).toBe(true);
    expect(isSameDay(new Date(2026, 8, 30), new Date(2026, 8, 29))).toBe(false);
  });

  it("weekLabel formats offset and dates", () => {
    const days = getWeekDays(0, base);
    expect(weekLabel(0, days)).toBe("This Week");
    expect(weekLabel(-1, days)).toBe("Last Week");
    expect(weekLabel(1, days)).toBe("Next Week");
  });
});

describe("formatStartLabel", () => {
  const now = new Date(2026, 8, 30, 12, 0, 0); // Sep 30 2026

  it("returns empty string and isFuture=false for empty start date", () => {
    expect(formatStartLabel(null, now)).toEqual({ label: "", isFuture: false });
    expect(formatStartLabel(undefined, now)).toEqual({ label: "", isFuture: false });
  });

  it("returns 'Starts tomorrow' if start is next day", () => {
    expect(formatStartLabel("2026-10-01", now)).toEqual({
      label: "Starts tomorrow",
      isFuture: true,
    });
  });

  it("returns 'Starts in X days' within 7 days", () => {
    expect(formatStartLabel("2026-10-04", now)).toEqual({
      label: "Starts in 4 days",
      isFuture: true,
    });
  });

  it("returns 'Starts Mon D' for further future starts", () => {
    const res = formatStartLabel("2026-10-15", now);
    expect(res.isFuture).toBe(true);
    expect(res.label).toContain("Starts");
  });

  it("returns empty string for today or past start date", () => {
    expect(formatStartLabel("2026-09-30", now)).toEqual({
      label: "",
      isFuture: false,
    });
    expect(formatStartLabel("2026-09-20", now)).toEqual({
      label: "",
      isFuture: false,
    });
  });
});
