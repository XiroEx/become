import {
  MIN_TRIM_DURATION,
  formatTimecode,
  resolveTrim,
} from "@/lib/videoTrim";

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
    expect(r.isFullLength).toBe(false);
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

  it("degenerate window (< MIN_TRIM_DURATION) drops the end bound", () => {
    const r = resolveTrim({ videoTrim: { start: 5, end: 5.2 } }, 10);
    expect(r.start).toBe(5);
    expect(r.end).toBeNull();
  });

  it("inverted window drops the end bound", () => {
    const r = resolveTrim({ videoTrim: { start: 6, end: 4 } }, 10);
    expect(r.start).toBe(6);
    expect(r.end).toBeNull();
  });

  it("normalises end at full duration to full length", () => {
    const r = resolveTrim({ videoTrim: { start: 0, end: 10 } }, 10);
    expect(r.start).toBe(0);
    expect(r.end).toBeNull();
    expect(r.isFullLength).toBe(true);
  });

  it("formatTimecode formats minutes and tenths", () => {
    expect(formatTimecode(0)).toBe("0:00.0");
    expect(formatTimecode(72.4)).toBe("1:12.4");
    expect(formatTimecode(-5)).toBe("0:00.0");
  });
});
