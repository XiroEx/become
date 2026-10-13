import {
  __resetTimezoneReportGate,
  localDayStamp,
  reportTimezoneOnAppOpen,
} from "@/lib/timezone/reportTimezone";
import type { TokenStore } from "@/lib/auth/secureStoreToken";

// ─── Recording the member's timezone when the app opens ──────────────────────
//
// The notify cron skips every member with no stored timezone, and until
// POST /api/me/timezone existed the only route that stored one was
// POST /api/workouts. A member who only logs food, or only runs Mind sessions,
// therefore got no reminders at all.
//
// Native reports on LAUNCH (the gate is process memory, which a cold start
// starts empty) and on the first FOREGROUND of a new LOCAL day. What is pinned
// here is that gate, and the fact that the request carries a NUMBER for `tz`
// with the IANA zone beside it as `tzZone` — never a fabricated 0.

/** 9pm on 15 July in New York: 01:00 UTC on the 16th. */
const NY_EVENING = new Date("2026-07-16T01:00:00Z");
const EDT = 240;

function memoryStore(token: string | null): TokenStore {
  return {
    get: async () => token,
    set: async () => {},
    clear: async () => {},
  };
}

function makeFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => "{}",
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

function bodyOf(call: { init: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init.body));
}

function firstCall(calls: { url: string; init: RequestInit }[]) {
  const call = calls[0];
  if (!call) throw new Error("no request was made");
  return call;
}

beforeEach(() => {
  __resetTimezoneReportGate();
});

describe("reportTimezoneOnAppOpen", () => {
  it("counts the day in the MEMBER's zone, not UTC", () => {
    // 9pm in New York is already tomorrow at UTC. Gating on the UTC date would
    // re-report every evening and then skip the following morning.
    expect(localDayStamp(NY_EVENING, EDT)).toBe("2026-07-15");
    expect(localDayStamp(NY_EVENING, 0)).toBe("2026-07-16");
  });

  it("reports on launch, with tz as a number and the zone beside it", async () => {
    const f = makeFetch();
    const result = await reportTimezoneOnAppOpen({
      store: memoryStore("jwt"),
      fetchImpl: f.impl,
      now: NY_EVENING,
      tzOffsetMinutes: EDT,
      baseUrl: "https://example.test",
    });

    expect(result).toBe("reported");
    expect(f.calls).toHaveLength(1);
    const call = firstCall(f.calls);
    expect(call.url).toContain("https://example.test/api/me/timezone");
    expect(call.init.method).toBe("POST");

    const body = bodyOf(call);
    // The shared client computes both from the device clock — `tz` is minutes
    // west of UTC and the IANA zone travels only as `tzZone`.
    expect(typeof body.tz).toBe("number");
    expect(typeof body.tzZone === "string" || body.tzZone === undefined).toBe(true);
  });

  it("does not report again on a foreground the same local day", async () => {
    const f = makeFetch();
    const deps = {
      store: memoryStore("jwt"),
      fetchImpl: f.impl,
      now: NY_EVENING,
      tzOffsetMinutes: EDT,
      baseUrl: "https://example.test",
    };
    expect(await reportTimezoneOnAppOpen(deps)).toBe("reported");
    expect(await reportTimezoneOnAppOpen(deps)).toBe("already-today");
    expect(await reportTimezoneOnAppOpen(deps)).toBe("already-today");
    expect(f.calls).toHaveLength(1);
  });

  it("reports on the first foreground of a NEW local day", async () => {
    const f = makeFetch();
    const base = {
      store: memoryStore("jwt"),
      fetchImpl: f.impl,
      tzOffsetMinutes: EDT,
      baseUrl: "https://example.test",
    };
    expect(await reportTimezoneOnAppOpen({ ...base, now: NY_EVENING })).toBe("reported");
    // 10am the next morning in New York.
    const nextMorning = new Date("2026-07-16T14:00:00Z");
    expect(await reportTimezoneOnAppOpen({ ...base, now: nextMorning })).toBe("reported");
    expect(f.calls).toHaveLength(2);
  });

  it("a failed report leaves the day open, so the next foreground retries", async () => {
    const bad = makeFetch(500);
    const deps = {
      store: memoryStore("jwt"),
      now: NY_EVENING,
      tzOffsetMinutes: EDT,
      baseUrl: "https://example.test",
    };
    expect(await reportTimezoneOnAppOpen({ ...deps, fetchImpl: bad.impl })).toBe("failed");

    const good = makeFetch();
    expect(await reportTimezoneOnAppOpen({ ...deps, fetchImpl: good.impl })).toBe("reported");
    expect(good.calls).toHaveLength(1);
  });

  it("sends nothing when there is no session to attribute it to", async () => {
    const f = makeFetch();
    const result = await reportTimezoneOnAppOpen({
      store: memoryStore(null),
      fetchImpl: f.impl,
      now: NY_EVENING,
      tzOffsetMinutes: EDT,
      baseUrl: "https://example.test",
    });
    expect(result).toBe("signed-out");
    expect(f.calls).toHaveLength(0);
  });

  it("never sends a stand-in offset when the clock cannot be read", async () => {
    const f = makeFetch();
    const result = await reportTimezoneOnAppOpen({
      store: memoryStore("jwt"),
      fetchImpl: f.impl,
      now: NY_EVENING,
      tzOffsetMinutes: Number.NaN,
      baseUrl: "https://example.test",
    });
    // A fabricated 0 would mark the member UTC and fire their morning push at
    // ~3am local.
    expect(result).toBe("failed");
    expect(f.calls).toHaveLength(0);
  });

  it("an offline open is not an error the member ever sees", async () => {
    const impl = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const result = await reportTimezoneOnAppOpen({
      store: memoryStore("jwt"),
      fetchImpl: impl,
      now: NY_EVENING,
      tzOffsetMinutes: EDT,
      baseUrl: "https://example.test",
    });
    expect(result).toBe("failed");
  });
});
