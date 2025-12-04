import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExercise {
  name: string;
  sets?: number;
  reps?: string;
  rest?: string;
  type?: string;
  details?: string;
}

export interface IWorkoutDay {
  title: string;
  exercises: IExercise[];
}

export interface IPhase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: Map<string, IWorkoutDay>;
}

export interface IProgram extends Document {
  program_id: string;
  name: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: string;
  phases: IPhase[];
}

const ExerciseSchema = new Schema<IExercise>({
  name: { type: String, required: true },
  sets: { type: Number },
  reps: { type: String },
  rest: { type: String },
  type: { type: String },
  details: { type: String },
}, { _id: false });

const WorkoutDaySchema = new Schema<IWorkoutDay>({
  title: { type: String, required: true },
  exercises: [ExerciseSchema],
}, { _id: false });

const PhaseSchema = new Schema<IPhase>({
  phase: { type: String, required: true },
  weeks: { type: String, required: true },
  focus: { type: String, required: true },
  workouts: {
    type: Map,
    of: WorkoutDaySchema,
  },
}, { _id: false });

const ProgramSchema = new Schema<IProgram>({
  program_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  duration_weeks: { type: Number, required: true },
  training_days_per_week: { type: Number, required: true },
  goal: { type: String, required: true },
  target_user: { type: String, required: true },
  phases: [PhaseSchema],
});

// Prevent recompilation of model
const Program: Model<IProgram> = mongoose.models.Program || mongoose.model<IProgram>('Program', ProgramSchema);

export default Program;
