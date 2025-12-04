export interface Exercise {
  name: string;
  sets?: number;
  reps?: string;
  rest?: string;
  type?: string;
  details?: string;
}

export interface WorkoutDay {
  title: string;
  exercises: Exercise[];
}

export interface Phase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: {
    [key: string]: WorkoutDay;
  };
}

export interface Program {
  program_id: string;
  name: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: string;
  phases: Phase[];
}

