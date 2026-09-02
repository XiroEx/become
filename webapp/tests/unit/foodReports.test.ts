// Run with: npx tsx --test tests/unit/foodReports.test.ts
//
// The member-facing half of food reports. A report that came back "no change"
// used to end silently on our side — which is the worst of the three outcomes,
// because the member is the only party actually holding the packet.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

test('the badge counts only settled-but-unread outcomes', () => {
  const src = read('app/api/nutrition/flags/mine/route.ts')
  // "Being checked" must not badge — nothing is being asked of them yet.
  assert.match(src, /const settled = f\.status === 'confirmed' \|\| f\.status === 'insufficient'/)
  assert.match(src, /unread: settled && !f\.seenAt/)
})

test('only a settled report offers the second chance', () => {
  const src = read('app/api/nutrition/flags/mine/route.ts')
  assert.match(src, /canAddEvidence: settled/)
})

test('re-uploading evidence re-arms escalation', () => {
  // Without clearing escalatedAt, a second no-change would never reach a human
  // — the very case this whole flow exists for.
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')
  assert.match(src, /flag\.escalatedAt = undefined/)
  assert.match(src, /flag\.status = 'open'/)
  // The round counter still advances, but only where a dispatch is certain —
  // see 'a round is spent by a DISPATCH, never by an attempt' in
  // tests/unit/allowance/routeShape.test.ts. Bumping it beside the fields above
  // let a throttled or claim-losing resend burn one of the three rounds for no
  // work, and two of those exhausted the report permanently.
  assert.match(src, /const rounds = roundsSoFar \+ 1/)
})

test('re-uploading clears the verification cooldown — and ONLY the cooldown', () => {
  // New evidence is precisely the reason to re-run; being skipped as
  // recently-verified would make the button a lie.
  //
  // This test used to also require `verification.claimedAt` to be cleared, and
  // that was the bug rather than the contract: claimedAt is not a cooldown, it
  // is the concurrency lock the atomic claim depends on. Unsetting it let a
  // relaunch run alongside whatever was already running, which is how this
  // route became the largest uncapped spend surface in the app. The cooldown
  // override the photo genuinely earns is `lastRunAt`; the lock is left to the
  // compare-and-swap.
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')

  const cooldownUnset = (src.match(/\$unset:\s*\{[^}]*\}/g) ?? []).find(u => /lastRunAt/.test(u))
  assert.ok(cooldownUnset, 'the photo must still override the re-verify cooldown')
  assert.ok(!/claimedAt/.test(cooldownUnset!), 'but it must not drop the concurrency lock')

  assert.match(src, /verifyFood\(String\(flag\.foodId\)/, 'the relaunch still re-runs verification')
  assert.match(
    src,
    /budget:\s*verificationBudgetFor\(rounds\)/,
    'on a reduced budget — a relaunch drops the grounded search, which is the metered cost',
  )
})

test('evidence uploads are still ownership-checked', () => {
  // A forged path would otherwise point the reviewer at an arbitrary fetch
  // target. Every URL goes through ownFlagPhotoUrl, same as the first report.
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')
  assert.match(src, /ownFlagPhotoUrl\(u, auth\.userId!\)/)
  assert.match(src, /String\(flag\.userId\) !== auth\.userId/)
})

test('the picker reads the field the upload route actually returns', () => {
  // The route returns `imageUrl`. Reading `url` silently dropped every photo.
  const src = read('components/nutrition/EvidencePhotoPicker.tsx')
  assert.match(src, /data\?\.imageUrl/)
  assert.doesNotMatch(src, /data\?\.url\b/)
})

test('photos are resized before upload', () => {
  const src = read('components/nutrition/EvidencePhotoPicker.tsx')
  assert.match(src, /resizeImageToBlob\(file, \{ maxDim: 1024/)
})
