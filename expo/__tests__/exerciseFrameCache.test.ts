/**
 * ─── The Live Activity exercise still-frame cache ────────────────────────────
 *
 * `exerciseFrameCache.ts` turns an exercise's `thumbnailUrl` into a `file://`
 * URI inside the shared App Group — or undefined when there is nothing worth
 * caching. `expo-file-system` is native code that does not run under Jest, so
 * the module boundary (`Directory` / `File` / `Paths`) is faked here with an
 * in-memory store, exactly like the program-import picker's
 * `File.pickFileAsync` fake: the download itself is injected per call and
 * counted, which is what proves the dedupe.
 */
import {
  clearExerciseFrameCache,
  EXERCISE_FRAME_PLACEHOLDER_PATH,
  exerciseFrameUri,
  prefetchExerciseFrame,
  resolveExerciseFrameSource,
  type ExerciseFrameDeps,
} from "@/lib/live/liveActivity/exerciseFrameCache";

const mockGroupId = "group.io.redbtn.become";

const mockStore = new Map<string, boolean>();
const mockDownloadFile = jest.fn(
  async (url: string, dest: { uri: string }) => {
    mockStore.set(dest.uri, true);
    return dest;
  },
);

jest.mock("expo-file-system", () => {
  class FakeDirectory {
    readonly uri: string;
    constructor(parent: string | { uri: string }, ...segments: string[]) {
      const base =
        typeof parent === "string" ? parent : parent.uri.replace(/\/+$/, "");
      this.uri = `${base}/${segments.join("/")}/`;
    }
    get exists(): boolean {
      return mockStore.get(this.uri) ?? false;
    }
    create(): void {
      mockStore.set(this.uri, true);
    }
  }
  class FakeFile {
    readonly uri: string;
    constructor(
      parent: string | { uri: string },
      ...segments: string[]
    ) {
      const base =
        typeof parent === "string" ? parent : parent.uri.replace(/\/+$/, "");
      this.uri = `${base}/${segments.join("/")}`;
    }
    get exists(): boolean {
      return mockStore.get(this.uri) ?? false;
    }
  }
  return {
    Directory: FakeDirectory,
    File: FakeFile,
    Paths: {
      appleSharedContainers: {
        [mockGroupId]: new FakeDirectory("file:///group"),
      },
    },
  };
});

const FRAME_URL = "https://cdn.example.com/frames/bench-press.jpg";

function dl(over: Partial<ExerciseFrameDeps> = {}): ExerciseFrameDeps {
  return {
    downloadFile:
      mockDownloadFile as unknown as ExerciseFrameDeps["downloadFile"],
    ...over,
  };
}

beforeEach(() => {
  mockStore.clear();
  clearExerciseFrameCache();
  mockDownloadFile.mockClear();
});

describe("resolveExerciseFrameSource", () => {
  it("ignores a missing or blank thumbnail", () => {
    expect(resolveExerciseFrameSource(undefined)).toBeUndefined();
    expect(resolveExerciseFrameSource(null)).toBeUndefined();
    expect(resolveExerciseFrameSource("")).toBeUndefined();
    expect(resolveExerciseFrameSource("   ")).toBeUndefined();
  });

  it("ignores the catalogue-wide icon placeholder, relative or absolute", () => {
    expect(
      resolveExerciseFrameSource(EXERCISE_FRAME_PLACEHOLDER_PATH),
    ).toBeUndefined();
    expect(
      resolveExerciseFrameSource(
        `https://become.redbtn.io${EXERCISE_FRAME_PLACEHOLDER_PATH}`,
      ),
    ).toBeUndefined();
    expect(
      resolveExerciseFrameSource(
        `https://become.redbtn.io${EXERCISE_FRAME_PLACEHOLDER_PATH}?v=3`,
      ),
    ).toBeUndefined();
  });

  it("resolves a relative thumbnail against the webapp base URL", () => {
    expect(resolveExerciseFrameSource("/media/frames/squat.jpg")).toBe(
      "https://become.redbtn.io/media/frames/squat.jpg",
    );
  });

  it("passes an absolute URL through unchanged", () => {
    expect(resolveExerciseFrameSource(FRAME_URL)).toBe(FRAME_URL);
  });

  it("ignores a URL that does not parse", () => {
    expect(resolveExerciseFrameSource("https://")).toBeUndefined();
  });
});

describe("exerciseFrameUri", () => {
  it("resolves a frame to a file:// URI and caches it by URL", async () => {
    const first = await exerciseFrameUri(FRAME_URL, dl());
    expect(first).toMatch(/^file:\/\//);
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    expect(mockDownloadFile.mock.calls[0]?.[0]).toBe(FRAME_URL);

    const second = await exerciseFrameUri(FRAME_URL, dl());
    expect(second).toBe(first);
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent loads of one URL into a single download", async () => {
    const [first, second] = await Promise.all([
      exerciseFrameUri(FRAME_URL, dl()),
      exerciseFrameUri(FRAME_URL, dl()),
    ]);
    expect(first).toMatch(/^file:\/\//);
    expect(second).toBe(first);
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
  });

  it("reuses an already-downloaded file without downloading again", async () => {
    const first = await exerciseFrameUri(FRAME_URL, dl());
    clearExerciseFrameCache();
    mockDownloadFile.mockClear();
    const second = await exerciseFrameUri(FRAME_URL, dl());
    expect(second).toBe(first);
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it("resolves undefined for the placeholder without touching the network", async () => {
    await expect(
      exerciseFrameUri(EXERCISE_FRAME_PLACEHOLDER_PATH, dl()),
    ).resolves.toBeUndefined();
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it("resolves undefined — never throws — when the download fails", async () => {
    const failing = jest.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      exerciseFrameUri(
        FRAME_URL,
        dl({
          downloadFile:
            failing as unknown as ExerciseFrameDeps["downloadFile"],
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves undefined when there is no shared container", async () => {
    await expect(
      exerciseFrameUri(FRAME_URL, dl({ sharedDir: null })),
    ).resolves.toBeUndefined();
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it("prefetch warms the cache without returning the URI", async () => {
    prefetchExerciseFrame(FRAME_URL, dl());
    const uri = await exerciseFrameUri(FRAME_URL, dl());
    expect(uri).toMatch(/^file:\/\//);
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached frame inside the App Group", async () => {
    const uri = await exerciseFrameUri(FRAME_URL, dl());
    expect(uri).toContain("file:///group/");
    expect(uri).toContain("exercise-frames/");
  });
});
