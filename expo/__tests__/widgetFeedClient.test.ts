/**
 * ─── Reading the feed with a widgets token ───────────────────────────────────
 *
 * One request for all four tiles, the token in the header, the offset on the
 * query — and, above all, the right reading of each answer:
 *
 *   401/403 → REVOKED. This is what a sign-out leaves behind: the token is still
 *   syntactically fine and still months from its `exp`, but the stored
 *   `widgetTokenVersion` has moved past it. There is no retry; the tile shows the
 *   sign-in prompt and the credential is dropped.
 *
 *   anything else that is not a feed → UNREACHABLE. Offline, a 5xx, a gateway
 *   page, a body shaped differently by a future server: none of them is a reason
 *   to throw away a working token and sign four widgets out of a live account.
 */
import { fetchWidgetFeed, feedRow } from "@/lib/widgets/feed";
import type { WidgetFeed } from "@become/api-client";

const TOKEN = "widgets.jwt.value";
const BASE = "https://become.test";

const FEED = {
  generatedAt: 1_780_000_000_000,
  todayKey: "2026-09-29",
  refreshAfterSeconds: 900,
  badgeCount: 2,
  widgets: [
    {
      key: "streak",
      title: "Streak",
      headline: "12",
      headlineUnit: "days",
      caption: "2 days to 14",
      state: "done",
      progress: 0.857,
      rings: [],
      deepLink: "/dashboard/streaks",
    },
    {
      key: "nutrition",
      title: "Nutrition",
      headline: "820",
      headlineUnit: "cal left",
      caption: "P 120/160g · C 180/240g · F 40/60g",
      state: "todo",
      progress: 0.6,
      rings: [
        {
          key: "calories",
          label: "Cal",
          value: 1180,
          target: 2000,
          pct: 0.59,
          unit: "cal",
        },
      ],
      deepLink: "/dashboard/nutrition",
    },
  ],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchWidgetFeed", () => {
  it("GETs the summary with the WIDGETS token and the device offset", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return response(FEED);
    }) as unknown as typeof fetch;

    const result = await fetchWidgetFeed(TOKEN, {
      baseUrl: BASE,
      fetchImpl,
      tzOffsetMinutes: 240,
    });

    expect(result.kind).toBe("ok");
    // `tz` is minutes WEST of UTC — the one wire format this client uses.
    expect(seen[0]?.url).toBe(`${BASE}/api/widgets/summary?tz=240`);
    expect(seen[0]?.init?.method).toBe("GET");
    expect(
      (seen[0]?.init?.headers as Record<string, string>)?.Authorization,
    ).toBe(`Bearer ${TOKEN}`);
  });

  it("omits tz when the device cannot report one, rather than sending 0", async () => {
    const seen: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      seen.push(url);
      return response(FEED);
    }) as unknown as typeof fetch;

    await fetchWidgetFeed(TOKEN, {
      baseUrl: BASE,
      fetchImpl,
      tzOffsetMinutes: Number.NaN,
    });

    expect(seen[0]).toBe(`${BASE}/api/widgets/summary`);
  });

  it("parses the feed it was sent", async () => {
    const fetchImpl = jest.fn(async () =>
      response(FEED),
    ) as unknown as typeof fetch;
    const result = await fetchWidgetFeed(TOKEN, { baseUrl: BASE, fetchImpl });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.feed.todayKey).toBe("2026-09-29");
    expect(result.feed.widgets).toHaveLength(2);
    expect(feedRow(result.feed, "nutrition")?.headline).toBe("820");
    expect(feedRow(result.feed, "mind")).toBeNull();
  });

  it("reads a 401 as revoked — the member signed out", async () => {
    const fetchImpl = jest.fn(async () =>
      response({ error: "Unauthorized" }, 401),
    ) as unknown as typeof fetch;
    expect(
      (await fetchWidgetFeed(TOKEN, { baseUrl: BASE, fetchImpl })).kind,
    ).toBe("revoked");
  });

  it("reads a 5xx as unreachable, keeping the token", async () => {
    const fetchImpl = jest.fn(async () =>
      response({ error: "Internal server error" }, 503),
    ) as unknown as typeof fetch;
    expect(
      (await fetchWidgetFeed(TOKEN, { baseUrl: BASE, fetchImpl })).kind,
    ).toBe("unreachable");
  });

  it("reads an offline fetch as unreachable and never throws", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(
      (await fetchWidgetFeed(TOKEN, { baseUrl: BASE, fetchImpl })).kind,
    ).toBe("unreachable");
  });

  it("reads an unexpected body as unreachable, NOT as a revocation", async () => {
    const fetchImpl = jest.fn(async () =>
      response({ widgets: "not an array" }),
    ) as unknown as typeof fetch;
    expect(
      (await fetchWidgetFeed(TOKEN, { baseUrl: BASE, fetchImpl })).kind,
    ).toBe("unreachable");
  });

  // The schema is permissive on purpose (`.passthrough()`, optional meta): a
  // server that adds a field must not blank four home-screen tiles.
  it("accepts a feed carrying fields this build has never heard of", async () => {
    const fetchImpl = jest.fn(async () =>
      response({
        ...FEED,
        somethingNew: true,
        widgets: [{ ...FEED.widgets[0], brandNew: 1 }],
      }),
    ) as unknown as typeof fetch;
    const result = await fetchWidgetFeed(TOKEN, { baseUrl: BASE, fetchImpl });
    expect(result.kind).toBe("ok");
  });
});

describe("feedRow", () => {
  it("picks a row by key and says null when the feed did not carry it", () => {
    const feed = { widgets: [] } as unknown as WidgetFeed;
    expect(feedRow(feed, "streak")).toBeNull();
  });
});
