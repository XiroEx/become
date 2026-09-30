// Run with: npm run test:file tests/unit/tzFamilyParity.test.ts
//
// ─── The native client must tag every route family that reads `tz` ───────────
//
// `tz` is minutes WEST of UTC (`Date.getTimezoneOffset()` semantics). A route
// that reads it and does NOT get it answers for the UTC day: the server's
// readers turn a missing or non-numeric `tz` into 0, so an Eastern member's 9pm
// mood lands on tomorrow.
//
// The shared client (`shared/api-client/src/tz.ts`) tags requests by route
// FAMILY — the first segment under `/api`. That list is hand-maintained, so it
// drifts the moment a new route starts reading `tz`. This test is the tripwire:
// it scans `webapp/app/api` for the server-side readers
//
//     readTzOffset            (query string)
//     readTzOffsetFromBody    (JSON body)
//     readOptionalTzOffsetFromBody
//
// plus hand-rolled reads (`searchParams.get('tz')`, `body.tz`), and FAILS when
// the family that route belongs to is missing from the shared list.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DATE_SCOPED_FAMILIES } from '../../../shared/api-client/src/tz'

/** The server-side helpers that read `tz` off a request. */
const TZ_READERS = [
  'readTzOffset',
  'readTzOffsetFromBody',
  // `tz`, or the legacy `tzOffset` an old bundle may still be sending. A route
  // using only this one reads `tz` just the same, so it belongs on the list.
  'readTzOffsetFromBodyCompat',
  'readOptionalTzOffsetFromBody',
] as const

/**
 * A route may also read `tz` without the shared helpers — `/api/widgets/summary`
 * has its own optional reader, and `/api/nutrition/log`'s DELETE reads the query
 * directly. Those count too.
 */
const HAND_ROLLED_TZ_READS = [/\bget\((['"`])tz\1\)/, /\bbody\.tz\b/]

/**
 * Families deliberately NOT tagged by the shared client. `admin` is the
 * coach-only console: the native app has no screen that calls it, and its
 * callers are webapp pages that already send the browser's offset. Anything
 * else belongs in the shared list, not here.
 */
const UNTAGGED_FAMILIES = new Set(['admin'])

const API_ROOT = path.resolve(__dirname, '../../app/api')

interface ApiSource {
  /** Path relative to `app/api`, e.g. `mind/content/daily/route.ts`. */
  relPath: string
  source: string
}

function collectApiSources(root: string, rel = ''): ApiSource[] {
  const out: ApiSource[] = []
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...collectApiSources(root, childRel))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    out.push({ relPath: childRel, source: readFileSync(path.join(root, childRel), 'utf8') })
  }
  return out
}

/** Does this file read `tz` off the request at all? */
export function readsTz(source: string): boolean {
  if (TZ_READERS.some((reader) => source.includes(`${reader}(`))) return true
  return HAND_ROLLED_TZ_READS.some((re) => re.test(source))
}

/** `mind/content/daily/route.ts` → `mind`. */
function familyOf(relPath: string): string {
  return relPath.split('/')[0] ?? ''
}

/** Every route family under `app/api` that reads `tz`, and where it does it. */
export function familiesReadingTz(sources: ApiSource[]): Map<string, string[]> {
  const families = new Map<string, string[]>()
  for (const { relPath, source } of sources) {
    if (!readsTz(source)) continue
    const family = familyOf(relPath)
    const seen = families.get(family)
    if (seen) seen.push(relPath)
    else families.set(family, [relPath])
  }
  return families
}

/** Families that read `tz` but are not tagged by the shared client. */
export function untaggedTzFamilies(sources: ApiSource[]): Map<string, string[]> {
  const tagged = new Set<string>(DATE_SCOPED_FAMILIES)
  const missing = new Map<string, string[]>()
  for (const [family, files] of familiesReadingTz(sources)) {
    if (tagged.has(family) || UNTAGGED_FAMILIES.has(family)) continue
    missing.set(family, files)
  }
  return missing
}

test('every app/api family that reads tz is tagged by the shared client', () => {
  const sources = collectApiSources(API_ROOT)
  // A scanner that found nothing would pass silently forever.
  assert.ok(sources.length > 100, `expected to scan app/api, found ${sources.length} files`)
  const reading = familiesReadingTz(sources)
  assert.ok(reading.size >= 15, `expected many tz-reading families, found ${reading.size}`)

  const missing = untaggedTzFamilies(sources)
  const report = [...missing.entries()]
    .map(([family, files]) => `  /api/${family} — ${files.join(', ')}`)
    .join('\n')
  assert.equal(
    missing.size,
    0,
    'These route families read `tz` but the shared client never sends one, so they\n'
      + 'answer for the UTC day when the native app calls them. Add the family to\n'
      + 'DATE_SCOPED_FAMILIES in shared/api-client/src/tz.ts:\n'
      + report,
  )
})

test('the scan catches a NEW family that starts reading tz', () => {
  // Proves the tripwire actually trips — the failure mode of a scanner test is
  // passing on an empty or wrongly-shaped input.
  const invented: ApiSource[] = [
    { relPath: 'hydration/route.ts', source: 'const tz = readTzOffset(request.nextUrl.searchParams)' },
  ]
  const missing = untaggedTzFamilies(invented)
  assert.deepEqual([...missing.keys()], ['hydration'])
})

test('the scan catches a real route file on disk, in a family nobody tagged', () => {
  // Same tripwire, but through the filesystem walk rather than a literal —
  // this is the path the assertion above cannot cover.
  const root = mkdtempSync(path.join(tmpdir(), 'tz-family-scan-'))
  mkdirSync(path.join(root, 'hydration'), { recursive: true })
  writeFileSync(
    path.join(root, 'hydration/route.ts'),
    "import { readTzOffsetFromBody } from '@/lib/dayWindow'\n"
      + 'export async function POST(r: Request) { return readTzOffsetFromBody(await r.json()) }\n',
  )
  // A family that IS tagged stays quiet.
  mkdirSync(path.join(root, 'mood'), { recursive: true })
  writeFileSync(
    path.join(root, 'mood/route.ts'),
    "import { readTzOffset } from '@/lib/dayWindow'\nexport async function GET() { return readTzOffset(new URLSearchParams()) }\n",
  )

  const scanned = collectApiSources(root)
  assert.equal(scanned.length, 2)
  assert.deepEqual([...untaggedTzFamilies(scanned).keys()], ['hydration'])
})

test('a hand-rolled tz read counts, not just the shared helpers', () => {
  assert.equal(readsTz("const raw = params.get('tz')"), true)
  assert.equal(readsTz('const bodyTz = body.tz'), true)
  assert.equal(readsTz('const tz = readOptionalTzOffsetFromBody(body) ?? 0'), true)
  assert.equal(readsTz('const timezone = "America/New_York"'), false)
})

test('every family in the shared list is a real app/api directory', () => {
  // A typo (`meal-log`) would silently stop tagging that family, and the scan
  // above would never notice because nothing matches it.
  const dirs = new Set(
    readdirSync(API_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  )
  for (const family of DATE_SCOPED_FAMILIES) {
    assert.ok(dirs.has(family), `DATE_SCOPED_FAMILIES has "${family}" but app/api/${family} does not exist`)
  }
})
