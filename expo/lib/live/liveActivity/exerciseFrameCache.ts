/**
 * THE EXERCISE STILL FRAME FOR THE LIVE ACTIVITY.
 *
 * Live Activities cannot play video, so the Lock Screen / expanded island
 * draws a STILL image of the current exercise (`imageUri` on
 * `WorkoutLiveActivityProps`, drawn by `WorkoutLiveActivityLayout.tsx`).
 * Today NO exercise has a real image — every `thumbnailUrl` is the
 * `/icons/icon-192.png` placeholder — so this resolves to undefined and the
 * layout draws the Become arrow tile. A separate card generates real frames
 * later; when they land, this lights up with no layout change.
 *
 * THE SHARING RULE. The extension is a separate process: it can only read a
 * file inside the App Group both sides share (`group.io.redbtn.become`,
 * created by the `expo-widgets` plugin block in `app.json` — see
 * `IOS_WIDGET_GROUP_IDENTIFIER`). So the frame is downloaded ONCE into
 * `<group>/exercise-frames/` and the activity carries the resulting
 * `file://` URI, never the remote URL. A path outside the group (the app's
 * own cache/document directory) would be unreadable over the bridge and the
 * tile would stay a placeholder on a real phone while working nowhere
 * observable — hence this module rather than a plain download-to-cache.
 *
 * EVERYTHING HERE IS BEST-EFFORT (the rule that travels from
 * `workoutLiveActivity.ts`): a missing thumbnail, the icon placeholder, no
 * shared container (Android, Expo Go, Jest), or a failed download all resolve
 * to undefined — never a throw — and the tile falls back to the arrow.
 */
import { Directory, File, Paths } from "expo-file-system";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { IOS_WIDGET_GROUP_IDENTIFIER } from "@/lib/widgets/iosWidgets";

/** The App Group–relative folder holding cached exercise stills. */
const EXERCISE_FRAME_DIR_NAME = "exercise-frames";

/**
 * The catalogue-wide placeholder every `thumbnailUrl` carries until real
 * frames exist. Compared against the resolved URL's PATHNAME, so a relative
 * `/icons/icon-192.png`, an absolute `https://…/icons/icon-192.png` and one
 * with a query string are all recognised as "no real image".
 */
export const EXERCISE_FRAME_PLACEHOLDER_PATH = "/icons/icon-192.png";

export interface ExerciseFrameDeps {
  /** Override for `WEBAPP_BASE_URL` (tests). */
  baseUrl?: string;
  /**
   * Override for the App Group frames directory — explicit `null` means
   * "no shared container". Tests point this at a temp dir; production
   * leaves it unset and reads the real App Group.
   */
  sharedDir?: Directory | null;
  /** Override for the download (tests count calls to prove dedupe). */
  downloadFile?: (url: string, dest: File) => Promise<File>;
}

/**
 * The absolute https URL of a usable frame, or undefined when there is
 * nothing worth caching: a missing/blank thumbnail, the icon placeholder,
 * or a URL that does not parse. Relative thumbnails resolve against the
 * webapp base URL — the catalogue stores paths, not origins.
 */
export function resolveExerciseFrameSource(
  thumbnailUrl: string | null | undefined,
  baseUrl: string = WEBAPP_BASE_URL,
): string | undefined {
  if (typeof thumbnailUrl !== "string") return undefined;
  const trimmed = thumbnailUrl.trim();
  if (!trimmed) return undefined;
  try {
    const absolute = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : new URL(trimmed, baseUrl).toString();
    if (new URL(absolute).pathname === EXERCISE_FRAME_PLACEHOLDER_PATH) {
      return undefined;
    }
    return absolute;
  } catch {
    return undefined;
  }
}

/** A stable filename per source URL (FNV-1a), keeping an image extension. */
function frameFileName(source: string): string {
  let ext = ".jpg";
  try {
    const found = new URL(source).pathname.match(
      /\.(jpe?g|png|webp|heic|heif)$/i,
    )?.[0];
    if (found) {
      const lower = found.toLowerCase();
      ext = lower === ".jpeg" ? ".jpg" : lower;
    }
  } catch {
    /* keep the default */
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `frame-${(hash >>> 0).toString(16)}${ext}`;
}

/** The `<group>/exercise-frames/` dir, created on first use — null where
 * there is no shared container (Android, Expo Go, Jest without a mock). */
function sharedFramesDir(): Directory | null {
  try {
    const container =
      Paths.appleSharedContainers?.[IOS_WIDGET_GROUP_IDENTIFIER];
    if (!container) return null;
    const dir = new Directory(container, EXERCISE_FRAME_DIR_NAME);
    if (!dir.exists) dir.create();
    return dir;
  } catch {
    return null;
  }
}

/** URI cache (source URL → `file://` URI) plus in-flight dedupe, so one
 * source URL downloads once however many renders ask for it. */
const cachedUris = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string | undefined>>();

/** Test seam: forget every cached URI and in-flight load. */
export function clearExerciseFrameCache(): void {
  cachedUris.clear();
  pendingLoads.clear();
}

async function loadExerciseFrame(
  source: string,
  deps?: ExerciseFrameDeps,
): Promise<string | undefined> {
  try {
    const dir =
      deps?.sharedDir !== undefined ? deps.sharedDir : sharedFramesDir();
    if (!dir) return undefined;
    const dest = new File(dir, frameFileName(source));
    if (dest.exists) return dest.uri;
    const download = deps?.downloadFile ?? File.downloadFileAsync;
    await download(source, dest);
    return dest.exists ? dest.uri : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The cached `file://` URI of an exercise's still frame, downloading it into
 * the shared App Group on first use. Concurrent callers share one download;
 * a completed URI is remembered by source URL. Never throws — every failure
 * resolves to undefined and the tile falls back to the arrow.
 */
export function exerciseFrameUri(
  thumbnailUrl: string | null | undefined,
  deps?: ExerciseFrameDeps,
): Promise<string | undefined> {
  const source = resolveExerciseFrameSource(
    thumbnailUrl,
    deps?.baseUrl ?? WEBAPP_BASE_URL,
  );
  if (!source) return Promise.resolve(undefined);
  const cached = cachedUris.get(source);
  if (cached) return Promise.resolve(cached);
  const pending = pendingLoads.get(source);
  if (pending) return pending;
  const task = loadExerciseFrame(source, deps).then((uri) => {
    pendingLoads.delete(source);
    if (uri) cachedUris.set(source, uri);
    return uri;
  });
  pendingLoads.set(source, task);
  return task;
}

/**
 * Warm the tile for the exercise AFTER this one — same load, result
 * discarded — so the frame is usually cached by the time the member
 * advances. Fire-and-forget: `exerciseFrameUri` never rejects.
 */
export function prefetchExerciseFrame(
  thumbnailUrl: string | null | undefined,
  deps?: ExerciseFrameDeps,
): void {
  void exerciseFrameUri(thumbnailUrl, deps);
}
