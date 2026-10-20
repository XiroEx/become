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
  /**
   * `platform: 'web'` only. The OS family classified from the subscribing
   * browser's User-Agent at subscribe time (lib/push/webDeviceOS.ts). Lets a
   * native token (NP-205) find the web subscriptions it is retiring — an
   * iPhone's APNs token mutes 'ios' rows, never 'android' or 'other' (desktop),
   * which is what keeps the web working for members who do not install the
   * app. 'other' includes iPad: iPadOS 13+ Safari's desktop User-Agent is
   * indistinguishable from a Mac's, so it is never auto-muted.
   */
  webOS?: 'ios' | 'android' | 'other'
  /**
   * Set when NP-205 retires this web subscription because a native token
   * registered for the same `webOS`. A muted row is skipped by
   * sendPushToUser but kept, not deleted — PushSubscriptionSync would
   * otherwise silently recreate a deleted row from the browser's still-live
   * subscription object on the member's next page load, undoing the retire.
   * The only way back is the member's own explicit "turn it back on" action
   * (POST .../subscribe with `reenable: true`), the same rule that already
   * governs `notificationsEnabled`.
   */
  mutedAt?: Date | null
  mutedReason?: string
  createdAt: Date
  updatedAt: Date
}

const PushSubscriptionSchema = new Schema<IPushSubscription>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  platform: { type: String, enum: ['web', 'ios', 'android'], required: true },
  endpoint: { type: String, required: true },
  apnsEnvironment: { type: String, enum: ['production', 'sandbox'] },
  webOS: { type: String, enum: ['ios', 'android', 'other'] },
  mutedAt: { type: Date, default: null },
  mutedReason: { type: String },
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
