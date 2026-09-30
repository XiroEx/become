// Run with: npm run test:file tests/unit/exerciseQueryMatch.test.ts
//
// Card comment (Jon): "All I typed in RDL and nothing popped up. But an RDL is
// a Romanian deadlift so there needs to be some type of fitness knowledge when
// searching for an exercise or common words. This needs support."
//
// GET /api/exercises/search has known that shorthand since the
// "Exercise do not exist in our data base" card (lib/exerciseAbbreviations.ts
// + lib/exerciseSearchRanking.ts). The lists filtered IN THE BROWSER did not:
// your own custom exercises in the add / quick-session sheets and the program
// builder, and every row on the Exercise Library page, were matched with a
// bare `name.toLowerCase().includes(q)`. So the same three letters found
// Romanian Deadlift in one list on the screen and nothing in the one beside
// it.
//
// These pin the shared rule (`matchesExerciseQuery`) and the fact that each of
// those filters now goes through it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { matchesExerciseQuery } from '@/lib/exerciseSearchRanking'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── The reported query ─────────────────────────────────────────────────────

test('RDL finds a Romanian Deadlift, alias or no alias', () => {
  assert.equal(matchesExerciseQuery({ name: 'Romanian Deadlift' }, 'RDL'), true)
  assert.equal(matchesExerciseQuery({ name: 'Dumbbell Romanian Deadlift' }, 'rdl'), true)
  // And the alias route still works for a catalog row that spells it out.
  assert.equal(
    matchesExerciseQuery({ name: 'Romanian Deadlift', aliases: ['RDL'] }, 'rdl'),
    true,
  )
})

test('the rest of the gym shorthand a coach types comes along', () => {
  assert.equal(matchesExerciseQuery({ name: 'Dumbbell Hammer Curl' }, 'DB Hammer Curl'), true)
  assert.equal(matchesExerciseQuery({ name: 'Kettlebell Swing' }, 'kb swing'), true)
  assert.equal(matchesExerciseQuery({ name: 'Overhead Press' }, 'ohp'), true)
  assert.equal(matchesExerciseQuery({ name: 'Bulgarian Split Squat' }, 'bss'), true)
})

test('the plain spelling still matches, on name and on alias', () => {
  assert.equal(matchesExerciseQuery({ name: 'Goblet Squat' }, 'goblet'), true)
  assert.equal(matchesExerciseQuery({ name: 'Goblet Squat' }, 'squat'), true)
  assert.equal(matchesExerciseQuery({ name: 'Rear Delt Fly', aliases: ['Reverse Fly'] }, 'reverse'), true)
})

test('a body part still reaches the exercises that train it', () => {
  // The Exercise Library search matched primaryMuscles by substring; the
  // shared rule keeps that (ranked below name matches by sortByMatchTier).
  assert.equal(matchesExerciseQuery({ name: 'Lat Pulldown', primaryMuscles: ['lats'] }, 'lats'), true)
  assert.equal(matchesExerciseQuery({ name: 'Barbell Row', primaryMuscles: ['upper_back'] }, 'back'), true)
})

test('an unrelated exercise is still not a match', () => {
  assert.equal(matchesExerciseQuery({ name: 'Bench Press' }, 'rdl'), false)
  assert.equal(matchesExerciseQuery({ name: 'Romanian Deadlift' }, 'bench'), false)
  assert.equal(matchesExerciseQuery({ name: 'Goblet Squat' }, ''), false)
})

test('a match still has to line up with the start of a word', () => {
  // The rule the "Add an exercise needs work" card put in: "back" must not
  // match the "back" buried inside "Kickback".
  assert.equal(matchesExerciseQuery({ name: 'Glute Cable Kickback' }, 'back'), false)
})

// ─── Every exercise search box uses it ──────────────────────────────────────

const FILTERS: Array<[label: string, file: string]> = [
  ['the Exercise Library page', 'app/dashboard/workout/library/ExerciseLibraryClient.tsx'],
  ['the live/track "Add an exercise" sheet', 'components/workout/AddExerciseSheet.tsx'],
  ['the quick-session builder', 'components/SessionBuilder.tsx'],
  ['the workout builder\'s exercise editor', 'app/dashboard/workout/create/ExerciseEditor.tsx'],
]

for (const [label, file] of FILTERS) {
  test(`${label} filters with the shared, shorthand-aware rule`, () => {
    const src = readSource(file)
    assert.match(src, /import \{ matchesExerciseQuery \} from ['"]@\/lib\/exerciseSearchRanking['"]/)
    assert.match(src, /matchesExerciseQuery\(/)
    // ...and no longer with a bare substring check on the name.
    assert.doesNotMatch(
      src,
      /\.name\.toLowerCase\(\)\.includes\(/,
      'a raw name substring filter is what made "RDL" come up empty',
    )
  })
}
