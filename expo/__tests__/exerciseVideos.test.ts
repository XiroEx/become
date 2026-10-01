import {
  resolveExerciseVideo,
  initializeCache,
  getExerciseVideoDisplay,
  resetVideoCacheForTests,
} from "@/lib/data/exerciseVideos";

describe("exerciseVideos", () => {
  beforeEach(() => {
    resetVideoCacheForTests();
  });

  it("own videoUrl wins over legacy cache", () => {
    const res = resolveExerciseVideo(
      {
        videoUrl: "https://cdn.example.test/own.mp4",
        videoTrim: { start: 2, end: 5 },
      },
      {
        videoUrl: "https://cdn.example.test/legacy.mp4",
        thumbnailUrl: null,
        videoWidth: 1920,
        videoHeight: 1080,
        videoFraming: { fit: "contain" },
        videoTrim: { start: 1, end: 9 },
      },
    );

    expect(res.videoUrl).toBe("https://cdn.example.test/own.mp4");
    expect(res.videoTrim).toEqual({ start: 2, end: 5 });
    // Legacy framing/trim is not used when own videoUrl is played
    expect(res.videoFraming).toBeNull();
    expect(res.videoWidth).toBeNull();
  });

  it("an exercise swap clears own video fields and falls through to legacy row", () => {
    // When an exercise is swapped, own video fields are cleared to null/undefined
    const swappedOwn = {
      videoUrl: null,
      thumbnailUrl: null,
      videoWidth: null,
      videoHeight: null,
      videoFraming: null,
      videoTrim: null,
    };
    const legacy = {
      videoUrl: "https://cdn.example.test/swapped-replacement.mp4",
      thumbnailUrl: "https://cdn.example.test/swapped.jpg",
      videoWidth: 1080,
      videoHeight: 1920,
      videoFraming: { fit: "cover" as const },
      videoTrim: { start: 0.5, end: 4.5 },
    };

    const res = resolveExerciseVideo(swappedOwn, legacy);
    expect(res.videoUrl).toBe("https://cdn.example.test/swapped-replacement.mp4");
    expect(res.thumbnailUrl).toBe("https://cdn.example.test/swapped.jpg");
    expect(res.videoWidth).toBe(1080);
    expect(res.videoHeight).toBe(1920);
    expect(res.videoFraming).toEqual({ fit: "cover" });
    expect(res.videoTrim).toEqual({ start: 0.5, end: 4.5 });
  });

  it("an exercise without video in own or legacy resolves to null", () => {
    const res = resolveExerciseVideo({}, null);
    expect(res.videoUrl).toBeNull();
    expect(res.thumbnailUrl).toBeNull();
    expect(res.videoTrim).toBeNull();
    expect(res.videoFraming).toBeNull();
  });

  it("initializes cache from GET /api/exercise-videos", async () => {
    const fakeFetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        videos: [
          {
            exerciseName: "Bench Press",
            videoUrl: "https://cdn.example.test/bench.mp4",
            framing: { fit: "cover" },
            trim: { start: 1, end: 4 },
          },
          {
            exerciseName: "Deadlift",
            videoUrl: "https://cdn.example.test/deadlift.mp4",
            status: "retired", // should be skipped
          },
        ],
      }),
    })) as unknown as typeof fetch;

    await initializeCache("https://become.redbtn.io", fakeFetch);

    const bench = getExerciseVideoDisplay("bench press");
    expect(bench).toEqual({
      videoUrl: "https://cdn.example.test/bench.mp4",
      thumbnailUrl: null,
      videoWidth: null,
      videoHeight: null,
      videoFraming: { fit: "cover" },
      videoTrim: { start: 1, end: 4 },
    });

    const deadlift = getExerciseVideoDisplay("deadlift");
    expect(deadlift).toBeNull();
  });
});
