import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IPushSubscription extends Document {
  userId: Types.ObjectId
  platform: 'web' | 'ios' | 'android'
  /**
   * web: the push service endpoint URL. ios: the raw APNs device token (hex).
   * android: the raw FCM registration token. Never an Expo push token: the
   * server sends to APNs and FCM directly (NP-063/NP-064), and a stored Expo
   * token is pruned on the next send.
   */
  endpoint: string
  /** ios only: the APNs host this token was last delivered through. */
  apnsEnvironment?: 'production' | 'sandbox'
  keys?: {
    p256dh: string
    auth: string
  }
  /**
   * web only: the OS family the browser runs on, classified from the
   * subscribe request's User-Agent (NP-205, lib/push/webDeviceOS.ts). Lets a
   * native token registering for the SAME os mute this row instead of
   * guessing from the push endpoint host.
   */
  webOS?: 'ios' | 'android' | 'other'
  /**
   * Set when a native registration on the same OS took over (NP-205) — MUTED,
   * never deleted: PushSubscriptionSync's resync (lib/push/ensureSubscription.ts)
   * would silently recreate a deleted row the next time this browser's tab
   * reloads with permission still 'granted'. sendPushToUser skips muted rows;
   * only an explicit reenable:true (POST /api/notifications/subscribe) clears
   * this pair.
   */
  mutedAt?: Date
  mutedReason?: 'native_registered'
  createdAt: Date
  updatedAt: Date
}

const PushSubscriptionSchema = new Schema<IPushSubscription>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  platform: { type: String, enum: ['web', 'ios', 'android'], required: true },
  endpoint: { type: String, required: true },
  apnsEnvironment: { type: String, enum: ['production', 'sandbox'] },
  keys: {
    p256dh: { type: String },
    auth: { type: String },
  },
  webOS: { type: String, enum: ['ios', 'android', 'other'] },
  mutedAt: { type: Date },
  mutedReason: { type: String, enum: ['native_registered'] },
}, { timestamps: true })

PushSubscriptionSchema.index({ userId: 1 })
// Prevent duplicate subscriptions for the same endpoint
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true })

export default mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema)
