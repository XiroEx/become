import mongoose, { Schema, Document, Model } from 'mongoose';

export type ExerciseVideoStatus = 'pending' | 'active' | 'failed';

/**
 * Mirrors `IVideoFraming` from `models/Exercise.ts`. Duplicated rather than
 * imported to avoid a cycle (Exercise pulls nothing from ExerciseVideo, but
 * keeping the dependency arrow one-way keeps the model files independently
 * loadable).
 */
export interface IExerciseVideoFraming {
  fit?: 'contain' | 'cover';
  positionX?: number;
  positionY?: number;
  zoom?: number;
}

export interface IExerciseVideo extends Document {
  // `slug` is the canonical key tying this video to its Exercise. It mirrors
  // Exercise.slug (which is the unique id). Optional in the type because
  // pre-migration rows do not have it; new writes always populate it.
  slug?: string;
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
  /** Intrinsic video pixel dims — populated server-side at upload or
   * back-written from the client when it first plays the file. */
  videoWidth?: number | null;
  videoHeight?: number | null;
  /** Per-video framing override; mirrors `Exercise.videoFraming`. */
  framing?: IExerciseVideoFraming | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseVideoFramingSchema = new Schema<IExerciseVideoFraming>({
  fit:       { type: String, enum: ['contain', 'cover'], default: undefined },
  positionX: { type: Number, default: undefined, min: 0, max: 100 },
  positionY: { type: Number, default: undefined, min: 0, max: 100 },
  zoom:      { type: Number, default: undefined, min: 50, max: 400 },
}, { _id: false });

const ExerciseVideoSchema = new Schema<IExerciseVideo>(
  {
    // Canonical key — matches Exercise.slug. Sparse so legacy/unmigrated
    // rows (which lack the field) don't all collide on `null` under the
    // unique index. Once the migration is run for an environment, every
    // row should have `slug` populated.
    slug: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true,
    },
    // exerciseName is retained for display + legacy fallback reads, but is
    // NO LONGER unique — two exercises can share a display name (only slug
    // is unique on Exercise). Kept indexed so legacy `findOne({ exerciseName })`
    // queries stay cheap.
    exerciseName: {
      type: String,
      required: true,
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
    videoWidth: { type: Number, default: null },
    videoHeight: { type: Number, default: null },
    framing: { type: ExerciseVideoFramingSchema, default: undefined },
  },
  {
    timestamps: true,
  }
);

// Prevent model recompilation in development
const ExerciseVideo: Model<IExerciseVideo> =
  mongoose.models.ExerciseVideo || mongoose.model<IExerciseVideo>('ExerciseVideo', ExerciseVideoSchema);

export default ExerciseVideo;
