/**
 * Smart video framing helper.
 *
 * Resolves the right `object-fit`, `object-position`, and `transform: scale()`
 * for a given video (its intrinsic dimensions + optional admin overrides) on a
 * given surface (workout form / live workout / admin preview).
 *
 * The point: a portrait phone video and a wide landscape demo should both
 * "just work" everywhere without admins touching anything. Manual overrides
 * exist for the cases where auto isn't quite right.
 *
 * No DOM access — pure inputs → resolved values. Safe in both server and
 * client code (the API route uses it for validation defaults, components use
 * it at render time).
 */

export type VideoFit = 'contain' | 'cover';
export type VideoSurface = 'form' | 'live' | 'preview';
export type VideoOrientation = 'landscape' | 'portrait' | 'square' | 'unknown';

export interface VideoFramingOverride {
  fit?: VideoFit | null;
  positionX?: number | null;
  positionY?: number | null;
  zoom?: number | null;
}

export interface VideoFramingInput {
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
}

export interface ResolvedFraming {
  fit: VideoFit;
  positionX: number;
  positionY: number;
  zoom: number;
  /** True if NONE of the four framing fields were manually overridden. */
  isAuto: boolean;
  detectedOrientation: VideoOrientation;
}

// ─── Tunable thresholds ──────────────────────────────────────────────────────

/**
 * w/h above this → landscape. Tweaked to be permissive: 16:9 ≈ 1.78, 4:3 ≈ 1.33,
 * iPhone-shot-landscape from a 3:4 sensor can land at ~1.18 — still landscape.
 */
const LANDSCAPE_RATIO = 1.1;
/** w/h below this → portrait. 9:16 ≈ 0.56, 3:4 ≈ 0.75. */
const PORTRAIT_RATIO = 0.9;

// ─── Orientation ─────────────────────────────────────────────────────────────

export function detectOrientation(
  videoWidth?: number | null,
  videoHeight?: number | null
): VideoOrientation {
  if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
    return 'unknown';
  }
  const ratio = videoWidth / videoHeight;
  if (ratio >= LANDSCAPE_RATIO) return 'landscape';
  if (ratio <= PORTRAIT_RATIO) return 'portrait';
  return 'square';
}

// ─── Auto rules ──────────────────────────────────────────────────────────────

/**
 * What each surface looks like:
 *
 *   form    — 16:9 card on a form page. Landscape source fits naturally; for
 *             portrait we letterbox (contain) so the user sees the whole frame
 *             with vertical black bars rather than aggressively cropping legs.
 *   live    — full-screen background, typically portrait on a phone. Cover is
 *             the right default for portrait sources (they match the device
 *             aspect). For landscape sources in a portrait surface, cover crops
 *             the sides — usually fine, but we keep contain when ambiguous.
 *   preview — same as form, just smaller.
 *
 * positionY tilt for portrait/live: the action in a typical phone demo sits
 * slightly above the vertical center (head/torso framing). Auto-positioning
 * to 40 (a smidge above center) gives a better default than dead-center.
 */
interface AutoFraming {
  fit: VideoFit;
  positionX: number;
  positionY: number;
  zoom: number;
}

function autoFraming(orientation: VideoOrientation, surface: VideoSurface): AutoFraming {
  switch (orientation) {
    case 'landscape':
      // Landscape source. ALL surfaces use `cover` — widescreen videos should
      // fill the box without side black bars. The form / preview containers
      // are 16:9 and most landscape demos are 16:9 or close, so cover ≈ no
      // visible crop. For non-16:9 landscape sources (4:3, 21:9) cover will
      // crop a bit — admins can manually override with the framing editor.
      return {
        fit: 'cover',
        positionX: 50,
        positionY: 50,
        zoom: 100,
      };

    case 'portrait':
      // Portrait source. In a portrait `live` container both axes match → cover
      // = no crop. In a 16:9 `form`/`preview` container, contain shows the
      // entire portrait frame letterboxed; cover would crop top/bottom of a
      // standing person. We bias positionY to 40 in `live` only because
      // portrait sources tend to put the subject's torso slightly above center.
      return {
        fit: surface === 'live' ? 'cover' : 'contain',
        positionX: 50,
        positionY: surface === 'live' ? 40 : 50,
        zoom: 100,
      };

    case 'square':
      // Square source. Cover everywhere fills the container with minimal crop
      // bias, and the symmetry means 50/50 lands well.
      return {
        fit: 'cover',
        positionX: 50,
        positionY: 50,
        zoom: 100,
      };

    case 'unknown':
    default:
      // No dimensions yet (first render before metadata loads, or older rows
      // without dims). Contain is safe — it never crops content the admin
      // couldn't recover.
      return {
        fit: 'contain',
        positionX: 50,
        positionY: 50,
        zoom: 100,
      };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve framing for a video on a surface.
 *
 * Manual overrides (`input.videoFraming.*`) win per-field over the auto rules.
 * That means an admin can override JUST positionY for a particular video and
 * leave the rest on auto — useful when the only problem is a slightly off
 * vertical crop.
 */
export function resolveFraming(
  input: VideoFramingInput,
  surface: VideoSurface
): ResolvedFraming {
  const orientation = detectOrientation(input.videoWidth, input.videoHeight);
  const auto = autoFraming(orientation, surface);

  const override = input.videoFraming ?? null;
  const hasOverride = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v);
  const hasFitOverride = override?.fit === 'contain' || override?.fit === 'cover';
  const hasPosX = hasOverride(override?.positionX);
  const hasPosY = hasOverride(override?.positionY);
  const hasZoom = hasOverride(override?.zoom);

  const fit: VideoFit = hasFitOverride ? (override!.fit as VideoFit) : auto.fit;
  const positionX = hasPosX
    ? clamp(override!.positionX as number, 0, 100)
    : auto.positionX;
  const positionY = hasPosY
    ? clamp(override!.positionY as number, 0, 100)
    : auto.positionY;
  const zoom = hasZoom
    ? clamp(override!.zoom as number, 50, 400)
    : auto.zoom;

  const isAuto = !hasFitOverride && !hasPosX && !hasPosY && !hasZoom;

  return {
    fit,
    positionX,
    positionY,
    zoom,
    isAuto,
    detectedOrientation: orientation,
  };
}

function clamp(n: number, lo: number, hi: number) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

// NOTE: a previous version of this file shipped an inline `require.main ===
// module` sanity-test block here. Turbopack's client runtime polyfills
// `require` (so the `typeof require !== 'undefined'` guard didn't keep the
// block out of the browser bundle), then `module` is undefined in the
// browser and the chunk throws on module evaluation — blanking every page
// that imports `resolveFraming` (workout form + live workout + admin
// preview). Block removed. If we want unit tests later, put them in
// `videoFraming.test.ts` (Vitest excludes test files from the client graph).
