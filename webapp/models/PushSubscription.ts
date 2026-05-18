import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IPushSubscription extends Document {
  userId: Types.ObjectId
  platform: 'web' | 'ios' | 'android'
  endpoint: string        // web: push endpoint URL; ios/android: Expo push token
  keys?: {
    p256dh: string
    auth: string
  }
  createdAt: Date
  updatedAt: Date
}

const PushSubscriptionSchema = new Schema<IPushSubscription>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  platform: { type: String, enum: ['web', 'ios', 'android'], required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String },
    auth: { type: String },
  },
}, { timestamps: true })

PushSubscriptionSchema.index({ userId: 1 })
// Prevent duplicate subscriptions for the same endpoint
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true })

export default mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema)
