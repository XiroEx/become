// The native half of webapp/lib/exerciseDemoVideo.ts. Keep the two lists
// identical — webapp/tests/unit/exerciseDemoVideo.test.ts asserts they are.
//
// Card: "Bug: Jumping Jacks shows a barbell bench-press image (Upper Body
// Supersets + Core Circuit)". The two clips below are named like placeholders
// and are not: their container metadata reads "The Bench Press" (CrossFit) and
// "HOW TO DO A GOBLET SQUAT". Old seed scripts handed them out by index parity
// to every exercise that had no video of its own, so 21 catalog rows prescribe
// a bench press or a goblet squat as their demo.
//
// The server drops them during hydration, so the native app receives no
// `videoUrl` for those exercises. This module is the second line: a stock clip
// that reaches the app by any other route (the legacy name-keyed
// `/api/exercise-videos` rows, a cached response, a program entry written
// before the fix) still reads as NO VIDEO, and `FramedVideo` shows the
// exercise's own "<name> demo is coming" placeholder instead of someone
// else's lift.

/** Every shared stock clip, and what it actually shows. */
export const STOCK_DEMO_CLIPS: Readonly<Record<string, string>> = {
  "/placeholder.mp4": 'a barbell bench press (CrossFit, "The Bench Press")',
  "/placeholder2.mp4": 'a dumbbell goblet squat ("HOW TO DO A GOBLET SQUAT")',
};

export const STOCK_DEMO_CLIP_URLS: readonly string[] = Object.keys(STOCK_DEMO_CLIPS);

/** `/dir/name.mp4?v=2` → `/name.mp4`, lowercased: what the lookups compare. */
function clipKey(url: string): string {
  const withoutQuery = (url.split(/[?#]/)[0] ?? "").trim().toLowerCase();
  const file = withoutQuery.split("/").pop() ?? "";
  return file ? `/${file}` : "";
}

/**
 * True when `url` is one of the shared stock clips — footage of one specific
 * lift that was handed out as generic filler. Matched on the file name so a
 * bucket prefix (`WEBAPP_BASE_URL` is prepended for playback) or a
 * cache-busting query cannot smuggle the same file past the check.
 */
export function isStockDemoClip(url: string | null | undefined): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  return clipKey(url) in STOCK_DEMO_CLIPS;
}

/**
 * The demo URL a player may use: the given one, or `null` when there is no
 * honest demo — blank, or a stock clip of a different exercise.
 */
export function demoVideoUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return isStockDemoClip(trimmed) ? null : trimmed;
}
