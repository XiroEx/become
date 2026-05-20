// Exercise category (maps from Exercise model's `category`)
export type ExerciseType = 'strength' | 'conditioning' | 'warmup' | 'abs' | 'cooldown'
  | 'power' | 'cardio' | 'plyometric' | 'calisthenics' | 'olympic'
  | 'strongman' | 'flexibility' | 'mobility' | 'protocol';

// Exercise Grouping Types (supersets, circuits, etc.)
export type ExerciseGroupType = 'superset' | 'circuit' | 'triset' | 'giant_set' | 'emom' | 'amrap';

// Target User Levels
export type TargetUserLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Beginner to Intermediate' | 'Intermediate to Advanced';

export interface Exercise {
  exerciseSlug?: string;         // Canonical slug reference (DB storage key)
  name: string;                  // Display name (hydrated server-side from exercises collection)
  type?: ExerciseType;           // Category (hydrated server-side; optional during creation)
  sets?: number;                 // Optional for conditioning/warmup
  reps?: string;                 // "8-10", "12", "30 sec", "max"
  rest?: string;                 // "60s", "90s", "2 min"
  details?: string;              // Additional instructions (tempo, etc.)
  videoUrl?: string;             // Hydrated from exercises collection
  thumbnailUrl?: string;         // Hydrated from exercises collection
  // Exercise grouping — exercises sharing the same groupId are performed together
  groupId?: string;              // Shared ID linking grouped exercises
  groupType?: ExerciseGroupType; // Type of grouping
  groupLabel?: string;           // Display label: "Superset A", "Circuit 1", "EMOM 12 min"
  groupRest?: string;            // Rest between full rounds of the group
  groupRounds?: number;          // Number of rounds through the group
}

export interface Workout {
  day: string;                   // "Day 1", "Day 2", etc. - normalized key
  title: string;                 // "Upper Body Strength", etc.
  exercises: Exercise[];
}

export interface Phase {
  phase: string;                 // "Phase 1", "Phase 2", etc.
  weeks: string;                 // "1-4", "5-8", "9-12"
  focus: string;                 // Phase-specific focus description
  workouts: Workout[];           // Array instead of object for consistency
}

export interface Program {
  _id?: string;                  // MongoDB ObjectId (optional for new programs)
  program_id: string;            // Unique slug identifier
  name: string;                  // Display name
  description?: string;          // Short description for listing
  duration_weeks: number;        // Total program duration
  training_days_per_week: number;// Days per week
  goal: string;                  // Primary goal
  target_user: TargetUserLevel;  // Target audience
  equipment?: string[];          // Required equipment list
  tags?: string[];               // Searchable tags for filtering
  phases: Phase[];
  coverImage?: string;
  coverParallax?: boolean;
}

