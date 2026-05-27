import { routeForNotification } from "@/lib/push/deepLinkRouter";

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
