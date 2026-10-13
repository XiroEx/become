import mongoose, { Schema, Document } from 'mongoose'

/**
 * Per-user time windows for meal tags.
 *
 * The point of this is ORDER, not time. The day view used to render one section
 * per tag in a fixed canonical order (breakfast, lunch, dinner, snack, then
 * custom tags ALPHABETICALLY), which meant a "Bed" meal planned for 11pm sorted
 * above a "Before Work" meal already eaten at 8pm — purely because "bed" sorts
 * before "before work". Giving tags a position on the clock is what lets the day
 * read in the order it actually happened.
 *
 * Windows are OPTIONAL and expected to be partial. A member who works different
 * hours every day should leave "Before Work" and "Snack" unscheduled; those tags
 * still log and still sort (by when they were logged), they just do not
 * contribute a default. Storing a partial map is the normal case, not a
 * degraded one.
 *
 * `lib/mealPlanTimes.ts` holds the app-wide fallback table and says in its
 * header never to add per-user overrides there. This is where they live instead.
 */

export interface IMealTagWindow {
  /** Lowercased tag name. */
  tag: string
  /** Minutes from local midnight, 0-1439. Null when the tag has no set time. */
  startMinutes: number | null
  /** Minutes from local midnight, 0-1439. Null when the tag has no set time. */
  endMinutes: number | null
}

export interface IMealTagSchedule extends Document {
  user: mongoose.Types.ObjectId
  /**
   * Ordered. Position in this array IS the member's meal order, used to place
   * entries logged without a time. Entries with null start/end are unscheduled
   * but still ordered.
   */
  windows: IMealTagWindow[]
  createdAt: Date
  updatedAt: Date
}

const MealTagWindowSchema = new Schema<IMealTagWindow>({
  tag: { type: String, required: true, lowercase: true, trim: true },
  // Null is a first-class value: an UNSCHEDULED tag still needs a row here so
  // its position in the array is remembered. Array order is the member's chosen
  // meal order, which is what orders entries logged without a time.
  // Stored as minutes rather than "HH:MM" so comparison is integer maths and
  // never depends on string collation or locale. A window whose end is <= its
  // start WRAPS past midnight (Bed 23:00-02:00 => start 1380, end 120); that is
  // a legitimate window, not bad data, so there is no validator forbidding it.
  startMinutes: { type: Number, default: null, min: 0, max: 1439 },
  endMinutes: { type: Number, default: null, min: 0, max: 1439 },
}, { _id: false })

const MealTagScheduleSchema = new Schema<IMealTagSchedule>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  windows: { type: [MealTagWindowSchema], default: [] },
}, { timestamps: true })

export default (mongoose.models.MealTagSchedule as mongoose.Model<IMealTagSchedule>)
  || mongoose.model<IMealTagSchedule>('MealTagSchedule', MealTagScheduleSchema)
