import mongoose, { Schema } from 'mongoose'

export type CommunityGroupStatus = 'active' | 'archived'
export type CommunityGroupVisibility = 'public' | 'private'

export interface ICommunityGroup {
  _id?: string
  name: string
  slug: string
  description: string
  status: CommunityGroupStatus
  visibility: CommunityGroupVisibility
  tags: string[]
  createdBy: mongoose.Types.ObjectId
  memberIds: mongoose.Types.ObjectId[]
  adminIds: mongoose.Types.ObjectId[]
  createdAt?: Date
  updatedAt?: Date
}

const CommunityGroupSchema = new Schema<ICommunityGroup>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  visibility: { type: String, enum: ['public', 'private'], default: 'public', index: true },
  tags: [{ type: String, trim: true, lowercase: true }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  adminIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

CommunityGroupSchema.index({ status: 1, visibility: 1, updatedAt: -1 })
CommunityGroupSchema.index({ memberIds: 1 })

export default mongoose.models.CommunityGroup || mongoose.model<ICommunityGroup>('CommunityGroup', CommunityGroupSchema)
