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
  assert.match(src, /flag\.rounds = \(flag\.rounds \?\? 1\) \+ 1/)
  assert.match(src, /flag\.status = 'open'/)
})

test('re-uploading clears the verification cooldown', () => {
  // New evidence is precisely the reason to re-run; being skipped as
  // recently-verified would make the button a lie.
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')
  assert.match(src, /verification\.claimedAt/)
  assert.match(src, /verifyFood\(String\(flag\.foodId\)\)/)
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
