// Ownership ledger for become-ai runs. The graph's runId is the only handle the
// client holds, so this row is what makes "is this YOUR run?" answerable.
// Before it existed, GET /api/ai/run/<runId> returned any run to any authed
// user and relied on runIds being unguessable — but they are handed to the
// client and persisted in localStorage (lib/ai/runStore.ts), so that was
// security by obscurity, not authorization.

import mongoose, { Schema, Document } from 'mongoose'

export interface IAiRun extends Document {
  runId: string
  userId: string
  task: string
  createdAt: Date
}

const AiRunSchema = new Schema<IAiRun>({
  runId: { type: String, required: true, unique: true, index: true },
  // STRING, not ObjectId, on purpose: this is a pure ownership ledger keyed by
  // the JWT `userId` claim. An ObjectId cast would throw on a non-ObjectId
  // subject and turn a clean 404 into a 500 on the poll path.
  userId: { type: String, required: true, index: true },
  task: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
})

// redbtn drops run state after ~1h and the client prunes at 2h (runStore PRUNE_MS);
// 24h is a comfortable ceiling over both.
AiRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 })

const AiRun = mongoose.models.AiRun || mongoose.model<IAiRun>('AiRun', AiRunSchema)

export default AiRun
