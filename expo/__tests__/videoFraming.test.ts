import {
  detectOrientation,
  resolveFraming,
} from "@/lib/videoFraming";

describe("videoFraming", () => {
  describe("detectOrientation", () => {
    it("detects landscape", () => {
      expect(detectOrientation(1920, 1080)).toBe("landscape");
      expect(detectOrientation(1200, 1000)).toBe("landscape");
    });

    it("detects portrait", () => {
      expect(detectOrientation(1080, 1920)).toBe("portrait");
      expect(detectOrientation(720, 1280)).toBe("portrait");
    });

    it("detects square", () => {
      expect(detectOrientation(1000, 1000)).toBe("square");
      expect(detectOrientation(1050, 1000)).toBe("square");
    });

    it("returns unknown when dimensions are missing or invalid", () => {
      expect(detectOrientation(null, null)).toBe("unknown");
      expect(detectOrientation(0, 100)).toBe("unknown");
      expect(detectOrientation(100, 0)).toBe("unknown");
      expect(detectOrientation(-10, 100)).toBe("unknown");
    });
  });

  describe("resolveFraming", () => {
    it("resolves auto framing for landscape on live surface", () => {
      const framing = resolveFraming(
        { videoWidth: 1920, videoHeight: 1080 },
        "live",
      );
      expect(framing).toEqual({
        fit: "cover",
        positionX: 50,
        positionY: 50,
        zoom: 100,
        isAuto: true,
        detectedOrientation: "landscape",
      });
    });

    it("resolves auto framing for portrait on live surface with positionY=40", () => {
      const framing = resolveFraming(
        { videoWidth: 1080, videoHeight: 1920 },
        "live",
      );
      expect(framing).toEqual({
        fit: "cover",
        positionX: 50,
        positionY: 40,
        zoom: 100,
        isAuto: true,
        detectedOrientation: "portrait",
      });
    });

    it("respects manual overrides for fit, position and zoom", () => {
      const framing = resolveFraming(
        {
          videoWidth: 1920,
          videoHeight: 1080,
          videoFraming: {
            fit: "contain",
            positionX: 30,
            positionY: 70,
            zoom: 150,
          },
        },
        "preview",
      );
      expect(framing).toEqual({
        fit: "contain",
        positionX: 30,
        positionY: 70,
        zoom: 150,
        isAuto: false,
        detectedOrientation: "landscape",
      });
    });

    it("clamps overrides within safe limits", () => {
      const framing = resolveFraming(
        {
          videoWidth: 1000,
          videoHeight: 1000,
          videoFraming: {
            positionX: 150,
            positionY: -20,
            zoom: 500,
          },
        },
        "form",
      );
      expect(framing.positionX).toBe(100);
      expect(framing.positionY).toBe(0);
      expect(framing.zoom).toBe(400);
      expect(framing.isAuto).toBe(false);
    });
  });
});
