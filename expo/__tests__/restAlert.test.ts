import {
  cancelRestAlert,
  createRestAlertHandle,
  REST_ALERT_CHANNEL_ID,
  scheduleRestAlert,
  type RestAlertDeps,
} from "@/lib/live/restAlert";

function grantedDeps(
  overrides: Partial<RestAlertDeps> = {},
): { deps: RestAlertDeps; schedule: jest.Mock; cancel: jest.Mock } {
  const schedule = jest.fn(async (_endsAtMs: number) => "notif-1");
  const cancel = jest.fn(async (_id: string) => undefined);
  return {
    deps: {
      isGranted: async () => true,
      schedule,
      cancel,
      ...overrides,
    },
    schedule,
    cancel,
  };
}

describe("restAlert (NP-082 locked-phone alert)", () => {
  it("schedules the alert for endsAt when permission is already granted", async () => {
    const { deps, schedule } = grantedDeps();
    const handle = createRestAlertHandle();
    const endsAt = Date.now() + 90_000;
    const id = await scheduleRestAlert(handle, endsAt, deps);
    expect(id).toBe("notif-1");
    expect(handle.id).toBe("notif-1");
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(endsAt);
  });

  it("never asks for permission: without grant it stays in-app (null)", async () => {
    const schedule = jest.fn(async () => "notif-1");
    const g = grantedDeps({
      isGranted: async () => false,
      schedule,
    });
    const deps = g.deps;
    const handle = createRestAlertHandle();
    const id = await scheduleRestAlert(handle, Date.now() + 90_000, deps);
    expect(id).toBeNull();
    expect(handle.id).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("a new set cancels the previous alert before scheduling", async () => {
    const { deps, schedule, cancel } = grantedDeps();
    const handle = createRestAlertHandle();
    await scheduleRestAlert(handle, Date.now() + 90_000, deps);
    expect(schedule).toHaveBeenCalledTimes(1);
    await scheduleRestAlert(handle, Date.now() + 60_000, deps);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("notif-1");
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it("cancelRestAlert cancels and clears the handle (skip / finish path)", async () => {
    const { deps, cancel } = grantedDeps();
    const handle = createRestAlertHandle();
    await scheduleRestAlert(handle, Date.now() + 90_000, deps);
    await cancelRestAlert(handle, deps);
    expect(cancel).toHaveBeenCalledWith("notif-1");
    expect(handle.id).toBeNull();
  });

  it("cancelRestAlert with nothing scheduled is a no-op", async () => {
    const { deps, cancel } = grantedDeps();
    const handle = createRestAlertHandle();
    await cancelRestAlert(handle, deps);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("a scheduling failure resolves null and never throws", async () => {
    const schedule = jest.fn(async () => {
      throw new Error("no native module");
    });
    const { deps } = grantedDeps({ schedule });
    const handle = createRestAlertHandle();
    const id = await scheduleRestAlert(handle, Date.now() + 90_000, deps);
    expect(id).toBeNull();
    expect(handle.id).toBeNull();
  });

  it("uses its own Android channel id", () => {
    expect(REST_ALERT_CHANNEL_ID).toBe("rest-timer");
  });
});
