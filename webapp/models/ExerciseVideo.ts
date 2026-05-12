import mongoose, { Schema, Document, Model } from 'mongoose';

export type ExerciseVideoStatus = 'pending' | 'active' | 'failed';

export interface IExerciseVideo extends Document {
  exerciseName: string;
  videoUrl: string;
  thumbnailUrl?: string;
  isPlaceholder: boolean;
  // ---------- Blob-storage fields (populated when uploaded via BlobStore) ----------
  // `storageKey` is the object key inside the bucket. It is the canonical
  // identifier — videoUrl is derived from it via S3_PUBLIC_BASE_URL. Stored
  // separately so we can re-derive URLs after a CDN/host migration.
  storageKey?: string;
  status?: ExerciseVideoStatus;
  sizeBytes?: number;
  mimeType?: string;
  uploadedBy?: mongoose.Types.ObjectId;
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
    storageKey: { type: String, default: null, index: true },
    status: { type: String, enum: ['pending', 'active', 'failed'], default: 'active' },
    sizeBytes: { type: Number, default: null },
    mimeType: { type: String, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
  }
);

// Prevent model recompilation in development
const ExerciseVideo: Model<IExerciseVideo> =
  mongoose.models.ExerciseVideo || mongoose.model<IExerciseVideo>('ExerciseVideo', ExerciseVideoSchema);

export default ExerciseVideo;
