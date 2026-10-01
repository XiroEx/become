import {
  resolveExerciseVideo,
  getExerciseVideoDisplay,
  getExerciseVideoUrl,
  getExerciseThumbnail,
  invalidateExerciseVideoCache,
  setExerciseVideoCacheForTesting,
  type ExerciseVideoDisplay,
} from "@/lib/data/exerciseVideos";

describe("exerciseVideos", () => {
  afterEach(() => {
    invalidateExerciseVideoCache();
  });

  describe("resolveExerciseVideo", () => {
    const legacyRow: ExerciseVideoDisplay = {
      videoUrl: "https://cdn.example.com/legacy-squat.mp4",
      thumbnailUrl: "https://cdn.example.com/legacy-thumb.jpg",
      videoWidth: 1920,
      videoHeight: 1080,
      videoFraming: { fit: "contain", positionX: 40, positionY: 60, zoom: 120 },
      videoTrim: { start: 2, end: 8 },
    };

    it("prefers own videoUrl over legacy row", () => {
      const own = {
        videoUrl: "https://cdn.example.com/own-squat.mp4",
        thumbnailUrl: "https://cdn.example.com/own-thumb.jpg",
        videoWidth: 1080,
        videoHeight: 1920,
        videoFraming: { fit: "cover" as const, positionX: 50, positionY: 40, zoom: 100 },
        videoTrim: { start: 1, end: 5 },
      };

      const resolved = resolveExerciseVideo(own, legacyRow);
      expect(resolved.videoUrl).toBe("https://cdn.example.com/own-squat.mp4");
      expect(resolved.thumbnailUrl).toBe("https://cdn.example.com/own-thumb.jpg");
      expect(resolved.videoWidth).toBe(1080);
      expect(resolved.videoHeight).toBe(1920);
      expect(resolved.videoFraming).toEqual(own.videoFraming);
      expect(resolved.videoTrim).toEqual(own.videoTrim);
    });

    it("rule 2: does NOT apply legacy trim or framing when own videoUrl is present but has no trim/framing", () => {
      const own = {
        videoUrl: "https://cdn.example.com/own-squat.mp4",
      };

      const resolved = resolveExerciseVideo(own, legacyRow);
      expect(resolved.videoUrl).toBe("https://cdn.example.com/own-squat.mp4");
      // Trimming and framing belong to the file that supplied the URL
      expect(resolved.videoTrim).toBeNull();
      expect(resolved.videoFraming).toBeNull();
      expect(resolved.videoWidth).toBeNull();
      expect(resolved.videoHeight).toBeNull();
    });

    it("falls through to legacy row when own videoUrl is absent or blank", () => {
      const own = {
        videoUrl: "",
      };

      const resolved = resolveExerciseVideo(own, legacyRow);
      expect(resolved.videoUrl).toBe("https://cdn.example.com/legacy-squat.mp4");
      expect(resolved.thumbnailUrl).toBe("https://cdn.example.com/legacy-thumb.jpg");
      expect(resolved.videoWidth).toBe(1920);
      expect(resolved.videoHeight).toBe(1080);
      expect(resolved.videoFraming).toEqual(legacyRow.videoFraming);
      expect(resolved.videoTrim).toEqual(legacyRow.videoTrim);
    });

    it("returns null when neither has a video", () => {
      const resolved = resolveExerciseVideo({}, null);
      expect(resolved.videoUrl).toBeNull();
      expect(resolved.thumbnailUrl).toBeNull();
      expect(resolved.videoWidth).toBeNull();
      expect(resolved.videoHeight).toBeNull();
      expect(resolved.videoFraming).toBeNull();
      expect(resolved.videoTrim).toBeNull();
    });
  });

  describe("cache lookups", () => {
    it("returns video display, url and thumbnail from cache", () => {
      const testCache = new Map<string, ExerciseVideoDisplay>([
        [
          "bench press",
          {
            videoUrl: "https://cdn.example.com/bench.mp4",
            thumbnailUrl: "https://cdn.example.com/bench.jpg",
            videoWidth: 1920,
            videoHeight: 1080,
            videoFraming: null,
            videoTrim: null,
          },
        ],
      ]);
      setExerciseVideoCacheForTesting(testCache);

      expect(getExerciseVideoUrl("Bench Press")).toBe(
        "https://cdn.example.com/bench.mp4",
      );
      expect(getExerciseThumbnail("bench press")).toBe(
        "https://cdn.example.com/bench.jpg",
      );
      expect(getExerciseVideoDisplay("Bench Press")).toEqual(
        testCache.get("bench press"),
      );
      expect(getExerciseVideoUrl("Deadlift")).toBeNull();
    });
  });
});
