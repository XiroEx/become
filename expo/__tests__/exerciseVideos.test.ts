import {
  getExerciseVideoDisplay,
  getExerciseVideoUrl,
  getExerciseThumbnail,
  resolveExerciseVideo,
  invalidateExerciseVideoCache,
  initializeCache,
} from "@/lib/data/exerciseVideos";
import { WEBAPP_BASE_URL } from "@/lib/config";

describe("exerciseVideos", () => {
  beforeEach(() => {
    invalidateExerciseVideoCache();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("resolveExerciseVideo", () => {
    it("prefers own videoUrl over legacy row", () => {
      const own = {
        videoUrl: "https://example.com/own.mp4",
        videoTrim: { start: 1, end: 5 },
      };
      const legacy = {
        videoUrl: "https://example.com/legacy.mp4",
        thumbnailUrl: "https://example.com/legacy.jpg",
        videoWidth: 1920,
        videoHeight: 1080,
        videoFraming: null,
        videoTrim: { start: 2, end: 8 },
      };

      const res = resolveExerciseVideo(own, legacy);
      expect(res.videoUrl).toBe("https://example.com/own.mp4");
      expect(res.videoTrim).toEqual({ start: 1, end: 5 });
      // Crucial: own file is played, so legacy dimensions/trim are NOT copied
      expect(res.videoWidth).toBeNull();
      expect(res.videoHeight).toBeNull();
      expect(res.thumbnailUrl).toBe("https://example.com/legacy.jpg");
    });

    it("falls through to legacy when own videoUrl is missing (e.g. after exercise swap)", () => {
      const own = {
        videoUrl: null,
        videoTrim: null,
      };
      const legacy = {
        videoUrl: "https://example.com/legacy.mp4",
        thumbnailUrl: "https://example.com/legacy.jpg",
        videoWidth: 1920,
        videoHeight: 1080,
        videoFraming: { fit: "cover" as const, positionX: 50, positionY: 40, zoom: 100 },
        videoTrim: { start: 2, end: 8 },
      };

      const res = resolveExerciseVideo(own, legacy);
      expect(res.videoUrl).toBe("https://example.com/legacy.mp4");
      expect(res.videoTrim).toEqual({ start: 2, end: 8 });
      expect(res.videoFraming).toEqual({
        fit: "cover",
        positionX: 50,
        positionY: 40,
        zoom: 100,
      });
      expect(res.videoWidth).toBe(1920);
      expect(res.videoHeight).toBe(1080);
    });

    it("returns nulls when neither own nor legacy has a video", () => {
      const res = resolveExerciseVideo({}, null);
      expect(res.videoUrl).toBeNull();
      expect(res.thumbnailUrl).toBeNull();
      expect(res.videoWidth).toBeNull();
      expect(res.videoHeight).toBeNull();
      expect(res.videoFraming).toBeNull();
      expect(res.videoTrim).toBeNull();
    });
  });

  describe("initializeCache and lookups", () => {
    it("fetches /api/exercise-videos and skips retired videos", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          videos: [
            {
              exerciseName: "Bench Press",
              videoUrl: "https://example.com/bench.mp4",
              thumbnailUrl: "https://example.com/bench.jpg",
              videoWidth: 1920,
              videoHeight: 1080,
              trim: { start: 1, end: 4 },
              framing: { fit: "cover" },
            },
            {
              exerciseName: "Squat",
              videoUrl: "https://example.com/squat.mp4",
              status: "retired",
            },
          ],
        }),
      });

      await initializeCache();

      expect(global.fetch).toHaveBeenCalledWith(`${WEBAPP_BASE_URL}/api/exercise-videos`);
      expect(getExerciseVideoUrl("bench press")).toBe("https://example.com/bench.mp4");
      expect(getExerciseThumbnail("Bench Press")).toBe("https://example.com/bench.jpg");

      const display = getExerciseVideoDisplay("BENCH PRESS");
      expect(display).toEqual({
        videoUrl: "https://example.com/bench.mp4",
        thumbnailUrl: "https://example.com/bench.jpg",
        videoWidth: 1920,
        videoHeight: 1080,
        videoTrim: { start: 1, end: 4 },
        videoFraming: { fit: "cover" },
      });

      // Retired video is excluded
      expect(getExerciseVideoUrl("Squat")).toBeNull();
    });
  });
});
