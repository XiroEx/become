import {
  CHANNEL_IDS,
  getNotificationChannels,
} from "@/lib/android/notificationChannels";

describe("getNotificationChannels", () => {
  const channels = getNotificationChannels();

  it("returns exactly 4 channels", () => {
    expect(channels).toHaveLength(4);
  });

  it("workout-reminders is high-importance with sound + vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.workoutReminders);
    expect(c).toBeDefined();
    expect(c?.importance).toBe("high");
    expect(c?.sound).toBe(true);
    expect(c?.vibrate).toBe(true);
  });

  it("streak-alerts is high-importance with sound + vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.streakAlerts);
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

  it("streak-saved is default-importance with sound but no vibrate", () => {
    const c = channels.find((ch) => ch.id === CHANNEL_IDS.streakSaved);
    expect(c?.importance).toBe("default");
    expect(c?.sound).toBe(true);
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
