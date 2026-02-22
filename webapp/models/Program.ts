import mongoose, { Schema, Document, Model } from 'mongoose';

// Exercise Types
export type ExerciseType = 'strength' | 'conditioning' | 'warmup' | 'abs' | 'cooldown';

// Exercise Grouping Types
export type ExerciseGroupType = 'superset' | 'circuit' | 'triset' | 'giant_set' | 'emom' | 'amrap';

// Target User Levels
export type TargetUserLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Beginner to Intermediate' | 'Intermediate to Advanced';

export interface IExercise {
  name: string;
  type: ExerciseType;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
  // Exercise grouping fields
  groupId?: string;
  groupType?: ExerciseGroupType;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
}

export interface IWorkout {
  day: string;
  title: string;
  exercises: IExercise[];
}

export interface IPhase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: IWorkout[];
}

export interface IProgram extends Document {
  program_id: string;
  name: string;
  description?: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: TargetUserLevel;
  equipment?: string[];
  tags?: string[];
  phases: IPhase[];
}

const ExerciseSchema = new Schema<IExercise>({
  name: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['strength', 'conditioning', 'warmup', 'abs', 'cooldown']
  },
  sets: { type: Number },
  reps: { type: String },
  rest: { type: String },
  details: { type: String },
  // Exercise grouping fields
  groupId: { type: String },
  groupType: { 
    type: String,
    enum: ['superset', 'circuit', 'triset', 'giant_set', 'emom', 'amrap']
  },
  groupLabel: { type: String },
  groupRest: { type: String },
  groupRounds: { type: Number },
}, { _id: false });

const WorkoutSchema = new Schema<IWorkout>({
  day: { type: String, required: true },
  title: { type: String, required: true },
  exercises: [ExerciseSchema],
}, { _id: false });

const PhaseSchema = new Schema<IPhase>({
  phase: { type: String, required: true },
  weeks: { type: String, required: true },
  focus: { type: String, required: true },
  workouts: [WorkoutSchema],
}, { _id: false });

const ProgramSchema = new Schema<IProgram>({
  program_id: { type: String, required: true, unique: true },
  name: { type: String, required: true, index: 'text' },
  description: { type: String, index: 'text' },
  duration_weeks: { type: Number, required: true },
  training_days_per_week: { type: Number, required: true },
  goal: { type: String, required: true },
  target_user: { 
    type: String, 
    required: true,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Beginner to Intermediate', 'Intermediate to Advanced']
  },
  equipment: [{ type: String }],
  tags: [{ type: String, index: true }],
  phases: [PhaseSchema],
});

// Create text index for search
ProgramSchema.index({ name: 'text', description: 'text', tags: 'text' }, {
  weights: { name: 10, tags: 5, description: 1 }
});

// Prevent recompilation of model
const Program: Model<IProgram> = mongoose.models.Program || mongoose.model<IProgram>('Program', ProgramSchema);

export default Program;
