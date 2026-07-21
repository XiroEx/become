export type WeightInputMode = "required" | "optional" | "hidden";

export interface TrackingInputPlan {
  weight: WeightInputMode;
  reps: boolean;
  duration: boolean;
  distance: boolean;
  speed: boolean;
}

const REPS_WEIGHT: TrackingInputPlan = {
  weight: "required",
  reps: true,
  duration: false,
  distance: false,
  speed: false,
};

/**
 * Resolve the controls a workout surface should offer for a catalog tracking
 * type. Unknown values intentionally use the safest default: a reps + weight
 * set, so catalog drift cannot silently remove a useful input.
 */
export function resolveTrackingInputs(trackingType?: string): TrackingInputPlan {
  switch (trackingType) {
    case "reps_bodyweight":
    case "reps_only":
      return { ...REPS_WEIGHT, weight: "optional" };
    case "time":
    case "intervals":
      return {
        weight: "hidden",
        reps: false,
        duration: true,
        distance: false,
        speed: false,
      };
    case "time_distance":
      return {
        weight: "hidden",
        reps: false,
        duration: true,
        distance: true,
        speed: true,
      };
    case "none":
      return {
        weight: "hidden",
        reps: false,
        duration: false,
        distance: false,
        speed: false,
      };
    case "reps_weight":
    default:
      return { ...REPS_WEIGHT };
  }
}

/** Whether a set has the required value for its tracking plan. */
export function isSetFilled(
  trackingType: string | undefined,
  set: {
    reps?: string;
    weight?: string;
    duration?: string;
    distance?: string;
  },
): boolean {
  const num = (value: string) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const plan = resolveTrackingInputs(trackingType);
  const reps = (set.reps ?? "").trim();
  const weight = (set.weight ?? "").trim();
  const duration = (set.duration ?? "").trim();
  const distance = (set.distance ?? "").trim();

  if (plan.reps) {
    return reps !== "" && num(reps) > 0 && (plan.weight !== "required" || weight !== "");
  }
  if (plan.duration && plan.distance) {
    return (duration !== "" && num(duration) > 0) || (distance !== "" && num(distance) > 0);
  }
  if (plan.duration) {
    return duration !== "" && num(duration) > 0;
  }
  return false;
}
