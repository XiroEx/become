import { formatElapsed, overallProgressPercent } from "@/lib/live/liveProgress";

function set(completed: boolean) {
  return {
    reps: null,
    weight: null,
    durationSec: null,
    distance: null,
    speed: null,
    completed,
  };
}

describe("liveProgress", () => {
  it("2 of 4 sets done → 50", () => {
    expect(
      overallProgressPercent({
        a: [set(true), set(true)],
        b: [set(false), set(false)],
      }),
    ).toBe(50);
  });

  it("no sets → 0", () => {
    expect(overallProgressPercent({})).toBe(0);
    expect(overallProgressPercent({ a: [] })).toBe(0);
  });

  it("1 of 3 → 33", () => {
    expect(
      overallProgressPercent({ a: [set(true), set(false), set(false)] }),
    ).toBe(33);
  });

  it("formats elapsed seconds as m:ss", () => {
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(3600)).toBe("60:00");
  });
});
