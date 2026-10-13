import {
  CHANNEL_IDS,
  ensureAndroidChannels,
  getNotificationChannels,
} from "@/lib/android/notificationChannels";

describe("getNotificationChannels", () => {
  const channels = getNotificationChannels();

  it("every server-sent channel id is a server notification tag", () => {
    const serverTags = [
      "workout-reminder",
      "meal-reminder",
      "mind-reminder",
      "streak-at-risk",
      "super-streak-at-risk",
      "goal-nudge",
      "checkin-reminder",
      "schedule-setup",
      "daily-glance",
      "re-engagement",
    ];
    const ids = channels.map((ch) => ch.id);
    for (const tag of serverTags) {
      expect(ids).toContain(tag);
    }
    // No channel id the server never sends — except the local-only rest
    // timer channel (NP-082), which the server never sends by design.
    for (const id of ids) {
      if (id === CHANNEL_IDS.restTimer) continue;
      expect(serverTags).toContain(id);
    }
  });

  it("rest-timer is a local-only high-importance channel with sound + vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.restTimer);
    expect(c).toBeDefined();
    expect(c?.name).toBe("Rest Timer");
    expect(c?.importance).toBe("high");
    expect(c?.sound).toBe(true);
    expect(c?.vibrate).toBe(true);
  });

  it("workout-reminder is high-importance with sound + vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.workoutReminder);
    expect(c).toBeDefined();
    expect(c?.importance).toBe("high");
    expect(c?.sound).toBe(true);
    expect(c?.vibrate).toBe(true);
  });

  it("streak-at-risk is high-importance with sound + vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.streakAtRisk);
    expect(c?.importance).toBe("high");
    expect(c?.sound).toBe(true);
    expect(c?.vibrate).toBe(true);
  });

  it("re-engagement is default-importance with no sound + no vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.reEngagement);
    expect(c?.importance).toBe("default");
    expect(c?.sound).toBe(false);
    expect(c?.vibrate).toBe(false);
  });

  it("daily-glance is default-importance with no sound + no vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.dailyGlance);
    expect(c?.importance).toBe("default");
    expect(c?.sound).toBe(false);
    expect(c?.vibrate).toBe(false);
  });

  it("every channel id is unique", () => {
    const ids = channels.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every channel has a non-empty name + description", () => {
    for (const c of channels) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

describe("ensureAndroidChannels", () => {
  it("is a no-op off Android", async () => {
    const setChannel = jest.fn();
    const result = await ensureAndroidChannels({
      platform: "ios",
      create: { setChannel },
    });
    expect(result).toMatchObject({ kind: "skipped" });
    expect(setChannel).not.toHaveBeenCalled();
  });

  it("creates every channel on Android", async () => {
    const setChannel = jest.fn(async () => null);
    const result = await ensureAndroidChannels({
      platform: "android",
      create: { setChannel },
    });
    expect(result.kind).toBe("created");
    expect(setChannel).toHaveBeenCalledTimes(getNotificationChannels().length);
    const ids = (setChannel.mock.calls as unknown[][]).map((c) => c[0] as string);
    expect(ids).toContain("workout-reminder");
    expect(ids).toContain("re-engagement");
  });

  it("a channel failure is caught, never a crash", async () => {
    const result = await ensureAndroidChannels({
      platform: "android",
      create: {
        setChannel: async () => {
          throw new Error("no native module");
        },
      },
      log: () => {},
    });
    expect(result).toMatchObject({ kind: "failed" });
  });
});
