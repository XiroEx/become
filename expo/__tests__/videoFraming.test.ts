import { detectOrientation, resolveFraming } from "@/lib/videoFraming";

describe("videoFraming", () => {
  describe("detectOrientation", () => {
    it("detects landscape", () => {
      expect(detectOrientation(1920, 1080)).toBe("landscape");
      expect(detectOrientation(1200, 1000)).toBe("landscape"); // 1.2 > 1.1
    });

    it("detects portrait", () => {
      expect(detectOrientation(1080, 1920)).toBe("portrait");
      expect(detectOrientation(800, 1000)).toBe("portrait"); // 0.8 < 0.9
    });

    it("detects square", () => {
      expect(detectOrientation(1000, 1000)).toBe("square");
      expect(detectOrientation(1000, 1050)).toBe("square"); // 0.95
    });

    it("handles missing or invalid dimensions", () => {
      expect(detectOrientation(null, null)).toBe("unknown");
      expect(detectOrientation(0, 1080)).toBe("unknown");
      expect(detectOrientation(-100, 100)).toBe("unknown");
    });
  });

  describe("resolveFraming", () => {
    it("auto landscape on form surface", () => {
      const res = resolveFraming({ videoWidth: 1920, videoHeight: 1080 }, "form");
      expect(res.fit).toBe("cover");
      expect(res.positionX).toBe(50);
      expect(res.positionY).toBe(50);
      expect(res.zoom).toBe(100);
      expect(res.isAuto).toBe(true);
      expect(res.detectedOrientation).toBe("landscape");
    });

    it("auto portrait on live surface tilts positionY to 40", () => {
      const res = resolveFraming({ videoWidth: 1080, videoHeight: 1920 }, "live");
      expect(res.fit).toBe("cover");
      expect(res.positionX).toBe(50);
      expect(res.positionY).toBe(40);
      expect(res.zoom).toBe(100);
      expect(res.isAuto).toBe(true);
      expect(res.detectedOrientation).toBe("portrait");
    });

    it("manual override overrides only specified fields", () => {
      const res = resolveFraming(
        {
          videoWidth: 1080,
          videoHeight: 1920,
          videoFraming: { positionY: 65, zoom: 150 },
        },
        "live",
      );
      expect(res.fit).toBe("cover"); // auto
      expect(res.positionX).toBe(50); // auto
      expect(res.positionY).toBe(65); // override
      expect(res.zoom).toBe(150); // override
      expect(res.isAuto).toBe(false);
    });

    it("manual fit override is respected", () => {
      const res = resolveFraming(
        {
          videoWidth: 1920,
          videoHeight: 1080,
          videoFraming: { fit: "contain" },
        },
        "form",
      );
      expect(res.fit).toBe("contain");
      expect(res.isAuto).toBe(false);
    });

    it("clamps position and zoom", () => {
      const res = resolveFraming(
        {
          videoWidth: 1920,
          videoHeight: 1080,
          videoFraming: { positionX: -20, positionY: 150, zoom: 500 },
        },
        "preview",
      );
      expect(res.positionX).toBe(0);
      expect(res.positionY).toBe(100);
      expect(res.zoom).toBe(400);
    });
  });
});
