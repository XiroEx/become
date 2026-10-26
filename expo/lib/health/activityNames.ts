/**
 * What a tracked workout from Apple Health or Health Connect is CALLED, and
 * which app recorded it — in words the calendar can print (card 6adf69c7).
 *
 * The two platforms name activities differently: HealthKit hands
 * `react-native-health`'s CamelCase (`TraditionalStrengthTraining`), Health
 * Connect an integer `exerciseType` (79 is walking). Both come through
 * `activityName` here, so the server stores — and both calendars print — one
 * vocabulary. The server keeps the raw type too, normalised to kebab-case.
 */

/**
 * Health Connect `ExerciseType` → its constant name
 * (`react-native-health-connect/src/constants.ts`). Copied, not imported: the
 * module is loaded lazily on Android only (see `healthConnect.ts`), and a type
 * name is data, not behaviour.
 */
export const HEALTH_CONNECT_EXERCISE_TYPES: Readonly<Record<number, string>> = {
  0: "OTHER_WORKOUT", 1: "BACK_EXTENSION", 2: "BADMINTON", 3: "BARBELL_SHOULDER_PRESS",
  4: "BASEBALL", 5: "BASKETBALL", 6: "BENCH_PRESS", 7: "BENCH_SIT_UP", 8: "BIKING",
  9: "BIKING_STATIONARY", 10: "BOOT_CAMP", 11: "BOXING", 12: "BURPEE", 13: "CALISTHENICS",
  14: "CRICKET", 15: "CRUNCH", 16: "DANCING", 17: "DEADLIFT", 18: "DUMBBELL_CURL_LEFT_ARM",
  19: "DUMBBELL_CURL_RIGHT_ARM", 20: "DUMBBELL_FRONT_RAISE", 21: "DUMBBELL_LATERAL_RAISE",
  22: "DUMBBELL_TRICEPS_EXTENSION_LEFT_ARM", 23: "DUMBBELL_TRICEPS_EXTENSION_RIGHT_ARM",
  24: "DUMBBELL_TRICEPS_EXTENSION_TWO_ARM", 25: "ELLIPTICAL", 26: "EXERCISE_CLASS",
  27: "FENCING", 28: "FOOTBALL_AMERICAN", 29: "FOOTBALL_AUSTRALIAN", 30: "FORWARD_TWIST",
  31: "FRISBEE_DISC", 32: "GOLF", 33: "GUIDED_BREATHING", 34: "GYMNASTICS", 35: "HANDBALL",
  36: "HIGH_INTENSITY_INTERVAL_TRAINING", 37: "HIKING", 38: "ICE_HOCKEY", 39: "ICE_SKATING",
  40: "JUMPING_JACK", 41: "JUMP_ROPE", 42: "LAT_PULL_DOWN", 43: "LUNGE", 44: "MARTIAL_ARTS",
  46: "PADDLING", 47: "PARAGLIDING", 48: "PILATES", 49: "PLANK", 50: "RACQUETBALL",
  51: "ROCK_CLIMBING", 52: "ROLLER_HOCKEY", 53: "ROWING", 54: "ROWING_MACHINE", 55: "RUGBY",
  56: "RUNNING", 57: "RUNNING_TREADMILL", 58: "SAILING", 59: "SCUBA_DIVING", 60: "SKATING",
  61: "SKIING", 62: "SNOWBOARDING", 63: "SNOWSHOEING", 64: "SOCCER", 65: "SOFTBALL",
  66: "SQUASH", 67: "SQUAT", 68: "STAIR_CLIMBING", 69: "STAIR_CLIMBING_MACHINE",
  70: "STRENGTH_TRAINING", 71: "STRETCHING", 72: "SURFING", 73: "SWIMMING_OPEN_WATER",
  74: "SWIMMING_POOL", 75: "TABLE_TENNIS", 76: "TENNIS", 77: "UPPER_TWIST", 78: "VOLLEYBALL",
  79: "WALKING", 80: "WATER_POLO", 81: "WEIGHTLIFTING", 82: "WHEELCHAIR", 83: "YOGA",
};

/** Names the generic splitter would get wrong or make clumsy. Keyed by the raw name. */
const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  OTHER_WORKOUT: "Workout",
  Other: "Workout",
  BIKING: "Cycling",
  BIKING_STATIONARY: "Indoor cycling",
  RUNNING_TREADMILL: "Treadmill run",
  HIGH_INTENSITY_INTERVAL_TRAINING: "HIIT",
  HighIntensityIntervalTraining: "HIIT",
  TraditionalStrengthTraining: "Strength training",
  FunctionalStrengthTraining: "Functional strength",
  SWIMMING_OPEN_WATER: "Open water swim",
  SWIMMING_POOL: "Pool swim",
  STAIR_CLIMBING_MACHINE: "Stair machine",
  MixedCardio: "Mixed cardio",
  CardioDance: "Cardio dance",
};

/** `"TraditionalStrengthTraining"` / `"RUNNING_TREADMILL"` → `"Traditional strength training"`. */
export function activityDisplayName(raw: string | null | undefined): string {
  if (!raw) return "Workout";
  const override = NAME_OVERRIDES[raw];
  if (override) return override;
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\s]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "Workout";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Health Connect's `exerciseType` integer → its constant name, `OTHER_WORKOUT` when unknown. */
export function healthConnectExerciseTypeName(type: number | null | undefined): string {
  if (typeof type !== "number") return "OTHER_WORKOUT";
  return HEALTH_CONNECT_EXERCISE_TYPES[type] ?? "OTHER_WORKOUT";
}

/**
 * Health Connect reports the PACKAGE that wrote a record. The calendar says
 * "Tracked by Strava", never "Tracked by com.strava": a package we do not know
 * is reported as no app at all rather than as a string the member cannot read.
 */
const KNOWN_PACKAGES: Readonly<Record<string, string>> = {
  "com.strava": "Strava",
  "com.whoop.android": "WHOOP",
  "com.ouraring.oura": "Oura",
  "com.google.android.apps.fitness": "Google Fit",
  "com.google.android.apps.healthdata": "Health Connect",
  "com.fitbit.FitbitMobile": "Fitbit",
  "com.sec.android.app.shealth": "Samsung Health",
  "com.samsung.android.wear.shealth": "Samsung Health",
  "com.garmin.android.apps.connectmobile": "Garmin Connect",
  "com.nike.plusgps": "Nike Run Club",
  "com.runtastic.android": "adidas Running",
  "com.polar.polarflow": "Polar Flow",
  "com.suunto.connectivity": "Suunto",
  "com.peloton.callisto": "Peloton",
  "com.myfitnesspal.android": "MyFitnessPal",
  "com.xiaomi.wearable": "Mi Fitness",
  "com.huawei.health": "Huawei Health",
};

export function androidOriginAppLabel(pkg: string | null | undefined): string | undefined {
  if (!pkg) return undefined;
  return KNOWN_PACKAGES[pkg];
}
