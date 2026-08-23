/**
 * Audit and safely reconcile stored Food review flags against live rules.
 *
 * The default is a DB read-only dry run. Neither write mode edits nutrition,
 * slugs, variants, merges, or deletes records.
 *
 *   npx tsx scripts/reconcile-food-review-flags.ts --prod
 *   npx tsx scripts/reconcile-food-review-flags.ts --prod --adopt-proven-auto
 *   npx tsx scripts/reconcile-food-review-flags.ts --prod --apply
 *   ... --report scripts/reports/food-review-reconcile.json
 *
 * `--adopt-proven-auto` only adds provenance to legacy true flags whose
 * createdAt exactly equals updatedAt. `--apply` changes only rows that already
 * declare automatic ownership. Run adoption and apply as separate commands.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import dbConnect from '../lib/mongodb'
import { closeRuntimeConfigConnections } from '../lib/runtimeConfig'
import {
  REVIEW_ISSUE_CODES,
  type FoodReviewFlagState,
  type ReviewIssueCode,
} from '../lib/foodReview'
import {
  planFoodReviewReconciliation,
  type ReviewReconciliationAction,
  type ReviewReconciliationFood,
  type ReviewReconciliationPlan,
  type ReviewOwnership,
} from '../lib/foodReviewReconciliation'

dotenv.config({ path: path.join(__dirname, '../.env.local'), quiet: true })

const isProd = process.argv.includes('--prod')
const applyFlags = process.argv.includes('--apply')
const adoptProvenAuto = process.argv.includes('--adopt-proven-auto')

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const reportPath = argumentValue('--report')

if (applyFlags && adoptProvenAuto) {
  throw new Error('Run --adopt-proven-auto and --apply as separate commands')
}
if (process.argv.includes('--report') && !reportPath) {
  throw new Error('--report requires a file path')
}
if (isProd) Reflect.set(process.env, 'NODE_ENV', 'production')

type Mode = 'dry-run' | 'adopt-proven-auto' | 'apply'
const mode: Mode = adoptProvenAuto ? 'adopt-proven-auto' : applyFlags ? 'apply' : 'dry-run'

interface FoodDocument extends ReviewReconciliationFood {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
  needsReview?: boolean
  reviewFlag?: FoodReviewFlagState
}

interface ProposalAudit {
  id: string
  ownership: ReviewOwnership
  action: ReviewReconciliationAction
  before: {
    needsReview: boolean
    owner: ReviewOwnership
    issueCodes: ReviewIssueCode[]
    ruleVersion?: string
  }
  after?: {
    needsReview: boolean
    owner: 'automatic' | 'manual'
    issueCodes: ReviewIssueCode[]
    ruleVersion: string
  }
}

interface AuditSummary {
  scanned: number
  storedFlagged: number
  liveFlagged: number
  ownership: Record<ReviewOwnership, number>
  liveIssueBuckets: Record<ReviewIssueCode, number>
  liveIssueOverlaps: Record<string, number>
  proposedActions: Record<ReviewReconciliationAction, number>
  proposedFlagChanges: number
  proposedEvidenceRefreshes: number
  proposedProvenanceAdoptions: number
  adoptionCandidatesStillFlaggedByLiveRules: number
  adoptionCandidatesThatWouldClearOnApply: number
  manualStoredVsLiveDisagreements: number
  legacyStoredVsLiveDisagreements: number
  automaticDataMutations: 0
}

interface WriteSummary {
  attempted: number
  applied: number
  compareAndSwapMisses: number
}

interface ScanResult {
  summary: AuditSummary
  proposals: ProposalAudit[]
  writes: WriteSummary
}

function emptyRecord<T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map(key => [key, 0])) as Record<T[number], number>
}

function proposalAudit(food: FoodDocument, plan: ReviewReconciliationPlan): ProposalAudit {
  const owner = food.reviewFlag?.owner === 'automatic' || food.reviewFlag?.owner === 'manual'
    ? food.reviewFlag.owner
    : 'legacy'
  return {
    id: food._id.toString(),
    ownership: plan.ownership,
    action: plan.action,
    before: {
      needsReview: plan.before.needsReview,
      owner,
      issueCodes: plan.before.reviewFlag?.issueCodes ?? [],
      ruleVersion: plan.before.reviewFlag?.ruleVersion,
    },
    ...(plan.after?.reviewFlag ? {
      after: {
        needsReview: plan.after.needsReview,
        owner: plan.after.reviewFlag.owner,
        issueCodes: plan.after.reviewFlag.issueCodes,
        ruleVersion: plan.after.reviewFlag.ruleVersion,
      },
    } : {}),
  }
}

async function applyAutomaticPlan(
  foods: ReturnType<NonNullable<typeof mongoose.connection.db>['collection']>,
  food: FoodDocument,
  plan: ReviewReconciliationPlan,
): Promise<boolean> {
  if (plan.ownership !== 'automatic' || plan.action === 'none' || !plan.after?.reviewFlag) return false
  const result = await foods.updateOne(
    {
      _id: food._id,
      'reviewFlag.owner': 'automatic',
      needsReview: plan.before.needsReview,
      updatedAt: food.updatedAt,
    },
    {
      $set: {
        needsReview: plan.after.needsReview,
        reviewFlag: plan.after.reviewFlag,
        updatedAt: plan.after.reviewFlag.updatedAt,
      },
    },
  )
  return result.modifiedCount === 1
}

async function adoptLegacyPlan(
  foods: ReturnType<NonNullable<typeof mongoose.connection.db>['collection']>,
  food: FoodDocument,
  plan: ReviewReconciliationPlan,
): Promise<boolean> {
  if (plan.action !== 'adopt-proven-auto' || !plan.after?.reviewFlag) return false
  const result = await foods.updateOne(
    {
      _id: food._id,
      needsReview: true,
      reviewFlag: { $exists: false },
      createdAt: food.createdAt,
      updatedAt: food.updatedAt,
    },
    {
      // Provenance-only: preserve needsReview and the top-level updatedAt.
      $set: { reviewFlag: plan.after.reviewFlag },
    },
  )
  return result.modifiedCount === 1
}

async function scan(mutate: Mode = 'dry-run'): Promise<ScanResult> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Mongo connection is not ready')
  const foods = db.collection('foods')
  const scanAt = new Date()

  const summary: AuditSummary = {
    scanned: 0,
    storedFlagged: 0,
    liveFlagged: 0,
    ownership: emptyRecord(['automatic', 'manual', 'legacy'] as const),
    liveIssueBuckets: emptyRecord(REVIEW_ISSUE_CODES),
    liveIssueOverlaps: {},
    proposedActions: emptyRecord(['none', 'set', 'clear', 'refresh', 'adopt-proven-auto'] as const),
    proposedFlagChanges: 0,
    proposedEvidenceRefreshes: 0,
    proposedProvenanceAdoptions: 0,
    adoptionCandidatesStillFlaggedByLiveRules: 0,
    adoptionCandidatesThatWouldClearOnApply: 0,
    manualStoredVsLiveDisagreements: 0,
    legacyStoredVsLiveDisagreements: 0,
    automaticDataMutations: 0,
  }
  const writes: WriteSummary = { attempted: 0, applied: 0, compareAndSwapMisses: 0 }
  const proposals: ProposalAudit[] = []

  const cursor = foods.find({}, {
    projection: {
      _id: 1,
      slug: 1,
      variants: 1,
      needsReview: 1,
      reviewFlag: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  })

  for await (const rawFood of cursor) {
    const food = rawFood as unknown as FoodDocument
    const plan = planFoodReviewReconciliation(food, { at: scanAt })
    summary.scanned += 1
    if (food.needsReview === true) summary.storedFlagged += 1
    if (plan.liveIssueCodes.length > 0) summary.liveFlagged += 1
    summary.ownership[plan.ownership] += 1
    summary.proposedActions[plan.action] += 1

    for (const code of plan.liveIssueCodes) summary.liveIssueBuckets[code] += 1
    const overlap = plan.liveIssueCodes.length > 0
      ? [...plan.liveIssueCodes].sort().join('+')
      : 'none'
    summary.liveIssueOverlaps[overlap] = (summary.liveIssueOverlaps[overlap] ?? 0) + 1

    const storedVsLiveDisagree = (food.needsReview === true) !== (plan.liveIssueCodes.length > 0)
    if (plan.ownership === 'manual' && storedVsLiveDisagree) {
      summary.manualStoredVsLiveDisagreements += 1
    }
    if (plan.ownership === 'legacy' && storedVsLiveDisagree) {
      summary.legacyStoredVsLiveDisagreements += 1
    }

    if (plan.action === 'set' || plan.action === 'clear') summary.proposedFlagChanges += 1
    if (plan.action === 'refresh') summary.proposedEvidenceRefreshes += 1
    if (plan.action === 'adopt-proven-auto') {
      summary.proposedProvenanceAdoptions += 1
      if (plan.liveIssueCodes.length > 0) {
        summary.adoptionCandidatesStillFlaggedByLiveRules += 1
      } else {
        summary.adoptionCandidatesThatWouldClearOnApply += 1
      }
    }
    if (plan.action !== 'none') proposals.push(proposalAudit(food, plan))

    const shouldApply = mutate === 'apply'
      && plan.ownership === 'automatic'
      && plan.action !== 'none'
    const shouldAdopt = mutate === 'adopt-proven-auto'
      && plan.action === 'adopt-proven-auto'
    if (!shouldApply && !shouldAdopt) continue

    writes.attempted += 1
    const changed = shouldApply
      ? await applyAutomaticPlan(foods, food, plan)
      : await adoptLegacyPlan(foods, food, plan)
    if (changed) writes.applied += 1
    else writes.compareAndSwapMisses += 1
  }

  return { summary, proposals, writes }
}

async function writeReport(value: unknown, destination: string): Promise<string> {
  const absolute = path.resolve(destination)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  return absolute
}

async function main() {
  await dbConnect()

  const before = await scan(mode)
  const after = mode === 'dry-run' ? undefined : (await scan()).summary
  const report = {
    generatedAt: new Date().toISOString(),
    environment: isProd ? 'production' : 'local',
    databaseName: mongoose.connection.name,
    mode,
    before: before.summary,
    writes: before.writes,
    after,
    proposals: before.proposals,
  }

  // Stdout is compact but sufficient to assess the run. Full per-row audit
  // is available through an explicit, non-overwriting --report path.
  console.log(JSON.stringify({
    marker: 'FOOD_REVIEW_RECONCILIATION',
    environment: report.environment,
    databaseName: report.databaseName,
    mode,
    before: before.summary,
    writes: before.writes,
    after,
    proposalSample: before.proposals.slice(0, 20),
    proposalSampleTruncated: before.proposals.length > 20,
  }, null, 2))

  if (reportPath) {
    const written = await writeReport(report, reportPath)
    console.log(JSON.stringify({ reportWritten: written }))
  }

  await mongoose.disconnect()
  await closeRuntimeConfigConnections()
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown reconciliation error'
  console.error(JSON.stringify({ marker: 'FOOD_REVIEW_RECONCILIATION_ERROR', message }))
  try { await mongoose.disconnect() } catch { /* best effort */ }
  try { await closeRuntimeConfigConnections() } catch { /* best effort */ }
  process.exit(1)
})
