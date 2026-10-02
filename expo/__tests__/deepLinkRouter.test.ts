import { routeForNotification } from "@/lib/push/deepLinkRouter";

// THE SERVER SENDS A URL. Every push from `webapp/app/api/cron/notify/route.ts`
// carries `url: '/dashboard…'`; the categories below were never on the wire, so
// the url is tried first and the category switch is what is left for a payload
// that has none.
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

  it("prefers the url over the category", () => {
    expect(
      routeForNotification({ category: "re-engagement", url: "/dashboard/calendar" }),
    ).toBe("/(tabs)/calendar");
  });

  it("sends a web-only url Home — a tap handler does not open browsers", () => {
    expect(routeForNotification({ url: "/dashboard/admin/users" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("falls back to the category when the url is empty", () => {
    expect(routeForNotification({ category: "re-engagement", url: "  " })).toBe(
      "/(tabs)/mind",
    );
  });

  it("has an answer for a payload with neither", () => {
    expect(routeForNotification({})).toBe("/(tabs)/dashboard");
  });
});

describe("routeForNotification", () => {
  it("workout-reminder with IDs → live workout route", () => {
    expect(
      routeForNotification({
        category: "workout-reminder",
        programId: "p1",
        phaseIndex: 0,
        workoutIndex: 2,
      }),
    ).toBe("/(tabs)/programming/p1/workout/2/live");
  });

  it("workout-reminder without IDs → dashboard fallback", () => {
    expect(routeForNotification({ category: "workout-reminder" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("streak-at-risk → dashboard", () => {
    expect(routeForNotification({ category: "streak-at-risk" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("streak-saved → dashboard", () => {
    expect(routeForNotification({ category: "streak-saved" })).toBe(
      "/(tabs)/dashboard",
    );
  });

  it("re-engagement → mind tab", () => {
    expect(routeForNotification({ category: "re-engagement" })).toBe(
      "/(tabs)/mind",
    );
  });

  it("unknown category → dashboard fallback", () => {
    expect(routeForNotification({ category: "alien-event" })).toBe(
      "/(tabs)/dashboard",
    );
  });
});
