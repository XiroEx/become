import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── Classification Enums ────────────────────────────────────────────────────

/**
 * What kind of activity is this?
 * Strength covers most iron work. Power is explosive/athletic.
 * Protocol = structured formats (AMRAP, EMOM, Tabata).
 */
export type ExerciseCategory =
  | 'strength'
  | 'power'          // cleans, snatches, box jumps, explosive KB swings
  | 'cardio'
  | 'plyometric'
  | 'calisthenics'
  | 'olympic'        // clean & jerk, snatch variations
  | 'strongman'      // sled, yoke, atlas stones
  | 'flexibility'
  | 'mobility'
  | 'warmup'
  | 'cooldown'
  | 'conditioning'
  | 'protocol';      // e.g. AMRAP, EMOM, Tabata - structured activity formats

/**
 * Joint mechanics — anatomical fact.
 * Compound = multi-joint (bench, squat).
 * Isolation = single-joint (curl, lateral raise).
 */
export type MechanicsType = 'compound' | 'isolation' | 'n/a';

/**
 * Programming role — coaching context.
 * Compound: main lift, drives the session (back squat, bench, deadlift).
 * Secondary: supporting compound that reinforces the pattern (goblet squat, incline press, hip thrust).
 * Accessory: isolation / detail work (curls, lateral raises, leg extension).
 *
 * This is structural, not ego-based. An RDL can be a main lift in a
 * hamstring program or an accessory in a squat day. The default role
 * reflects the most common usage.
 */
export type ExerciseRole = 'compound' | 'secondary' | 'accessory';

// ─── The 10 Fundamental Movement Patterns ────────────────────────────────────
//
//  1. Squat
//  2. Hinge
//  3. Lunge / Split stance
//  4. Horizontal Push
//  5. Horizontal Pull
//  6. Vertical Push
//  7. Vertical Pull
//  8. Carry (loaded locomotion)
//  9. Rotation
// 10. Core Stability (anti-rotation / anti-extension / anti-lateral flexion)
//
// Accessory-specific patterns describe single-joint or single-plane work
// that supports a fundamental pattern without being one itself.
//
// An exercise can have MULTIPLE patterns (e.g. trap bar deadlift = hinge + squat,
// thruster = squat + vertical push, Pallof press = anti-rotation).
// ──────────────────────────────────────────────────────────────────────────────

export type MovementPattern =
  // ── 10 Fundamental Patterns ──
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'carry'
  | 'rotation'
  // Core stability sub-patterns (pattern #10)
  | 'anti_rotation'
  | 'anti_extension'
  | 'anti_lateral_flexion'
  // ── Accessory-Specific Patterns ──
  | 'knee_extension'         // leg extension
  | 'knee_flexion'           // hamstring curl
  | 'hip_extension'          // glute kickback, back extension
  | 'horizontal_adduction'   // chest fly, pec deck
  | 'shoulder_abduction'     // lateral raise
  | 'shoulder_flexion'       // front raise
  | 'elbow_flexion'          // bicep curls
  | 'elbow_extension'        // tricep pushdown, skull crushers
  | 'ankle_flexion'          // calf raise
  | 'scapular_retraction'    // face pulls, band pull-aparts
  // ── Explosive / Athletic ──
  | 'triple_extension'       // clean, snatch, box jump (ankle + knee + hip)
  // ── Locomotion ──
  | 'gait'                   // walking, running, cycling
  // ── Catch-all ──
  | 'n/a';

export type Laterality = 'bilateral' | 'unilateral' | 'alternating' | 'n/a';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type TrackingType =
  | 'reps_weight'     // standard strength: sets × reps @ weight
  | 'reps_bodyweight' // bodyweight: sets × reps (no weight tracked)
  | 'time'            // hold/duration: planks, wall sits, stretches
  | 'time_distance'   // cardio: time + distance (running, rowing)
  | 'intervals'       // structured intervals (HIIT, EMOM, Tabata)
  | 'reps_only'       // just count reps, no external weight
  | 'none';           // passive activities (rest, cool down)

// ─── Muscle & Equipment Constants ────────────────────────────────────────────

export type MuscleGroup =
  // Chest
  | 'chest'
  | 'upper_chest'
  | 'lower_chest'
  // Back
  | 'lats'
  | 'upper_back'
  | 'mid_back'        // rhomboids + mid-traps as functional unit
  | 'lower_back'
  | 'rhomboids'
  | 'traps'
  | 'teres_major'
  // Shoulders
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'rotator_cuff'
  // Arms
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'brachialis'
  | 'grip'             // loaded carries, deadlifts, farmer's walks
  // Core
  | 'abs'
  | 'obliques'
  | 'transverse_abdominis'
  | 'hip_flexors'
  | 'erector_spinae'
  // Legs
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors'
  | 'abductors'
  // Combo
  | 'full_body';

export type Equipment =
  // Free weights
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'ez_bar'
  | 'trap_bar'
  | 'safety_squat_bar'
  // Machines - cable
  | 'cable'
  // Machines - plate-loaded / selectorized
  | 'leg_press'
  | 'leg_extension'
  | 'leg_curl'
  | 'hack_squat'
  | 'chest_press_machine'
  | 'shoulder_press_machine'
  | 'lat_pulldown'
  | 'seated_row_machine'
  | 'low_row_machine'
  | 'pec_deck'
  | 'hip_abduction_machine'
  | 'hip_adduction_machine'
  | 'calf_raise_machine'
  | 'preacher_curl_machine'
  | 'belt_squat_machine'
  | 'lateral_raise_machine'
  | 'rear_delt_machine'
  | 'smith_machine'
  | 'glute_ham_raise'
  | 'back_extension'
  | 'sled'              // sled push / pull
  // Benches & racks
  | 'flat_bench'
  | 'incline_bench'
  | 'decline_bench'
  | 'squat_rack'
  // Bodyweight / accessories
  | 'pull_up_bar'
  | 'dip_station'
  | 'resistance_band'
  | 'foam_roller'
  | 'exercise_mat'
  | 'box'
  | 'chair'
  | 'ab_wheel'
  | 'medicine_ball'
  // Cardio machines
  | 'treadmill'
  | 'stationary_bike'
  | 'rowing_machine'
  | 'assault_bike'
  | 'elliptical'
  // Misc
  | 'jump_rope'
  | 'backpack'
  | 'towel'
  | 'bodyweight'
  | 'none';

export type BodyRegion = 'upper_body' | 'lower_body' | 'core' | 'full_body';

// ─── Cardio Metrics Sub-document ─────────────────────────────────────────────

export interface ICardioMetrics {
  trackDistance: boolean;
  trackPace: boolean;
  trackCalories: boolean;
  trackHeartRate: boolean;
  trackIncline: boolean;
  trackResistance: boolean;
  trackCadence: boolean;
}

// ─── Main Exercise Interface ─────────────────────────────────────────────────

export interface IExerciseDefinition extends Document {
  // Identity
  slug: string;
  name: string;
  aliases: string[];
  description: string;

  // Classification
  category: ExerciseCategory;
  mechanics: MechanicsType;
  role: ExerciseRole;
  movementPatterns: MovementPattern[];   // array — most exercises have 1, hybrids have 2+
  laterality: Laterality;
  difficulty: Difficulty;

  // Muscles (what contributes, not what you're "targeting")
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  stabilizers: MuscleGroup[];

  // Equipment
  equipment: Equipment[];
  optionalEquipment: Equipment[];

  // Tracking
  trackingType: TrackingType;
  cardioMetrics?: ICardioMetrics;

  // Defaults (for program generation)
  defaultSets?: number;
  defaultReps?: string;
  defaultRest?: string;
  defaultDuration?: string;
  defaultTempo?: string;  // e.g. "3-1-1-0"

  // Instructions
  instructions: string[];
  cues: string[];
  commonMistakes: string[];

  // Relationships
  prerequisites: string[];  // exercise slugs
  variations: string[];     // exercise slugs (e.g. incline bench → flat bench)
  alternatives: string[];   // exercise slugs (swap-friendly exercises)

  // Media (merged from ExerciseVideo collection)
  videoUrl?: string;
  thumbnailUrl?: string;

  // Tags & search
  tags: string[];
  bodyRegion: BodyRegion;

  // Status
  isActive: boolean;

  // Custom exercise (user-created)
  isCustom?: boolean;
  createdBy?: string; // userId

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema Definition ──────────────────────────────────────────────────────

const CardioMetricsSchema = new Schema<ICardioMetrics>({
  trackDistance:   { type: Boolean, default: false },
  trackPace:       { type: Boolean, default: false },
  trackCalories:   { type: Boolean, default: false },
  trackHeartRate:  { type: Boolean, default: false },
  trackIncline:    { type: Boolean, default: false },
  trackResistance: { type: Boolean, default: false },
  trackCadence:    { type: Boolean, default: false },
}, { _id: false });

const ExerciseDefinitionSchema = new Schema<IExerciseDefinition>(
  {
    // Identity
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    aliases: [{
      type: String,
      trim: true,
    }],
    description: {
      type: String,
      default: '',
    },

    // Classification
    category: {
      type: String,
      required: true,
      enum: [
        'strength', 'power', 'cardio', 'plyometric', 'calisthenics', 'olympic',
        'strongman', 'flexibility', 'mobility', 'warmup', 'cooldown',
        'conditioning', 'protocol',
      ],
      index: true,
    },
    mechanics: {
      type: String,
      enum: ['compound', 'isolation', 'n/a'],
      default: 'n/a',
    },
    role: {
      type: String,
      required: true,
      enum: ['compound', 'secondary', 'accessory'],
      default: 'compound',
      index: true,
    },
    movementPatterns: [{
      type: String,
      enum: [
        // 10 Fundamental Patterns
        'squat', 'hinge', 'lunge',
        'horizontal_push', 'horizontal_pull',
        'vertical_push', 'vertical_pull',
        'carry', 'rotation',
        // Core stability (pattern #10 sub-types)
        'anti_rotation', 'anti_extension', 'anti_lateral_flexion',
        // Accessory-specific patterns
        'knee_extension', 'knee_flexion', 'hip_extension',
        'horizontal_adduction', 'shoulder_abduction', 'shoulder_flexion',
        'elbow_flexion', 'elbow_extension', 'ankle_flexion',
        'scapular_retraction',
        // Explosive / Athletic
        'triple_extension',
        // Locomotion
        'gait',
        'n/a',
      ],
    }],
    laterality: {
      type: String,
      enum: ['bilateral', 'unilateral', 'alternating', 'n/a'],
      default: 'bilateral',
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'expert'],
      default: 'intermediate',
    },

    // Muscles
    primaryMuscles: [{
      type: String,
      enum: [
        'chest', 'upper_chest', 'lower_chest',
        'lats', 'upper_back', 'mid_back', 'lower_back', 'rhomboids', 'traps', 'teres_major',
        'front_delts', 'side_delts', 'rear_delts', 'rotator_cuff',
        'biceps', 'triceps', 'forearms', 'brachialis', 'grip',
        'abs', 'obliques', 'transverse_abdominis', 'hip_flexors', 'erector_spinae',
        'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
        'full_body',
      ],
    }],
    secondaryMuscles: [{
      type: String,
      enum: [
        'chest', 'upper_chest', 'lower_chest',
        'lats', 'upper_back', 'mid_back', 'lower_back', 'rhomboids', 'traps', 'teres_major',
        'front_delts', 'side_delts', 'rear_delts', 'rotator_cuff',
        'biceps', 'triceps', 'forearms', 'brachialis', 'grip',
        'abs', 'obliques', 'transverse_abdominis', 'hip_flexors', 'erector_spinae',
        'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
        'full_body',
      ],
    }],
    stabilizers: [{
      type: String,
      enum: [
        'chest', 'upper_chest', 'lower_chest',
        'lats', 'upper_back', 'mid_back', 'lower_back', 'rhomboids', 'traps', 'teres_major',
        'front_delts', 'side_delts', 'rear_delts', 'rotator_cuff',
        'biceps', 'triceps', 'forearms', 'brachialis', 'grip',
        'abs', 'obliques', 'transverse_abdominis', 'hip_flexors', 'erector_spinae',
        'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
        'full_body',
      ],
    }],

    // Equipment
    equipment: [{
      type: String,
      enum: [
        'barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'trap_bar', 'safety_squat_bar',
        'cable',
        'leg_press', 'leg_extension', 'leg_curl', 'hack_squat',
        'chest_press_machine', 'shoulder_press_machine', 'lat_pulldown',
        'seated_row_machine', 'low_row_machine', 'pec_deck',
        'hip_abduction_machine', 'hip_adduction_machine', 'calf_raise_machine',
        'preacher_curl_machine', 'belt_squat_machine', 'lateral_raise_machine',
        'rear_delt_machine', 'smith_machine', 'glute_ham_raise', 'back_extension', 'sled',
        'flat_bench', 'incline_bench', 'decline_bench', 'squat_rack',
        'pull_up_bar', 'dip_station', 'resistance_band', 'foam_roller',
        'exercise_mat', 'box', 'chair', 'ab_wheel', 'medicine_ball',
        'treadmill', 'stationary_bike', 'rowing_machine', 'assault_bike', 'elliptical',
        'jump_rope', 'backpack', 'towel', 'bodyweight', 'none',
      ],
    }],
    optionalEquipment: [{
      type: String,
      enum: [
        'barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'trap_bar', 'safety_squat_bar',
        'cable',
        'leg_press', 'leg_extension', 'leg_curl', 'hack_squat',
        'chest_press_machine', 'shoulder_press_machine', 'lat_pulldown',
        'seated_row_machine', 'low_row_machine', 'pec_deck',
        'hip_abduction_machine', 'hip_adduction_machine', 'calf_raise_machine',
        'preacher_curl_machine', 'belt_squat_machine', 'lateral_raise_machine',
        'rear_delt_machine', 'smith_machine', 'glute_ham_raise', 'back_extension', 'sled',
        'flat_bench', 'incline_bench', 'decline_bench', 'squat_rack',
        'pull_up_bar', 'dip_station', 'resistance_band', 'foam_roller',
        'exercise_mat', 'box', 'chair', 'ab_wheel', 'medicine_ball',
        'treadmill', 'stationary_bike', 'rowing_machine', 'assault_bike', 'elliptical',
        'jump_rope', 'backpack', 'towel', 'bodyweight', 'none',
      ],
    }],

    // Tracking
    trackingType: {
      type: String,
      required: true,
      enum: ['reps_weight', 'reps_bodyweight', 'time', 'time_distance', 'intervals', 'reps_only', 'none'],
      default: 'reps_weight',
    },
    cardioMetrics: {
      type: CardioMetricsSchema,
      default: undefined,
    },

    // Defaults
    defaultSets:     { type: Number },
    defaultReps:     { type: String },
    defaultRest:     { type: String },
    defaultDuration: { type: String },
    defaultTempo:    { type: String },

    // Instructions
    instructions:   [{ type: String }],
    cues:           [{ type: String }],
    commonMistakes: [{ type: String }],

    // Relationships
    prerequisites: [{ type: String }], // slugs
    variations:    [{ type: String }], // slugs
    alternatives:  [{ type: String }], // slugs

    // Media
    videoUrl:      { type: String, default: null },
    thumbnailUrl:  { type: String, default: null },

    // Tags & search
    tags: [{ type: String, index: true }],
    bodyRegion: {
      type: String,
      required: true,
      enum: ['upper_body', 'lower_body', 'core', 'full_body'],
      index: true,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Custom exercise (user-created)
    isCustom: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// Text search across name, aliases, description, tags
ExerciseDefinitionSchema.index(
  { name: 'text', description: 'text', tags: 'text', aliases: 'text' },
  { weights: { name: 10, aliases: 8, tags: 5, description: 1 } }
);

// Compound indexes for common queries
ExerciseDefinitionSchema.index({ category: 1, bodyRegion: 1 });
ExerciseDefinitionSchema.index({ category: 1, difficulty: 1 });
ExerciseDefinitionSchema.index({ movementPatterns: 1, role: 1 }); // "show me all compound squat-pattern exercises"
ExerciseDefinitionSchema.index({ primaryMuscles: 1 });
ExerciseDefinitionSchema.index({ equipment: 1 });

// Prevent model recompilation in development
const Exercise: Model<IExerciseDefinition> =
  mongoose.models.Exercise || mongoose.model<IExerciseDefinition>('Exercise', ExerciseDefinitionSchema);

export default Exercise;
