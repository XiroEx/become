/**
 * Which per-set inputs a live exercise shows, derived from the canonical
 * Exercise `trackingType` (hydrated onto each program exercise by the webapp's
 * hydrateExercises). The webapp logs reps/weight/duration/distance per set
 * depending on this; the native live screen mirrors that so a time- or
 * distance-tracked exercise logs the right dimension instead of forcing
 * reps/weight.
 *
 * Known trackingType values include: weight_reps, reps (bodyweight), time
 * (holds/planks), time_distance (cardio), weight_time, intervals. We match by
 * substring so minor variants ("duration", "reps_only") resolve sensibly, and
 * fall back to weight+reps when a type is unknown or yields no dimension.
 */
export interface SetInputs {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
}

export function setInputsForTrackingType(trackingType?: string | null): SetInputs {
  const t = (trackingType ?? "").toLowerCase().trim();
  // Default / classic strength logging.
  if (!t || t === "weight_reps" || t === "reps_weight") {
    return { weight: true, reps: true, duration: false, distance: false };
  }
  const inputs: SetInputs = {
    weight: t.includes("weight"),
    reps: t.includes("rep"),
    duration: t.includes("time") || t.includes("duration") || t.includes("interval"),
    distance: t.includes("distance"),
  };
  // A type we couldn't map to any dimension still needs *something* loggable.
  if (!inputs.weight && !inputs.reps && !inputs.duration && !inputs.distance) {
    return { weight: true, reps: true, duration: false, distance: false };
  }
  return inputs;
}
