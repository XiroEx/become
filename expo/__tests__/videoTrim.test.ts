import { MIN_TRIM_DURATION, formatTimecode, resolveTrim } from "@/lib/videoTrim";

describe("videoTrim", () => {
  it("no trim stored → full length", () => {
    const r = resolveTrim({ videoTrim: null }, 30);
    expect(r.start).toBe(0);
    expect(r.end).toBeNull();
    expect(r.isFullLength).toBe(true);
  });

  it("missing input object is treated as full length, not a crash", () => {
    expect(resolveTrim(undefined, 30).isFullLength).toBe(true);
    expect(resolveTrim(null, 30).isFullLength).toBe(true);
  });

  it("a normal window is preserved", () => {
    const r = resolveTrim({ videoTrim: { start: 2, end: 8 } }, 30);
    expect(r.start).toBe(2);
    expect(r.end).toBe(8);
    expect(r.isFullLength).toBe(false);
  });

  it("window survives before duration is known", () => {
    const r = resolveTrim({ videoTrim: { start: 2, end: 8 } }, null);
    expect(r.start).toBe(2);
    expect(r.end).toBe(8);
  });

  it("a start past the end of the file falls back to 0 rather than stalling", () => {
    const r = resolveTrim({ videoTrim: { start: 45, end: 50 } }, 10);
    expect(r.start).toBe(0);
  });

  it("an end past the real duration is clamped to the duration", () => {
    const r = resolveTrim({ videoTrim: { start: 1, end: 90 } }, 10);
    expect(r.start).toBe(1);
    expect(r.end).toBe(10);
  });

  it("a window shorter than the floor drops the end bound", () => {
    const r = resolveTrim({ videoTrim: { start: 5, end: 5.1 } }, 30);
    expect(r.start).toBe(5);
    expect(r.end).toBeNull();
  });

  it("an inverted window degrades to playable rather than throwing", () => {
    const r = resolveTrim({ videoTrim: { start: 8, end: 2 } }, 30);
    expect(r.start).toBe(8);
    expect(r.end).toBeNull();
  });

  it("exactly the minimum duration is allowed", () => {
    const r = resolveTrim({ videoTrim: { start: 1, end: 1 + MIN_TRIM_DURATION } }, 30);
    expect(r.end).toBe(1 + MIN_TRIM_DURATION);
  });

  it("an end at the real duration with no start is reported as full length", () => {
    const r = resolveTrim({ videoTrim: { start: 0, end: 30 } }, 30);
    expect(r.isFullLength).toBe(true);
    expect(r.end).toBeNull();
  });

  it("a trimmed start is never reported as full length", () => {
    const r = resolveTrim({ videoTrim: { start: 3 } }, 30);
    expect(r.start).toBe(3);
    expect(r.isFullLength).toBe(false);
  });

  it("non-numeric junk in the stored doc is ignored", () => {
    const r = resolveTrim(
      { videoTrim: { start: NaN, end: Infinity } as unknown as { start: number; end: number } },
      30,
    );
    expect(r.start).toBe(0);
    expect(r.end).toBeNull();
    expect(r.isFullLength).toBe(true);
  });

  it("negative bounds are floored at zero", () => {
    const r = resolveTrim({ videoTrim: { start: -5, end: 6 } }, 30);
    expect(r.start).toBe(0);
    expect(r.end).toBe(6);
  });

  it("formatTimecode renders minutes and tenths", () => {
    expect(formatTimecode(0)).toBe("0:00.0");
    expect(formatTimecode(9.25)).toBe("0:09.3");
    expect(formatTimecode(72.4)).toBe("1:12.4");
    expect(formatTimecode(-1)).toBe("0:00.0");
  });
});
