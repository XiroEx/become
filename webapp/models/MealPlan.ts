import mongoose, { Schema, Types } from 'mongoose'
import { IMealItem, IMealNutrition, computeTotalNutrition } from './Meal'

// ---------------------------------------------------------------------------
// MealPlan — a user's INTENT to eat a specific set of items on a specific
// future date, tagged for time-of-day (breakfast/lunch/etc.). When the date
// arrives, the plan can be promoted to a MealLog via
// /api/meal-plans/[id]/promote.
//
// Plans are distinct from logs:
//   - plannedDate is a CALENDAR DATE (YYYY-MM-DD intent), not a precise time.
//   - We store it as Date at UTC midnight where the YYYY-MM-DD portion is
//     the intended LOCAL date, mirroring the workouts Schedule pattern.
//   - expectedNutrition is "expected" — computed from items the same way as
//     a log, but not flowing into daily rollups or streaks until promotion.
//
// `status` is a small state machine:
//   active     — created, not yet promoted; user can edit/delete
//   promoted   — converted to a MealLog (logId stored)
//   skipped    — user explicitly skipped (kept for history); no log created
//   superseded — date arrived, user logged something else; plan kept for ref
// ---------------------------------------------------------------------------

export type MealPlanStatus = 'active' | 'promoted' | 'skipped' | 'superseded'

export interface IMealPlan {
  _id?: Types.ObjectId
  user: Types.ObjectId

  /**
   * The intended calendar date for this meal. Stored as a Date at UTC
   * midnight where the YYYY-MM-DD portion is the intended local date.
   * See lib/mealPlanDates.ts for parse/format rules.
   */
  plannedDate: Date

  /**
   * Tag is REQUIRED on a plan — every plan belongs to a slot of the day.
   * Multiple plans per (user, plannedDate, tag) are allowed (e.g. two
   * snacks). Dedup is API-layer via `mode: 'merge' | 'replace' | 'fail'`.
   */
  tag: string

  /**
   * Snapshotted items — same shape as MealLog.items. Source of truth at
   * plan-create-time for nutrition. We snapshot so a later edit to the
   * underlying Food does not silently change a plan that was already made.
   */
  items: IMealItem[]

  /**
   * If the plan was created by applying a Meal template, keep the source ref
   * so the UI can show "Planned from: Avocado Toast" and so promotion can
   * inherit the meal's tags / image.
   */
  mealId?: Types.ObjectId
  mealName?: string

  /** Free-text user note. Inherited into the MealLog on promote. */
  notes?: string

  /** Expected nutrition — same shape as a log's totalNutrition. */
  expectedNutrition: IMealNutrition

  status: MealPlanStatus

  /**
   * When promoted: the MealLog that was created from this plan. Used by the
   * timeline UI to show a "from plan" badge on the log row and to short-
   * circuit a double-promote.
   */
  logId?: Types.ObjectId
  promotedAt?: Date

  /**
   * Recurrence parent. When a user creates a recurring plan ("every Monday
   * breakfast for 6 weeks"), we expand into N independent MealPlan rows on
   * create and stamp them all with a shared seriesId so a future "delete the
   * whole series" operation can find them.
   */
  seriesId?: Types.ObjectId

  createdAt?: Date
  updatedAt?: Date
}

const MealPlanNutritionSchema = new Schema<IMealNutrition>({
  calories: { type: Number, required: true, default: 0 },
  protein: { type: Number, required: true, default: 0 },
  carbs: { type: Number, required: true, default: 0 },
  fats: { type: Number, required: true, default: 0 },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number },
}, { _id: false })

// Mirrors the MealLog/Meal item subschema. Inline-defined to keep this
// model self-contained.
const MealPlanItemSchema = new Schema<IMealItem>({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  variantId: { type: Schema.Types.ObjectId },
  variantName: { type: String },
  name: { type: String, required: true },
  brand: { type: String },
  servingSize: { type: Number, required: true },
  servingUnit: { type: String, required: true },
  servings: { type: Number, required: true, default: 1 },
  nutrition: { type: MealPlanNutritionSchema, required: true },
  loggedQuantity: { type: Number },
  loggedUnit: { type: String },
  loggedGramsPerServing: { type: Number },
  loggedMlPerServing: { type: Number },
}, { _id: true })

const MealPlanSchema = new Schema<IMealPlan>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plannedDate: { type: Date, required: true },
  tag: { type: String, required: true },
  items: { type: [MealPlanItemSchema], default: [] },
  mealId: { type: Schema.Types.ObjectId, ref: 'Meal' },
  mealName: { type: String },
  notes: { type: String },
  expectedNutrition: { type: MealPlanNutritionSchema, default: () => ({
    calories: 0, protein: 0, carbs: 0, fats: 0,
  }) },
  status: {
    type: String,
    enum: ['active', 'promoted', 'skipped', 'superseded'],
    default: 'active',
    required: true,
  },
  logId: { type: Schema.Types.ObjectId, ref: 'MealLog' },
  promotedAt: { type: Date },
  seriesId: { type: Schema.Types.ObjectId },
}, { timestamps: true })

MealPlanSchema.pre('save', function () {
  this.expectedNutrition = computeTotalNutrition(this.items as IMealItem[])
})

// NON-unique compound index — multiple plans per (user, plannedDate, tag)
// are allowed (e.g. two snacks). Dedup is API-layer.
MealPlanSchema.index({ user: 1, plannedDate: 1, tag: 1 })
MealPlanSchema.index({ user: 1, status: 1, plannedDate: 1 })
MealPlanSchema.index({ seriesId: 1 })

export default mongoose.models.MealPlan
  || mongoose.model<IMealPlan>('MealPlan', MealPlanSchema)
