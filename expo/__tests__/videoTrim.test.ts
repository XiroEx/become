import {
  resolveTrim,
  formatTimecode,
  MIN_TRIM_DURATION,
} from "@/lib/videoTrim";

describe("videoTrim", () => {
  describe("resolveTrim", () => {
    it("returns isFullLength=true when no trim is configured", () => {
      const result = resolveTrim(null, 10);
      expect(result).toEqual({
        start: 0,
        end: null,
        isFullLength: true,
      });
    });

    it("respects valid start and end bounds", () => {
      const result = resolveTrim({ videoTrim: { start: 2.5, end: 7.5 } }, 10);
      expect(result).toEqual({
        start: 2.5,
        end: 7.5,
        isFullLength: false,
      });
    });

    it("clamps start to 0 if start is beyond duration", () => {
      const result = resolveTrim({ videoTrim: { start: 15, end: 18 } }, 10);
      expect(result.start).toBe(0);
    });

    it("clamps end to duration if end exceeds duration", () => {
      const result = resolveTrim({ videoTrim: { start: 2, end: 15 } }, 10);
      expect(result.end).toBe(10);
    });

    it("drops end if window is shorter than MIN_TRIM_DURATION", () => {
      const result = resolveTrim(
        { videoTrim: { start: 5, end: 5 + MIN_TRIM_DURATION - 0.1 } },
        10,
      );
      expect(result.end).toBeNull();
    });

    it("treats end at or beyond duration with start=0 as full length", () => {
      const result = resolveTrim({ videoTrim: { start: 0, end: 10 } }, 10);
      expect(result.isFullLength).toBe(true);
      expect(result.end).toBeNull();
    });

    it("handles missing duration gracefully", () => {
      const result = resolveTrim({ videoTrim: { start: 3, end: 8 } }, null);
      expect(result).toEqual({
        start: 3,
        end: 8,
        isFullLength: false,
      });
    });
  });

  describe("formatTimecode", () => {
    it("formats seconds into mm:ss.s", () => {
      expect(formatTimecode(72.4)).toBe("1:12.4");
      expect(formatTimecode(0)).toBe("0:00.0");
      expect(formatTimecode(5.2)).toBe("0:05.2");
      expect(formatTimecode(-1)).toBe("0:00.0");
    });
  });
});
