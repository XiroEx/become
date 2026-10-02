import * as fs from "fs";
import * as path from "path";
import {
  NATIVE_ROUTES,
  isBecomeWebHost,
  nativeRouteFor,
  resolveWebPath,
  type ResolvedTarget,
  type RouteFallback,
} from "@/lib/navigation/webPathToRoute";

/**
 * THE ONE TABLE, DRIVEN BY THE SERVER'S OWN SOURCES.
 *
 * The server decides what a link says; the app only decides where it goes. So
 * the urls here are not a list somebody typed — they are READ OUT of
 * `webapp/app/api/cron/notify/route.ts` (every push), `webapp/lib/widgets/feed.ts`
 * (every widget tap), `webapp/lib/goals/suggestions.ts` (the goal-nudge urls the
 * cron sends as `pick.url`) and `webapp/lib/suggestions/**` (the dashboard
 * cards' `primaryAction.href`). Add a url over there and this suite fails until
 * it has a row in the resolver.
 *
 * The rest is the behaviour a member feels:
 *   • a workout link keeps its day label and its slot date;
 *   • both domains and the `become://` scheme resolve identically;
 *   • nothing, ever, resolves to an empty or unmatched route.
 */

const REPO = path.resolve(__dirname, "..", "..");

function readRepo(relative: string): string {
  return fs.readFileSync(path.join(REPO, relative), "utf8");
}

/** Every `'…'` value of `key:` in a source file, in file order, de-duplicated. */
function literalsFor(source: string, key: string): string[] {
  const re = new RegExp(`${key}:\\s*'([^']+)'`, "g");
  const out = new Set<string>();
  for (const match of source.matchAll(re)) {
    const value = match[1];
    if (value && value.startsWith("/")) out.add(value);
  }
  return [...out];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function expectResolvable(url: string): ResolvedTarget {
  const target = resolveWebPath(url);
  // Whatever it is, it is SOMEWHERE: never empty, never a bare query, and for
  // a native target never an unrecognised guess.
  if (target.kind === "native") {
    expect(target.href.startsWith("/")).toBe(true);
    expect(target.href.length).toBeGreaterThan(0);
    expect(target.fallback).not.toBe("unknown");
  } else {
    expect(target.path.startsWith("/")).toBe(true);
  }
  return target;
}

describe("every url the server emits today", () => {
  // ── The notify cron, read from the file ─────────────────────────────────────
  const cron = readRepo("webapp/app/api/cron/notify/route.ts");
  const cronUrls = literalsFor(cron, "url");

  it("finds the notify cron's urls in the cron itself", () => {
    // A regex that quietly matched nothing would make every assertion below
    // vacuous, so pin what the cron is known to send.
    expect(cronUrls).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/dashboard/calendar",
        "/dashboard/nutrition",
        "/dashboard/mind",
        "/dashboard/streaks",
      ]),
    );
    expect(cronUrls.length).toBeGreaterThanOrEqual(5);
    // The cron also sends `url: pick.url` — the goal nudges, covered below.
    expect(cron).toContain("url: pick.url");
  });

  it.each(cronUrls)("notify cron: %s resolves", (url) => {
    const target = expectResolvable(url);
    expect(target.kind).toBe("native");
  });

  // ── The goal nudges the cron sends as `pick.url` ───────────────────────────
  const goalUrls = literalsFor(readRepo("webapp/lib/goals/suggestions.ts"), "url");

  it("finds the goal-nudge urls", () => {
    expect(goalUrls).toEqual(
      expect.arrayContaining([
        "/dashboard/settings",
        "/dashboard/nutrition",
        "/dashboard/nutrition/goals",
        "/dashboard/workout",
        "/dashboard/progress",
      ]),
    );
  });

  it.each(goalUrls)("goal nudge: %s resolves", (url) => {
    expect(expectResolvable(url).kind).toBe("native");
  });

  // ── Widget taps ───────────────────────────────────────────────────────────
  const widgetLinks = literalsFor(
    readRepo("webapp/lib/widgets/feed.ts"),
    "deepLink",
  );

  it("finds the widget deep links", () => {
    expect(widgetLinks).toEqual(
      expect.arrayContaining([
        "/dashboard/streaks",
        "/dashboard/nutrition",
        "/dashboard/mind",
        "/dashboard/mind/becoming",
        "/dashboard/workout",
      ]),
    );
  });

  it.each(widgetLinks)("widget tap: %s resolves", (url) => {
    expect(expectResolvable(url).kind).toBe("native");
  });

  // ── Dashboard suggestion cards (`primaryAction.href`) ─────────────────────
  const cardHrefs = [
    ...new Set(
      [
        ...walk(path.join(REPO, "webapp", "lib", "suggestions")),
        path.join(REPO, "webapp", "lib", "dashboard", "goalTile.ts"),
      ].flatMap((file) => literalsFor(fs.readFileSync(file, "utf8"), "href")),
    ),
  ];

  it("finds the suggestion cards' hrefs", () => {
    expect(cardHrefs).toEqual(
      expect.arrayContaining([
        "/dashboard/nutrition",
        "/dashboard/progress#records",
        "/dashboard/workout/library",
      ]),
    );
  });

  it.each(cardHrefs)("suggestion card: %s resolves", (href) => {
    expect(expectResolvable(href).kind).toBe("native");
  });

  // ── The emails, the live workout, and the billing return ──────────────────
  const OTHER_SERVER_URLS = [
    // webapp/lib/email.ts
    "/verify?token=abcdefgh12345678&mode=login",
    "/verify?token=abcdefgh12345678&mode=register",
    "/dashboard",
    // webapp/lib/accountRestoreToken.ts
    "/account/restore?u=u1&t=0123456789abcdef0123456789abcdef",
    // webapp/app/dashboard/workout/[programId]/workout/live
    "/dashboard/workout/p1/workout/live?day=Day%202&sd=2026-09-29",
    "/dashboard/workout/p1/workout/live?day=Day%202",
    "/dashboard/workout/quick/workout/live?session=qs1",
    "/dashboard/workout/p1/workout?day=Day%201",
    "/dashboard/calendar?date=2026-09-29",
    // webapp/lib/billing/appReturn.ts
    "become://?billing=success&session_id=cs_test_123",
    "become://?billing=cancelled",
    "become://?billing=portal-return",
    "/billing/return?checkout=success&session_id=cs_test_123",
    // webapp/lib/suggestions/workout/progressionNudge.ts (template literal)
    "/dashboard/progress/barbell-back-squat",
  ];

  it.each(OTHER_SERVER_URLS)("%s resolves", (url) => {
    expect(expectResolvable(url).kind).toBe("native");
  });
});

describe("the table", () => {
  const ROWS: [string, string, RouteFallback][] = [
    // Launch, auth and account
    ["/", "/", "exact"],
    ["/verify?token=abc&mode=login", "/verify?token=abc&mode=login", "exact"],
    ["/account/restore?u=u1&t=t1", "/account/restore?u=u1&t=t1", "exact"],
    ["/login", "/login", "exact"],
    ["/register", "/login", "nearest"],
    ["/onboarding", "/onboarding", "exact"],
    // Billing return — no native screen, so the launch route with its params
    ["become://?billing=success&session_id=cs_1", "/?billing=success&session_id=cs_1", "exact"],
    ["/billing/cancelled?checkout=cancelled", "/?checkout=cancelled", "nearest"],
    // Home and its rooms
    ["/dashboard", "/(tabs)/dashboard", "exact"],
    ["/dashboard/streaks", "/(tabs)/dashboard/streaks", "exact"],
    ["/dashboard/plan", "/(tabs)/dashboard", "nearest"],
    ["/dashboard/settings?tab=training", "/(tabs)/dashboard?tab=training", "nearest"],
    ["/dashboard/profile", "/(tabs)/profile", "exact"],
    ["/profile", "/(tabs)/profile", "exact"],
    ["/dashboard/customize", "/(tabs)/dashboard", "nearest"],
    // Calendar
    ["/dashboard/calendar", "/(tabs)/calendar", "exact"],
    ["/dashboard/calendar?date=2026-09-29", "/(tabs)/calendar?date=2026-09-29", "exact"],
    ["/dashboard/calendar/settings", "/(tabs)/calendar/settings", "exact"],
    // Nutrition
    ["/dashboard/nutrition", "/(tabs)/nutrition", "exact"],
    ["/dashboard/nutrition?date=2026-09-29", "/(tabs)/nutrition?date=2026-09-29", "exact"],
    ["/dashboard/nutrition/goals", "/(tabs)/nutrition", "nearest"],
    ["/dashboard/nutrition/meal-schedule", "/(tabs)/nutrition/meal-schedule", "exact"],
    ["/dashboard/nutrition/recipes", "/(tabs)/nutrition/recipes", "exact"],
    ["/dashboard/recipes/r1", "/(tabs)/nutrition/recipes/r1", "exact"],
    ["/dashboard/recipes/new", "/(tabs)/nutrition/recipes", "nearest"],
    ["/dashboard/recipes/r1/edit", "/(tabs)/nutrition/recipes", "nearest"],
    ["/dashboard/foods/f1", "/(tabs)/nutrition/food/f1", "exact"],
    ["/dashboard/meals/m1", "/(tabs)/nutrition", "nearest"],
    ["/dashboard/meal-plan", "/(tabs)/nutrition", "nearest"],
    ["/dashboard/timeline", "/(tabs)/nutrition", "nearest"],
    // Mind
    ["/dashboard/mind", "/(tabs)/mind", "exact"],
    ["/dashboard/mind?start=1", "/(tabs)/mind?start=1", "exact"],
    ["become://mind", "/(tabs)/mind", "exact"],
    ["become://mind?start=1", "/(tabs)/mind?start=1", "exact"],
    ["/dashboard/mind/becoming", "/(tabs)/mind", "nearest"],
    ["/dashboard/mind/arsenal", "/(tabs)/mind", "nearest"],
    // Training
    ["/dashboard/workout", "/(tabs)/programming", "exact"],
    ["/dashboard/workout/hub", "/(tabs)/programming", "nearest"],
    ["/dashboard/workout/library", "/(tabs)/programming", "nearest"],
    ["/dashboard/workout/p1", "/(tabs)/programming/p1", "exact"],
    ["/dashboard/workout/p1/journey", "/(tabs)/programming/p1", "nearest"],
    ["/dashboard/workout/p1/schedule", "/(tabs)/calendar/settings", "nearest"],
    ["/dashboard/workout/p1/workout?day=Day%201", "/(tabs)/programming/p1/workout/0?day=Day%201", "exact"],
    [
      "/dashboard/workout/p1/workout/live?day=Day%203&sd=2026-09-29",
      "/(tabs)/programming/p1/workout/2/live?day=Day%203&sd=2026-09-29",
      "exact",
    ],
    ["/dashboard/workout/p1/workout/live", "/(tabs)/programming/p1", "nearest"],
    ["/dashboard/workout/quick/workout/live?session=s1", "/(tabs)/programming?session=s1", "nearest"],
    ["/dashboard/programs/mine", "/(tabs)/programming/saved", "nearest"],
    ["/dashboard/programs/new", "/(tabs)/programming", "nearest"],
    ["/dashboard/programs/p1/edit", "/(tabs)/programming", "nearest"],
    ["/dashboard/history", "/(tabs)/programming", "nearest"],
    ["/dashboard/progress", "/(tabs)/programming", "nearest"],
    ["/dashboard/progress#records", "/(tabs)/programming", "nearest"],
    ["/dashboard/insights/weight", "/(tabs)/programming", "nearest"],
    // Chat and community — hidden in v1 (NP-032)
    ["/dashboard/chat", "/(tabs)/dashboard", "hidden"],
    ["/dashboard/chat/c1", "/(tabs)/dashboard", "hidden"],
    ["/dashboard/community", "/(tabs)/dashboard", "hidden"],
    ["/dashboard/groups/g1", "/(tabs)/dashboard", "hidden"],
    ["/dashboard/events/e1", "/(tabs)/dashboard", "hidden"],
    // Anything else: Home, and it says it was a guess
    ["/dashboard/not-a-real-page", "/(tabs)/dashboard", "unknown"],
    ["/not-a-real-page", "/(tabs)/dashboard", "unknown"],
  ];

  it.each(ROWS)("%s → %s (%s)", (input, href, fallback) => {
    const target = resolveWebPath(input);
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;
    expect(target.href).toBe(href);
    expect(target.fallback).toBe(fallback);
  });

  it("routes a native route it is handed straight through", () => {
    // `+native-intent` sees these whenever the app links to itself.
    for (const route of [
      "/(tabs)/dashboard",
      "/(tabs)/programming/p1/workout/2/live",
      "/_stories",
    ]) {
      const target = resolveWebPath(route);
      expect(target).toMatchObject({ kind: "native", href: route, fallback: "exact" });
    }
  });

  it("opens the web-only surfaces on the web", () => {
    for (const webPath of [
      "/dashboard/admin/users",
      "/dashboard/admin/foods/f1",
      "/dashboard/dev/tile-gallery",
      "/privacy",
      "/terms",
      "/support",
      "/delete-account",
      "/share/abc123",
    ]) {
      const target = resolveWebPath(webPath);
      expect(target).toEqual({
        kind: "web",
        path: webPath,
        href: webPath,
        fallback: "web-only",
      });
    }
  });

  it("hands a web-only surface to Home when the caller can only navigate", () => {
    expect(nativeRouteFor("/dashboard/admin/users")).toBe(NATIVE_ROUTES.home);
  });

  it("routes chat properly once NP-032's flag opens community", () => {
    expect(resolveWebPath("/dashboard/chat", { communityEnabled: true })).toMatchObject({
      href: "/(tabs)/chat",
      fallback: "exact",
    });
    expect(
      resolveWebPath("/dashboard/chat/c1", { communityEnabled: true }),
    ).toMatchObject({ href: "/(tabs)/chat/c1", fallback: "exact" });
  });
});

describe("a workout link keeps its day label and slot date", () => {
  it("carries both through to the live workout, and picks the workout by day", () => {
    const target = resolveWebPath(
      "/dashboard/workout/68f2a1/workout/live?day=Day%2012&sd=2026-09-29",
    );
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;

    // "Day 12" is the 12th workout, which is index 11 — the same translation
    // the calendar already uses (lib/schedule/scheduleSlots.ts).
    expect(target.pathname).toBe("/(tabs)/programming/68f2a1/workout/11/live");
    expect(target.params).toEqual({ day: "Day 12", sd: "2026-09-29" });
    // And they are still ON the href, so the screen can read them.
    expect(target.href).toBe(
      "/(tabs)/programming/68f2a1/workout/11/live?day=Day%2012&sd=2026-09-29",
    );
  });

  it("keeps a day label with a space encoded as %20, never as +", () => {
    const target = resolveWebPath(
      "/dashboard/workout/p1/workout/live?day=Upper%20Body%202",
    );
    if (target.kind !== "native") throw new Error("expected a native target");
    expect(target.href).toContain("day=Upper%20Body%202");
    expect(target.href).not.toContain("+");
  });

  it("does not invent a workout when the link carries no day", () => {
    const target = resolveWebPath("/dashboard/workout/p1/workout/live?sd=2026-09-29");
    if (target.kind !== "native") throw new Error("expected a native target");
    expect(target.pathname).toBe("/(tabs)/programming/p1");
    expect(target.params).toEqual({ sd: "2026-09-29" });
    expect(target.fallback).toBe("nearest");
  });
});

describe("both domains and the custom scheme", () => {
  const PATHS = [
    "/dashboard",
    "/dashboard/streaks",
    "/dashboard/mind/becoming",
    "/dashboard/calendar?date=2026-09-29",
    "/verify?token=abcdefgh12345678&mode=login",
    "/account/restore?u=u1&t=t1",
    "/dashboard/workout/p1/workout/live?day=Day%202&sd=2026-09-29",
  ];

  it.each(PATHS)("%s resolves the same from every shape it arrives in", (p) => {
    const expected = resolveWebPath(p);
    const shapes = [
      `https://become.redbtn.io${p}`,
      `https://www.become.redbtn.io${p}`,
      `https://become-beta.redbtn.io${p}`,
      `https://becomeurbest.com${p}`,
      `https://www.becomeurbest.com${p}`,
      `become://${p.slice(1)}`,
    ];
    for (const shape of shapes) {
      expect(resolveWebPath(shape)).toEqual(expected);
    }
  });

  it("knows which hosts are ours", () => {
    expect(isBecomeWebHost("become.redbtn.io")).toBe(true);
    expect(isBecomeWebHost("BECOMEURBEST.COM")).toBe(true);
    expect(isBecomeWebHost("evil.example")).toBe(false);
    expect(isBecomeWebHost(null)).toBe(false);
  });

  it("refuses to be steered by anyone else", () => {
    for (const hostile of [
      "https://evil.example/dashboard/streaks",
      "https://become.redbtn.io.evil.example/dashboard",
      "//evil.example/dashboard",
      "javascript:alert(1)",
      "otherapp://dashboard/streaks",
      "not a url",
      "",
    ]) {
      const target = resolveWebPath(hostile);
      expect(target).toMatchObject({
        kind: "native",
        href: NATIVE_ROUTES.home,
        fallback: "unknown",
      });
    }
  });

  it("never returns nothing", () => {
    for (const nonsense of [null, undefined, "   "]) {
      expect(nativeRouteFor(nonsense)).toBe(NATIVE_ROUTES.home);
    }
  });
});
