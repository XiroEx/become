import mongoose, { Schema } from 'mongoose';

/**
 * One row per resweep run THAT CHANGED SOMETHING.
 *
 * `app/api/cron/resweep-tiers` is scheduled (see
 * `.github/workflows/resweep-subscription-tiers.yml`) and will run for years
 * over a database where nothing has lapsed. A heartbeat row per run would be a
 * collection that grows forever to record that nothing happened — and "a run
 * that changes nothing writes nothing" is a rule of the sweep itself, not a
 * nicety, because the sweep is the one thing allowed to rewrite a member's tier
 * off the clock. So this collection is a CHANGE LOG, not a run log: no row means
 * no member moved.
 *
 * Where the runs themselves are visible is the scheduler (every run, including
 * the no-ops, lands in the workflow's run history with a summary) and the
 * container log line the route prints. Neither costs a write.
 *
 * Ids only, never emails — this output gets pasted into chat.
 */
export interface ITierResweepChange {
  /** The member, by id. */
  userId: string;
  /** Stored tier before the write. null = the row carried none. */
  from: 'free' | 'plus' | null;
  /** What deriveTier returned, which is what was written. */
  to: 'free' | 'plus';
  /** Stored subscription status that produced the decision. */
  status: string;
  /** Stored period end at decision time. */
  periodEnd?: Date | null;
}

export interface ITierResweepRun {
  ranAt: Date;
  /** 'cron' = the schedule; 'manual' = a hand-triggered call of the same route. */
  source: 'cron' | 'manual';
  /** Which deployment ran it, so a beta run cannot be mistaken for production. */
  channel?: string | null;
  candidates: number;
  planned: number;
  matched: number;
  modified: number;
  downgrades: number;
  upgrades: number;
  durationMs: number;
  changes: ITierResweepChange[];
}

const TierResweepChangeSchema = new Schema<ITierResweepChange>(
  {
    userId: { type: String, required: true },
    from: { type: String, enum: ['free', 'plus', null], default: null },
    to: { type: String, enum: ['free', 'plus'], required: true },
    status: { type: String, required: true },
    periodEnd: { type: Date, default: null },
  },
  { _id: false },
);

const TierResweepRunSchema = new Schema<ITierResweepRun>({
  ranAt: { type: Date, required: true },
  source: { type: String, enum: ['cron', 'manual'], default: 'cron' },
  channel: { type: String, default: null },
  candidates: { type: Number, default: 0 },
  planned: { type: Number, default: 0 },
  matched: { type: Number, default: 0 },
  modified: { type: Number, default: 0 },
  downgrades: { type: Number, default: 0 },
  upgrades: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  changes: { type: [TierResweepChangeSchema], default: [] },
});

// The admin panel reads "the most recent changes" and nothing else.
TierResweepRunSchema.index({ ranAt: -1 });

export default mongoose.models.TierResweepRun
  || mongoose.model<ITierResweepRun>('TierResweepRun', TierResweepRunSchema);
