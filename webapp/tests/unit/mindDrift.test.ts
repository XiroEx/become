// Run with: npm run test:file tests/unit/mindDrift.test.ts
//
// Lockstep drift test for the copied pure Mind modules (NP-017 / NP-062).
//
// Shared pure domain logic lives in `@become/core` (`shared/core/src/`), imported by
// `expo/` through the Metro link and eventually by `webapp/` once published.
// Today the webapp keeps its OWN source files under `webapp/lib/`, because RedRun
// builds `webapp/` alone and an import of `../shared/*` from webapp code breaks
// every production build.
//
// So the two must stay identical. This test asserts that every copied Mind module
// in `shared/core/src/` is byte-for-byte its web source after the ONLY edit a copy
// is allowed: rewriting the webapp's `@/` import aliases. Change a composer, XP or
// speech-matching module on the web without re-running `node scripts/vendor-mind.mjs`
// and the webapp CI job fails here.
//
// The behavioural half of the same guarantee is tests/unit/mindParity.test.ts.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const WEBAPP_LIB = path.resolve(__dirname, '../../lib')
const WEBAPP_COMPONENTS = path.resolve(__dirname, '../../components')
const SHARED_CORE_SRC = path.resolve(__dirname, '../../../shared/core/src')

/** Keep in lockstep with the rewrites in scripts/vendor-mind.mjs. */
const MIND_REWRITES: [string, string][] = [
  ["from '@/lib/mindContent'", "from '../mindContent'"],
  ["from '@/lib/ai/sanitize'", "from '../ai/sanitize'"],
  ["from '@/components/mind/system/GuidedFlow'", "from './guidedStep'"],
]

const AI_REWRITES: [string, string][] = [
  ["from '@/components/mind/system/GuidedFlow'", "from '../mind/guidedStep'"],
]

function applyAll(src: string, rules: [string, string][]): string {
  return rules.reduce((acc, [from, to]) => acc.replaceAll(from, to), src)
}

interface ModuleSpec {
  name: string
  webRelative: string
  sharedRelative: string
  rewrite: (src: string) => string
}

const mindModule = (name: string): ModuleSpec => ({
  name: `mind/${name}`,
  webRelative: `mind/${name}.ts`,
  sharedRelative: `mind/${name}.ts`,
  rewrite: (src) => applyAll(src, MIND_REWRITES),
})

export const MIND_MODULES: ModuleSpec[] = [
  { name: 'mindXP', webRelative: 'mindXP.ts', sharedRelative: 'mindXP.ts', rewrite: (s) => s },
  { name: 'mindContent', webRelative: 'mindContent.ts', sharedRelative: 'mindContent.ts', rewrite: (s) => s },
  {
    name: 'ai/sanitize',
    webRelative: 'ai/sanitize.ts',
    sharedRelative: 'ai/sanitize.ts',
    rewrite: (s) => applyAll(s, AI_REWRITES),
  },
  mindModule('moves'),
  mindModule('composeSession'),
  mindModule('blueprints'),
  mindModule('bodies'),
  mindModule('openings'),
  mindModule('slots'),
  mindModule('moveBuilders'),
  mindModule('library'),
  mindModule('validateMove'),
  mindModule('sessionPath'),
  mindModule('recommendSegment'),
  mindModule('suggestActions'),
  mindModule('suggestedProtocols'),
  mindModule('moodBridge'),
  mindModule('autoStart'),
  mindModule('introFlows'),
  mindModule('speechMatch'),
  mindModule('recentFeeling'),
  mindModule('rotation'),
]

/** Pull `export interface GuidedStep { … }` out of a file, as text. */
function guidedStepInterface(source: string): string | null {
  const start = source.indexOf('export interface GuidedStep {')
  if (start < 0) return null
  const end = source.indexOf('\n}', start)
  if (end < 0) return null
  return source.slice(start, end + 2)
}

describe('Mind lockstep drift (NP-017 / NP-062)', () => {
  it('covers every pure Mind module the card lists', () => {
    assert.equal(MIND_MODULES.length, 22)
  })

  for (const mod of MIND_MODULES) {
    it(`fails if ${mod.name} in shared/core differs from its web source`, () => {
      const webPath = path.join(WEBAPP_LIB, mod.webRelative)
      const sharedPath = path.join(SHARED_CORE_SRC, mod.sharedRelative)

      assert.ok(fs.existsSync(webPath), `Web source missing: ${webPath}`)
      assert.ok(fs.existsSync(sharedPath), `Shared core copy missing: ${sharedPath}`)

      const webContent = fs.readFileSync(webPath, 'utf8')
      const sharedContent = fs.readFileSync(sharedPath, 'utf8')
      const expectedShared = mod.rewrite(webContent)

      assert.equal(
        sharedContent,
        expectedShared,
        `Lockstep drift detected in ${mod.name}! Run 'node scripts/vendor-mind.mjs' to sync.`,
      )
    })
  }

  it('leaves no `@/` alias behind in any copy', () => {
    for (const mod of MIND_MODULES) {
      const sharedContent = fs.readFileSync(path.join(SHARED_CORE_SRC, mod.sharedRelative), 'utf8')
      assert.ok(
        !/from '@\//.test(sharedContent),
        `${mod.name} still imports a webapp '@/' alias, which does not resolve inside @become/core`,
      )
    }
  })

  it('keeps the copied GuidedStep type identical to the component it came from', () => {
    // sanitize.ts and introFlows.ts import ONLY this type from a component, so it
    // travels with them as shared/core/src/mind/guidedStep.ts.
    const componentSrc = fs.readFileSync(
      path.join(WEBAPP_COMPONENTS, 'mind/system/GuidedFlow.tsx'),
      'utf8',
    )
    const copySrc = fs.readFileSync(path.join(SHARED_CORE_SRC, 'mind/guidedStep.ts'), 'utf8')

    const web = guidedStepInterface(componentSrc)
    const copy = guidedStepInterface(copySrc)
    assert.ok(web, 'GuidedStep interface not found in components/mind/system/GuidedFlow.tsx')
    assert.ok(copy, 'GuidedStep interface not found in shared/core/src/mind/guidedStep.ts')
    assert.equal(copy, web, 'GuidedStep drifted — update shared/core/src/mind/guidedStep.ts')
  })

  it('exports every copied module from the @become/core mind barrel', () => {
    const barrel = fs.readFileSync(path.join(SHARED_CORE_SRC, 'mind/index.ts'), 'utf8')
    for (const mod of MIND_MODULES) {
      if (!mod.name.startsWith('mind/')) continue
      const base = mod.name.slice('mind/'.length)
      assert.match(
        barrel,
        new RegExp(`export \\* from '\\./${base}'`),
        `shared/core/src/mind/index.ts does not re-export ${base}`,
      )
    }
    assert.match(barrel, /export \* from '\.\/guidedStep'/)
  })

  it('fails when any synthetic modification is introduced into a web source', () => {
    const mod = MIND_MODULES.find((m) => m.name === 'mind/composeSession')!
    const webPath = path.join(WEBAPP_LIB, mod.webRelative)
    const webContent = fs.readFileSync(webPath, 'utf8')
    const driftedContent = `${webContent}\n// drifted change\n`
    const expected = mod.rewrite(driftedContent)
    const sharedContent = fs.readFileSync(path.join(SHARED_CORE_SRC, mod.sharedRelative), 'utf8')

    assert.notEqual(
      sharedContent,
      expected,
      'Drift check must catch differences between web source and shared core',
    )
  })
})
