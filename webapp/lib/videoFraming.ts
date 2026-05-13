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
      // Landscape source. Form/preview = contain (no crop). Live = cover so
      // the wide source fills a portrait phone (sides crop, action centered).
      return {
        fit: surface === 'live' ? 'cover' : 'contain',
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

// ─── Inline sanity tests ─────────────────────────────────────────────────────
// Run with: `npx ts-node webapp/lib/videoFraming.ts` (or `tsx`). Not wired into
// a test framework — we don't have one — but keeps the auto rules honest.

if (typeof require !== 'undefined' && require.main === module) {
  const tests: Array<[VideoFramingInput, VideoSurface, Partial<ResolvedFraming>]> = [
    // Landscape 16:9 demo
    [{ videoWidth: 1920, videoHeight: 1080 }, 'form',    { fit: 'contain', detectedOrientation: 'landscape' }],
    [{ videoWidth: 1920, videoHeight: 1080 }, 'live',    { fit: 'cover',   detectedOrientation: 'landscape' }],
    [{ videoWidth: 1920, videoHeight: 1080 }, 'preview', { fit: 'contain', detectedOrientation: 'landscape' }],
    // Portrait phone demo
    [{ videoWidth: 1080, videoHeight: 1920 }, 'form',    { fit: 'contain', positionY: 50, detectedOrientation: 'portrait' }],
    [{ videoWidth: 1080, videoHeight: 1920 }, 'live',    { fit: 'cover',   positionY: 40, detectedOrientation: 'portrait' }],
    // Square
    [{ videoWidth: 720, videoHeight: 720 }, 'live', { fit: 'cover', detectedOrientation: 'square' }],
    // Unknown
    [{ }, 'live', { fit: 'contain', detectedOrientation: 'unknown', isAuto: true }],
    // Override wins per field
    [
      { videoWidth: 1080, videoHeight: 1920, videoFraming: { positionY: 70 } },
      'live',
      { fit: 'cover', positionY: 70, isAuto: false },
    ],
    // Override fit alone
    [
      { videoWidth: 1920, videoHeight: 1080, videoFraming: { fit: 'contain' } },
      'live',
      { fit: 'contain', isAuto: false },
    ],
    // Clamp out-of-range zoom
    [
      { videoWidth: 1920, videoHeight: 1080, videoFraming: { zoom: 9999 } },
      'form',
      { zoom: 400 },
    ],
  ];

  let pass = 0;
  let fail = 0;
  for (const [input, surface, expect] of tests) {
    const out = resolveFraming(input, surface);
    let ok = true;
    for (const [k, v] of Object.entries(expect)) {
      // @ts-expect-error indexing into ResolvedFraming dynamically
      if (out[k] !== v) {
        ok = false;
        console.error('FAIL', { input, surface, expect, got: out, key: k });
        break;
      }
    }
    if (ok) pass++; else fail++;
  }
  console.log(`videoFraming tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
