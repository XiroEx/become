// Run with: npm run test:file tests/unit/danglingExerciseSlug.test.ts
//
// Card: "This exercise is not supported and is not in our admin portal —
// Leg curl machine is not in our data base please fix so I can upload the
// video." The screenshot is an exercise card reading "Leg Curl Machine",
// 2 sets · 12-15 reps · 75s rest, with "No demo video yet" under the Video
// tab.
//
// The leg curl machine IS in the catalog: it is Seated Leg Curl, which
// carries "Leg Curl Machine" as an alias. What is not in the catalog is the
// slug the program points at — `leg-curl-machine`, one of the dangling
// references lib/exerciseAutoCatalog.ts was written about. hydrateExercise
// already covered that case by resolving the ENTRY'S NAME against the
// catalog, but this entry has no name: the whole label on the card is the
// slug text, title-cased by the fallback at the bottom of hydrateExercise.
// So nothing resolved, the card rendered empty, and uploading a video to
// Seated Leg Curl would not have changed it.
//
// A slug is a name with the spaces taken out. These pin reading it back —
// in the app (hydrateExercise), in the one-off repair
// (scripts/repair-program-exercises.ts, plus the reviewed decision for this
// exact reference), and in the admin portal, where the row is titled with
// the catalog's name and the name the coach is searching for is an alias.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { autoCatalogSlug, exerciseNameFromSlug } from '../../lib/exerciseAutoCatalog'
import { buildExerciseNameIndex, resolveExerciseSlug, type IndexableExercise } from '../../lib/exerciseNameMatch'
import { matchesAuditSearch } from '../../lib/exerciseAudit'
import { repairFor } from '../../lib/programExerciseRepairs'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

/** The two leg curls the catalog actually holds, plus a neighbour, as the
 *  name index sees them. */
const CATALOG: IndexableExercise[] = [
  { slug: 'lying-leg-curl', name: 'Lying Leg Curl' },
  { slug: 'seated-leg-curl', name: 'Seated Leg Curl', aliases: ['Leg Curl Machine'] },
  { slug: 'leg-extension', name: 'Leg Extension', aliases: ['Leg Extension Machine'] },
]

// ─── A slug read back into the name it was made from ────────────────────────

test('the slug text is the name with the spaces taken out', () => {
  assert.equal(exerciseNameFromSlug('leg-curl-machine'), 'Leg Curl Machine')
  assert.equal(exerciseNameFromSlug('seated-leg-curl'), 'Seated Leg Curl')
  assert.equal(exerciseNameFromSlug('rowing-sprints'), 'Rowing Sprints')
  assert.equal(exerciseNameFromSlug(''), '')
})

test('the protocol marker is a routing prefix, not part of the name', () => {
  assert.equal(exerciseNameFromSlug('__protocol__amrap-10'), 'Amrap 10')
})

test('it round-trips with the slug rule the admin form uses', () => {
  for (const slug of ['leg-curl-machine', 'sled-push', 'up-downs', 'rowing-sprints']) {
    assert.equal(autoCatalogSlug(exerciseNameFromSlug(slug)), slug)
  }
})

// ─── What the reported card resolves to ─────────────────────────────────────

test('"leg-curl-machine" resolves to the exercise that carries that alias', () => {
  const index = buildExerciseNameIndex(CATALOG)
  assert.equal(resolveExerciseSlug(exerciseNameFromSlug('leg-curl-machine'), index), 'seated-leg-curl')
})

test('the catalog in the repo is the one that carries it', () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, '..', 'data', 'exercises.json'), 'utf8'),
  ) as IndexableExercise[]
  assert.ok(Array.isArray(catalog) && catalog.length > 0, 'catalog fixture loaded')

  const index = buildExerciseNameIndex([...catalog].sort((a, b) => a.slug.localeCompare(b.slug)))
  assert.equal(resolveExerciseSlug(exerciseNameFromSlug('leg-curl-machine'), index), 'seated-leg-curl')
})

test('an ambiguous slug is still dropped rather than guessed at', () => {
  // "Leg Curl" on its own is the seated one and the lying one equally. The
  // matcher's third layer drops a key two exercises claim, and reading it off
  // a slug must not sneak past that.
  const index = buildExerciseNameIndex(CATALOG)
  assert.equal(resolveExerciseSlug(exerciseNameFromSlug('leg-curl'), index), null)
})

// ─── The app: hydrateExercise resolves it on the read path ──────────────────

test('hydrateExercise resolves a dangling slug through its own text', () => {
  const src = readSource('lib/hydrateExercises.ts')
  assert.match(src, /exerciseNameFromSlug/, 'the read path never reads the slug back into a name')
  assert.match(
    src,
    /resolveExerciseSlug\(exerciseNameFromSlug\(slug\), names\)/,
    'a nameless dangling reference has nothing else to resolve with',
  )
  // ...and not for the routing markers, which have no catalog row by design.
  assert.match(src, /!slug\.startsWith\('__protocol__'\)/)
})

test('hydrateExercise takes the reviewed decision over a guess', () => {
  // The repair table is a human's read of the program the reference came
  // from; the resolver is a rule applied to a string. Where both have an
  // answer, the table's is the one on the screen — and the one the repair
  // script will eventually write into the program.
  // From the point the slug lookup misses — above it is the separate legacy
  // "no slug at all, only a name" branch, which resolves by name by design.
  const src = readSource('lib/hydrateExercises.ts').split('let info = map.get(slug)')[1] ?? ''
  assert.match(src, /repairFor\(slug\)\?\.relinkTo/)
  const table = src.indexOf('repairFor(slug)?.relinkTo')
  const byName = src.indexOf('resolveExerciseSlug(exercise.name, names)')
  const bySlug = src.indexOf('resolveExerciseSlug(exerciseNameFromSlug(slug), names)')
  assert.ok(table > 0 && byName > table && bySlug > byName, 'the fallbacks are out of order')
})

// ─── The repair: the reviewed decision for this reference ───────────────────

test('the repair table carries the decision for leg-curl-machine', () => {
  const repair = repairFor('leg-curl-machine')
  assert.ok(repair, 'leg-curl-machine has no entry in the repair table')
  assert.equal(repair!.relinkTo, 'seated-leg-curl')
  assert.equal(repair!.label, 'Leg Curl Machine')
  assert.ok(repair!.note?.trim(), 'the decision is not written down')
})

test('the repair script offers a nameless reference to the resolver', () => {
  const src = readSource('scripts/repair-program-exercises.ts')
  // Was: `ref.name ? matchExerciseName(ref.name, index) : null` — which is
  // why this reference was never even looked up on the 2026-09-18 sweep.
  assert.doesNotMatch(src, /ref\.name \? matchExerciseName/)
  assert.match(src, /matchExerciseName\(ref\.name \|\| slugLabel, index\)/)
  // A minted row is named, not slugged: "Leg Curl Machine", never
  // "leg-curl-machine".
  assert.match(src, /const slugLabel = exerciseNameFromSlug\(ref\.slug\)/)
  assert.match(src, /const label = ref\.name \|\| repair\?\.label \|\| slugLabel/)
})

// ─── The admin portal: the name on the card finds the row ───────────────────

test('the audit tabs match an exercise by the alias a member sees', () => {
  const seatedLegCurl = { slug: 'seated-leg-curl', name: 'Seated Leg Curl', aliases: ['Leg Curl Machine'] }
  assert.equal(matchesAuditSearch(seatedLegCurl, 'leg curl machine'), true)
  assert.equal(matchesAuditSearch(seatedLegCurl, 'Leg Curl Machine'), true)
  // The name and the slug still work, and an empty search still matches.
  assert.equal(matchesAuditSearch(seatedLegCurl, 'seated'), true)
  assert.equal(matchesAuditSearch(seatedLegCurl, 'seated-leg'), true)
  assert.equal(matchesAuditSearch(seatedLegCurl, '   '), true)
  // Something else entirely does not.
  assert.equal(matchesAuditSearch(seatedLegCurl, 'bench press'), false)
  // An exercise with no aliases at all is not an error.
  assert.equal(matchesAuditSearch({ slug: 'plank', name: 'Plank' }, 'leg curl'), false)
})

test('the No Video queue filters with it, aliases included', () => {
  const src = readSource('app/api/exercises/route.ts')
  assert.match(src, /matchesAuditSearch\(e, q\)/)
  // The projection has to fetch the aliases for that to mean anything.
  assert.match(src, /\{ slug: 1, name: 1, aliases: 1,/)
})

test('the admin exercise list shows the other names a row answers to', () => {
  const src = readSource('app/dashboard/admin/exercises/page.tsx')
  assert.match(src, /aliases\?: string\[\]/)
  assert.match(src, /also: \{ex\.aliases\.join\(', '\)\}/)
})
