import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

export interface IStateLog extends Document {
  userId: Types.ObjectId
  state: MindState
  /** When this check-in updates an earlier state the same session, what the
   *  user said changed (free text). Grounding for the future AI layer. */
  note?: string
  /** The state being replaced, when this is a mid-day re-check. */
  previousState?: MindState
  /** The FEELING they actually tapped ("Grateful", "Motivated", "Drained"…).
   *  Twenty feelings map onto four canonical states, and storing only the state
   *  threw the nuance away — picking "Grateful" and picking "Locked in" produced
   *  an identical session and an identical reply. Kept so the app can answer in
   *  their word and the AI can ground on it. */
  feeling?: string
  timestamp: Date
}

const StateLogSchema = new Schema<IStateLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  state: {
    type: String,
    enum: ['stressed', 'distracted', 'low_energy', 'locked_in'],
    required: true,
  },
  note: { type: String },
  previousState: {
    type: String,
    enum: ['stressed', 'distracted', 'low_energy', 'locked_in'],
  },
  feeling: { type: String, maxlength: 40 },
  timestamp: { type: Date, default: Date.now },
})

StateLogSchema.index({ userId: 1, timestamp: -1 })

const StateLog: Model<IStateLog> =
  mongoose.models.StateLog || mongoose.model<IStateLog>('StateLog', StateLogSchema)

export default StateLog
