import { routeForNotification } from "@/lib/push/deepLinkRouter";
import {
  QUIET_FOREGROUND_PRESENTATION,
  handleColdStartTap,
  routeTapResponse,
  startTapRouter,
  urlFromTapResponse,
  type TapDeps,
  type TapResponse,
} from "@/lib/push/tapRouter";

function tapDeps(overrides: Partial<TapDeps> = {}): TapDeps {
  return {
    getColdStartTap: async () => null,
    onBackgroundTap: () => () => {},
    foregroundPresentation: () => ({ ...QUIET_FOREGROUND_PRESENTATION }),
    navigate: jest.fn(),
    log: jest.fn(),
    ...overrides,
  };
}

describe("urlFromTapResponse reads data.url — the only routing input", () => {
  it("reads the url the server sent", () => {
    expect(urlFromTapResponse({ data: { url: "/dashboard/mind" }, isDefaultAction: true })).toBe(
      "/dashboard/mind",
    );
  });

  it("ignores the tag: it identifies the notification, never the route", () => {
    expect(
      urlFromTapResponse({
        data: { url: "/dashboard", tag: "streak-freeze-used" },
        isDefaultAction: true,
      }),
    ).toBe("/dashboard");
    expect(
      urlFromTapResponse({
        data: { url: "/dashboard/chat", tag: "chat-c1" },
        isDefaultAction: true,
      }),
    ).toBe("/dashboard/chat");
  });

  it.each([null, undefined, {}, { data: null }, { data: {} }, { data: { url: "  " } }])(
    "has no url for %p",
    (tap) => {
      expect(urlFromTapResponse(tap as TapResponse)).toBeUndefined();
    },
  );
});

describe("routeTapResponse", () => {
  it("routes a default tap through the resolver", () => {
    const navigate = jest.fn();
    const route = routeTapResponse(
      { data: { url: "/dashboard/nutrition" }, isDefaultAction: true },
      navigate,
    );
    expect(route).toBe("/(tabs)/nutrition");
    expect(navigate).toHaveBeenCalledWith("/(tabs)/nutrition");
  });

  it("ignores a non-default action (an action button the app does not handle)", () => {
    const navigate = jest.fn();
    expect(
      routeTapResponse({ data: { url: "/dashboard/mind" }, isDefaultAction: false }, navigate),
    ).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("routes a tap with no url Home — never nowhere", () => {
    const navigate = jest.fn();
    expect(routeTapResponse({ data: null, isDefaultAction: true }, navigate)).toBe(
      "/(tabs)/dashboard",
    );
    expect(navigate).toHaveBeenCalledWith("/(tabs)/dashboard");
  });
});

describe("every notification type the server sends taps to its screen", () => {
  // tag + url, exactly as the server sends them: the notify cron
  // (`webapp/app/api/cron/notify/route.ts`), the streak-freeze push
  // (`webapp/lib/streak.ts`), the chat push (messages route) and the
  // goal-nudge urls (`webapp/lib/goals/suggestions.ts`).
  it.each([
    ["daily-glance", "/dashboard", "/(tabs)/dashboard"],
    ["streak-at-risk", "/dashboard", "/(tabs)/dashboard"],
    ["streak-freeze-used", "/dashboard", "/(tabs)/dashboard"],
    ["re-engagement", "/dashboard", "/(tabs)/dashboard"],
    ["checkin-reminder", "/dashboard", "/(tabs)/dashboard"],
    ["workout-reminder", "/dashboard/calendar", "/(tabs)/calendar"],
    ["schedule-setup", "/dashboard/calendar", "/(tabs)/calendar"],
    ["meal-reminder", "/dashboard/nutrition", "/(tabs)/nutrition"],
    ["mind-reminder", "/dashboard/mind", "/(tabs)/mind"],
    ["super-streak-at-risk", "/dashboard/streaks", "/(tabs)/dashboard/streaks"],
    ["goal-nudge", "/dashboard/nutrition/goals", "/(tabs)/nutrition/goals"],
    ["goal-nudge", "/dashboard/settings", "/(tabs)/dashboard"],
    ["goal-nudge", "/dashboard/workout", "/(tabs)/programming"],
    ["goal-nudge", "/dashboard/progress", "/progress"],
    ["chat-c1", "/dashboard/chat", "/(tabs)/dashboard"],
  ])("tag %s url %s → %s", (tag, url, expected) => {
    const navigate = jest.fn();
    const route = routeTapResponse(
      { data: { url, tag }, isDefaultAction: true },
      navigate,
    );
    expect(route).toBe(expected);
    expect(navigate).toHaveBeenCalledWith(expected);
  });

  it("a tap on an unknown url opens Home", () => {
    const navigate = jest.fn();
    const route = routeTapResponse(
      { data: { url: "/dashboard/not-a-real-page" }, isDefaultAction: true },
      navigate,
    );
    expect(route).toBe("/(tabs)/dashboard");
    expect(navigate).toHaveBeenCalledWith("/(tabs)/dashboard");
  });
});

describe("handleColdStartTap", () => {
  it("routes the tap the OS held for a killed app", async () => {
    const navigate = jest.fn();
    const route = await handleColdStartTap(
      tapDeps({
        navigate,
        getColdStartTap: async () => ({
          data: { url: "/dashboard/calendar" },
          isDefaultAction: true,
        }),
      }),
    );
    expect(route).toBe("/(tabs)/calendar");
    expect(navigate).toHaveBeenCalledWith("/(tabs)/calendar");
  });

  it("a normal launch (no held tap) navigates nowhere", async () => {
    const navigate = jest.fn();
    await expect(handleColdStartTap(tapDeps({ navigate }))).resolves.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a failing drain never takes the launch with it", async () => {
    const navigate = jest.fn();
    const log = jest.fn();
    await expect(
      handleColdStartTap(
        tapDeps({
          navigate,
          log,
          getColdStartTap: async () => {
            throw new Error("no native module");
          },
        }),
      ),
    ).resolves.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});

describe("startTapRouter", () => {
  it("drains the cold-start tap, subscribes to background taps, and presents quietly in the foreground", async () => {
    const navigate = jest.fn();
    const foregroundPresentation = jest.fn(() => ({ ...QUIET_FOREGROUND_PRESENTATION }));
    const holder: { listener: ((tap: TapResponse) => void) | null } = { listener: null };
    const unsubscribe = jest.fn();
    const deps = tapDeps({
      navigate,
      foregroundPresentation,
      getColdStartTap: async () => ({
        data: { url: "/dashboard/mind" },
        isDefaultAction: true,
      }),
      onBackgroundTap: (listener) => {
        holder.listener = listener;
        return unsubscribe;
      },
    });

    const stop = await startTapRouter(deps);

    // Cold start drained once.
    expect(navigate).toHaveBeenCalledWith("/(tabs)/mind");
    // Foreground presentation installed: reminders never cover the screen.
    expect(foregroundPresentation).toHaveBeenCalledTimes(1);

    // Background tap routed as it arrives.
    holder.listener?.({ data: { url: "/dashboard/streaks" }, isDefaultAction: true });
    expect(navigate).toHaveBeenCalledWith("/(tabs)/dashboard/streaks");

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("a failing subscribe still drains the cold-start tap", async () => {
    const navigate = jest.fn();
    const log = jest.fn();
    const stop = await startTapRouter(
      tapDeps({
        navigate,
        log,
        getColdStartTap: async () => ({
          data: { url: "/dashboard" },
          isDefaultAction: true,
        }),
        onBackgroundTap: () => {
          throw new Error("no native module");
        },
      }),
    );
    expect(navigate).toHaveBeenCalledWith("/(tabs)/dashboard");
    expect(log).toHaveBeenCalled();
    expect(typeof stop).toBe("function");
  });
});

describe("routeForNotification stays url-only", () => {
  it("resolves the chat url to Home while NP-032 keeps chat out", () => {
    expect(routeForNotification({ url: "/dashboard/chat" })).toBe("/(tabs)/dashboard");
    expect(routeForNotification({ url: "/dashboard/chat/c1" })).toBe("/(tabs)/dashboard");
  });
});
