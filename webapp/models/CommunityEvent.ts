import mongoose, { Schema } from 'mongoose'

export type CommunityEventStatus = 'draft' | 'published' | 'canceled'
export type CommunityEventFormat = 'in_person' | 'virtual' | 'hybrid'

export interface ICommunityEvent {
  _id?: string
  title: string
  slug: string
  description: string
  status: CommunityEventStatus
  format: CommunityEventFormat
  startsAt: Date
  endsAt?: Date
  timezone?: string
  locationName?: string
  virtualUrl?: string
  capacity?: number
  groupId?: mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  attendeeIds: mongoose.Types.ObjectId[]
  createdAt?: Date
  updatedAt?: Date
}

const CommunityEventSchema = new Schema<ICommunityEvent>({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['draft', 'published', 'canceled'], default: 'draft', index: true },
  format: { type: String, enum: ['in_person', 'virtual', 'hybrid'], default: 'virtual' },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date },
  timezone: { type: String, trim: true },
  locationName: { type: String, trim: true, maxlength: 240 },
  virtualUrl: { type: String, trim: true, maxlength: 500 },
  capacity: { type: Number, min: 1 },
  groupId: { type: Schema.Types.ObjectId, ref: 'CommunityGroup', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  attendeeIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

CommunityEventSchema.index({ status: 1, startsAt: 1 })
CommunityEventSchema.index({ attendeeIds: 1 })

export default mongoose.models.CommunityEvent || mongoose.model<ICommunityEvent>('CommunityEvent', CommunityEventSchema)
