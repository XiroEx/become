import {
  localDateKey,
  tzBodyFields,
  tzOffsetMinutes,
  withTz,
} from "@/lib/nutrition/localDay";

/**
 * A Date standing in for one read on a device in a fixed zone: local time is
 * UTC minus `offsetMinutesWest`, which is exactly what
 * `getTimezoneOffset()`/`getFullYear()` answer on a real device there. Faking
 * the clock this way (rather than setting `process.env.TZ`, which jest's
 * environment does not pick up mid-run) keeps the test independent of the
 * runner's own zone.
 */
function deviceClock(utcIso: string, offsetMinutesWest: number): Date {
  const utc = new Date(utcIso);
  const local = new Date(utc.getTime() - offsetMinutesWest * 60_000);
  return {
    getFullYear: () => local.getUTCFullYear(),
    getMonth: () => local.getUTCMonth(),
    getDate: () => local.getUTCDate(),
    getTimezoneOffset: () => offsetMinutesWest,
    toISOString: () => utc.toISOString(),
  } as unknown as Date;
}

describe("localDateKey", () => {
  it("at 9pm in New York the key is today, not the UTC tomorrow", () => {
    // 2026-06-02T01:30Z is 2026-06-01 21:30 in New York (EDT, 240 west).
    const at9pm = deviceClock("2026-06-02T01:30:00.000Z", 240);
    expect(localDateKey(at9pm)).toBe("2026-06-01");
    expect(tzOffsetMinutes(at9pm)).toBe(240);
    // What the native screens used to send for that same moment.
    expect(at9pm.toISOString().slice(0, 10)).toBe("2026-06-02");
  });

  it("handles a zone AHEAD of UTC (negative offset) too", () => {
    // 2026-06-01T22:30Z is already 2026-06-02 00:30 in Berlin (120 east).
    const afterMidnight = deviceClock("2026-06-01T22:30:00.000Z", -120);
    expect(localDateKey(afterMidnight)).toBe("2026-06-02");
    expect(tzOffsetMinutes(afterMidnight)).toBe(-120);
    expect(afterMidnight.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("zero-pads month and day and defaults to the device clock", () => {
    expect(localDateKey(deviceClock("2026-01-05T12:00:00.000Z", 0))).toBe(
      "2026-01-05",
    );
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(localDateKey()).toBe(expected);
  });
});

describe("withTz", () => {
  it("appends tz to a path with or without an existing query", () => {
    expect(withTz("/api/nutrition/log", 240)).toBe("/api/nutrition/log?tz=240");
    expect(withTz("/api/nutrition/log?date=2026-06-01", 240)).toBe(
      "/api/nutrition/log?date=2026-06-01&tz=240",
    );
    expect(withTz("/api/nutrition/log?date=2026-06-01", -120)).toBe(
      "/api/nutrition/log?date=2026-06-01&tz=-120",
    );
  });

  it("leaves an existing tz alone and never invents one", () => {
    expect(withTz("/api/nutrition/log?tz=0", 240)).toBe(
      "/api/nutrition/log?tz=0",
    );
    expect(withTz("/api/nutrition/log", Number.NaN)).toBe("/api/nutrition/log");
  });

  it("defaults to the device offset", () => {
    expect(withTz("/api/nutrition/log")).toBe(
      `/api/nutrition/log?tz=${new Date().getTimezoneOffset()}`,
    );
  });
});

describe("tzBodyFields", () => {
  it("carries the offset for a write body, or nothing when unknown", () => {
    expect(tzBodyFields(240)).toEqual({ tz: 240 });
    expect(tzBodyFields(-120)).toEqual({ tz: -120 });
    expect(tzBodyFields(Number.NaN)).toEqual({});
    expect(tzBodyFields()).toEqual({ tz: new Date().getTimezoneOffset() });
  });
});
