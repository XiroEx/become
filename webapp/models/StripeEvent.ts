import mongoose, { Schema } from 'mongoose';

/**
 * One row per Stripe webhook event we have started processing. The UNIQUE index
 * on `eventId` is the idempotency mechanism, not a nicety: Stripe retries a
 * delivery whenever the response is not 2xx (and occasionally when it was), so
 * "have I already applied this?" has to be answered atomically. An insert that
 * fails with E11000 IS the answer.
 *
 * Follows the MagicLink TTL idiom. 30 days is far past Stripe's ~3-day retry
 * window and short enough that the collection stays trivially small.
 */
export interface IStripeEvent {
  /** Stripe `evt_…`. Unique — this is the claim. */
  eventId: string;
  type: string;
  mode: 'test' | 'live';
  status: 'processing' | 'processed';
  receivedAt: Date;
  processedAt?: Date | null;
}

const StripeEventSchema = new Schema<IStripeEvent>({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  mode: { type: String, enum: ['test', 'live'], required: true },
  status: { type: String, enum: ['processing', 'processed'], default: 'processing' },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
});

StripeEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.models.StripeEvent
  || mongoose.model<IStripeEvent>('StripeEvent', StripeEventSchema);
