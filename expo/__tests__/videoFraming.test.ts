import {
  detectOrientation,
  resolveFraming,
} from "@/lib/videoFraming";

describe("videoFraming", () => {
  it("detects landscape, portrait, and square", () => {
    expect(detectOrientation(1920, 1080)).toBe("landscape");
    expect(detectOrientation(1080, 1920)).toBe("portrait");
    expect(detectOrientation(1000, 1000)).toBe("square");
    expect(detectOrientation(0, 0)).toBe("unknown");
    expect(detectOrientation(null, null)).toBe("unknown");
  });

  it("applies auto framing for landscape source", () => {
    const fLive = resolveFraming({ videoWidth: 1920, videoHeight: 1080 }, "live");
    expect(fLive.fit).toBe("cover");
    expect(fLive.positionX).toBe(50);
    expect(fLive.positionY).toBe(50);
    expect(fLive.zoom).toBe(100);
    expect(fLive.isAuto).toBe(true);

    const fForm = resolveFraming({ videoWidth: 1920, videoHeight: 1080 }, "form");
    expect(fForm.fit).toBe("cover");
  });

  it("applies portrait tilt (positionY 40) for portrait source", () => {
    const f = resolveFraming({ videoWidth: 1080, videoHeight: 1920 }, "live");
    expect(f.fit).toBe("cover");
    expect(f.positionY).toBe(40);
  });

  it("admin overrides win per-field", () => {
    const f = resolveFraming(
      {
        videoWidth: 1920,
        videoHeight: 1080,
        videoFraming: {
          fit: "contain",
          positionY: 25,
          zoom: 150,
        },
      },
      "live",
    );
    expect(f.fit).toBe("contain");
    expect(f.positionX).toBe(50); // auto fallback
    expect(f.positionY).toBe(25); // overridden
    expect(f.zoom).toBe(150);     // overridden
    expect(f.isAuto).toBe(false);
  });

  it("clamps out-of-bounds manual overrides", () => {
    const f = resolveFraming(
      {
        videoWidth: 1920,
        videoHeight: 1080,
        videoFraming: {
          positionX: -20,
          positionY: 150,
          zoom: 500,
        },
      },
      "form",
    );
    expect(f.positionX).toBe(0);
    expect(f.positionY).toBe(100);
    expect(f.zoom).toBe(400);
  });
});
