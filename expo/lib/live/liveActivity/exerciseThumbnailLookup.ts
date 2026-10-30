/**
 * THE LOCK SCREEN TILE'S PICTURE FOR AN EXERCISE THAT ARRIVED WITHOUT ONE.
 *
 * Programs denormalise `thumbnailUrl` onto each exercise and a quick session
 * hydrates its list at load, but an exercise ADDED mid-workout, or swapped in
 * from a row with no still, has none. Jon, 2026-10-29: "the picture on the
 * screen needs to reflect the actual exercise that you're doing ... any
 * workout". This resolves it by slug through the same
 * `POST /api/exercises/hydrate` the quick session uses, and caches a found
 * still for the life of the process.
 *
 * Best-effort by construction: any failure is `undefined`, and the tile falls
 * back to the Become arrow, never to another exercise's photo.
 */
import { ExerciseHydrateResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

export interface ThumbnailLookupDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const cache = new Map<string, Promise<string | undefined>>();

/** Test hook: forget every cached answer. */
export function clearExerciseThumbnailLookups(): void {
  cache.clear();
}

/**
 * A lookup bound to one session token, for `LiveWorkoutClient`'s
 * `lookupExerciseThumbnail` prop. Keyed by slug (else name).
 */
export function createExerciseThumbnailLookup(
  token: string | null | undefined,
  deps: ThumbnailLookupDeps = {},
): (exercise: { slug?: string; name: string }) => Promise<string | undefined> {
  return (exercise) => {
    const key = exercise.slug || `name:${exercise.name}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = (async (): Promise<string | undefined> => {
      try {
        const impl = deps.fetchImpl ?? fetch;
        const res = await impl(`${deps.baseUrl ?? WEBAPP_BASE_URL}/api/exercises/hydrate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            exercises: [
              {
                ...(exercise.slug ? { exerciseSlug: exercise.slug } : {}),
                name: exercise.name,
              },
            ],
          }),
        });
        if (!res.ok) return undefined;
        const parsed = ExerciseHydrateResponseSchema.safeParse(await res.json());
        if (!parsed.success) return undefined;
        const thumb = parsed.data.exercises[0]?.thumbnailUrl;
        return typeof thumb === "string" && thumb.trim() ? thumb : undefined;
      } catch {
        return undefined;
      }
    })();
    // Only a found still is kept: a failure or an exercise with no demo yet is
    // asked again on the next visit, so a clip uploaded mid-week shows up.
    cache.set(key, pending);
    void pending.then((v) => {
      if (v === undefined) cache.delete(key);
    });
    return pending;
  };
}
