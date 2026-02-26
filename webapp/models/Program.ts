import mongoose, { Schema, Document, Model } from 'mongoose';
import type { ExerciseRole } from './Exercise';

// Exercise Grouping Types
export type ExerciseGroupType = 'superset' | 'circuit' | 'triset' | 'giant_set' | 'emom' | 'amrap';

// Target User Levels
export type TargetUserLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Beginner to Intermediate' | 'Intermediate to Advanced';

/**
 * A reference to an Exercise document with programming-specific overrides.
 *
 * The Exercise document defines WHAT the exercise IS (muscles, patterns, equipment).
 * This interface defines what the exercise DOES in this specific program context
 * (sets, reps, rest, tempo, RPE).
 *
 * exerciseSlug is the sole link — every entry must reference a real Exercise doc.
 */
export interface IProgramExercise {
  exerciseSlug: string;      // references Exercise.slug — required

  // Programming prescription (how it's performed HERE)
  sets?: number;
  reps?: string;             // "5", "8-12", "AMRAP"
  rest?: string;             // "90 sec", "2-3 min"
  tempo?: string;            // "3-1-1-0" (eccentric-pause-concentric-pause)
  rpe?: number;              // rate of perceived exertion 1-10
  percentOf1RM?: number;     // for percentage-based programming
  duration?: string;         // for timed work: "30 sec", "60 sec"

  // Coaching context
  role?: ExerciseRole;       // overrides Exercise.role for THIS program
                             // (RDL is compound on hamstring day, accessory on squat day)
  details?: string;          // coach notes specific to this workout

  // Exercise grouping (supersets, circuits, etc.)
  groupId?: string;
  groupType?: ExerciseGroupType;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
}

export interface IWorkout {
  day: string;
  title: string;
  exercises: IProgramExercise[];
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

const ProgramExerciseSchema = new Schema<IProgramExercise>({
  exerciseSlug: { type: String, required: true },

  // Programming prescription
  sets: { type: Number },
  reps: { type: String },
  rest: { type: String },
  tempo: { type: String },
  rpe: { type: Number, min: 1, max: 10 },
  percentOf1RM: { type: Number, min: 0, max: 100 },
  duration: { type: String },

  // Coaching context
  role: {
    type: String,
    enum: ['compound', 'secondary', 'accessory'],
  },
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
  exercises: [ProgramExerciseSchema],
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
