import { routeForNotification } from "@/lib/push/deepLinkRouter";

// THE SERVER SENDS A URL. Every push from `webapp/app/api/cron/notify/route.ts`
// carries `url: '/dashboard…'`; the streak-freeze push (`webapp/lib/streak.ts`)
// carries `url: '/dashboard'` with `tag: 'streak-freeze-used'`; chat pushes
// carry `url: '/dashboard/chat'`. The `tag` identifies the notification for
// replacement/dedup and never routes — so the url is tried first and only,
// and a payload with no url opens Home.

describe("routeForNotification with the url the server actually sends", () => {
  it.each([
    ["/dashboard", "/(tabs)/dashboard"],
    ["/dashboard/calendar", "/(tabs)/calendar"],
    ["/dashboard/nutrition", "/(tabs)/nutrition"],
    ["/dashboard/mind", "/(tabs)/mind"],
    ["/dashboard/streaks", "/(tabs)/dashboard/streaks"],
    ["/dashboard/settings?tab=training", "/(tabs)/dashboard?tab=training"],
    ["/dashboard/workout", "/(tabs)/programming"],
    ["/dashboard/progress", "/progress"],
    [
      "https://becomeurbest.com/dashboard/workout/p1/workout/live?day=Day%202&sd=2026-09-29",
      "/(tabs)/programming/p1/workout/1/live?day=Day%202&sd=2026-09-29",
    ],
  ])("%s → %s", (url, route) => {
    expect(routeForNotification({ url })).toBe(route);
  });

  it("sends a web-only url Home — a tap router does not open browsers", () => {
    expect(routeForNotification({ url: "/dashboard/admin/users" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("resolves the chat url to Home while NP-032 keeps chat out", () => {
    expect(routeForNotification({ url: "/dashboard/chat" })).toBe(
      "/(tabs)/dashboard",
    );
    expect(routeForNotification({ url: "/dashboard/chat/c1" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("resolves the streak-freeze url to Home", () => {
    expect(routeForNotification({ url: "/dashboard" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("opens Home for a payload with no url — never nowhere", () => {
    expect(routeForNotification({})).toBe("/(tabs)/dashboard");
    expect(routeForNotification({ url: "  " })).toBe("/(tabs)/dashboard");
  });

  it("opens Home for an unknown url", () => {
    expect(routeForNotification({ url: "/dashboard/not-a-real-page" })).toBe(
      "/(tabs)/dashboard",
    );
    expect(routeForNotification({ url: "/not-a-real-page" })).toBe(
      "/(tabs)/dashboard",
    );
  });
});
