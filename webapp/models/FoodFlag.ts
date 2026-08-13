import mongoose, { Schema, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// FoodFlag — a user saying "this food's data looks wrong".
//
// A flag is EVIDENCE SUBMITTED FOR REVIEW, never an edit. Users can correct
// their own MealLog snapshot (see EditFoodModal) and that is the whole extent
// of their write access; the shared catalogue is only ever written by the
// verification agent. So a bad actor can waste our money on agent runs, which
// is what the rate limits are for, but cannot poison anyone else's data.
// ---------------------------------------------------------------------------

/** What the user says is wrong. Drives what the evidence run goes looking for. */
export type FoodFlagKind = 'calories' | 'macros' | 'serving' | 'other'

export type FoodFlagStatus =
  /** Recorded, not yet examined. */
  | 'open'
  /** Attached to an in-flight verification run for the same food. */
  | 'attached'
  /** The run corrected the food. */
  | 'corrected'
  /** The run checked and the data was already right. */
  | 'confirmed'
  /** The run could not settle it from available evidence. */
  | 'insufficient'
  /** Rate-limited or otherwise not actioned. */
  | 'dismissed'

export interface IFoodFlag {
  _id?: Types.ObjectId
  foodId: Types.ObjectId
  userId: Types.ObjectId

  kind: FoodFlagKind
  /** Everything the reporter ticked; `kind` is kinds[0]. */
  kinds?: FoodFlagKind[]
  note?: string

  /** The user's own photo of the nutrition panel. The single strongest evidence
   *  type we can get — they are holding the package. Fed to the evidence run. */
  /** First photo, kept for rows written before multi-upload existed. */
  photoUrl?: string
  /**
   * Every photo on this report. A single shot rarely carries both the barcode
   * and the panel, and the reviewer needs both to tie a label to a product.
   */
  photoUrls?: string[]
  /**
   * Escalated to a human because review ended in no change while the member was
   * still holding a photo that contradicts the record. The online sources and
   * our own row can BOTH be stale copies of the same wrong figure, and no amount
   * of re-reading them fixes that — only a person with the packet in hand can.
   */
  escalatedAt?: Date
  /** How many times this report has been reviewed. Re-uploads bump it. */
  rounds?: number

  /** What the user believes the values should be. A HINT for the reviewer, not
   *  a correction to apply — users misread panels too, and the per-100g vs
   *  per-serving confusion that produced the pistachios record is exactly the
   *  mistake a person makes reading a label in a hurry. */
  claimedValues?: {
    calories?: number
    protein?: number
    carbs?: number
    fats?: number
    servingSize?: number
    servingUnit?: string
  }

  status: FoodFlagStatus
  /** The verification run this flag triggered or attached to. */
  runId?: string
  resolvedAt?: Date
  /** Short human-readable outcome, shown back to the flagger. */
  resolution?: string

  createdAt?: Date
  updatedAt?: Date
}

const FoodFlagSchema = new Schema<IFoodFlag>(
  {
    foodId: { type: Schema.Types.ObjectId, required: true, ref: 'Food' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },

    kind: { type: String, enum: ['calories', 'macros', 'serving', 'other'], required: true },
    // The full selection. `kind` is kept as the primary for existing rows and
    // for anything that reads a single value; `kinds` is what the reporter
    // actually ticked, since "calories AND macros" is an ordinary report.
    kinds: [{ type: String, enum: ['calories', 'macros', 'serving', 'other'] }],
    note: { type: String, maxlength: 1000 },
    photoUrl: { type: String },
    photoUrls: { type: [String], default: undefined },
    escalatedAt: { type: Date },
    rounds: { type: Number, default: 1, min: 1 },

    claimedValues: {
      calories: { type: Number },
      protein: { type: Number },
      carbs: { type: Number },
      fats: { type: Number },
      servingSize: { type: Number },
      servingUnit: { type: String },
    },

    status: {
      type: String,
      enum: ['open', 'attached', 'corrected', 'confirmed', 'insufficient', 'dismissed'],
      default: 'open',
    },
    runId: { type: String },
    resolvedAt: { type: Date },
    resolution: { type: String, maxlength: 500 },
  },
  { timestamps: true },
)

// One flag per user per food, ever. Stops a single account from re-flagging the
// same item to burn agent runs, and makes "how many DIFFERENT people think this
// is wrong" a meaningful corroboration signal rather than a spam count.
FoodFlagSchema.index({ foodId: 1, userId: 1 }, { unique: true })

// The per-user daily rate-limit window, and the flagger's own history.
FoodFlagSchema.index({ userId: 1, createdAt: -1 })

// The review queue: open flags, oldest first.
FoodFlagSchema.index({ status: 1, createdAt: 1 })

export default (mongoose.models.FoodFlag as mongoose.Model<IFoodFlag>) ||
  mongoose.model<IFoodFlag>('FoodFlag', FoodFlagSchema)
