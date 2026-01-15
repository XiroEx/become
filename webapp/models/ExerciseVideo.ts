import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExerciseVideo extends Document {
  exerciseName: string;
  videoUrl: string;
  thumbnailUrl?: string;
  isPlaceholder: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseVideoSchema = new Schema<IExerciseVideo>(
  {
    exerciseName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    isPlaceholder: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent model recompilation in development
const ExerciseVideo: Model<IExerciseVideo> = 
  mongoose.models.ExerciseVideo || mongoose.model<IExerciseVideo>('ExerciseVideo', ExerciseVideoSchema);

export default ExerciseVideo;
