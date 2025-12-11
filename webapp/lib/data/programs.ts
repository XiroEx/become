// Exercise Types
export type ExerciseType = 'strength' | 'conditioning' | 'warmup' | 'abs' | 'cooldown';

// Target User Levels
export type TargetUserLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Beginner to Intermediate' | 'Intermediate to Advanced';

export interface Exercise {
  name: string;
  type: ExerciseType;           // Required - categorizes the exercise
  sets?: number;                 // Optional for conditioning/warmup
  reps?: string;                 // "8-10", "12", "30 sec", "max"
  rest?: string;                 // "60s", "90s", "2 min" - normalized to seconds preferred
  details?: string;              // Additional instructions (tempo, superset notes, etc.)
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
  phases: Phase[];
}

