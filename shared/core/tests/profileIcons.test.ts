import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  PROFILE_ICON_GRADIENTS,
  profileIconGradient,
} from '../src/profileIcons'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')

/** The web catalog this table must stay identical to. */
function webPresetGradients(): Array<{ id: string; gradient: string }> {
  const src = readFileSync(
    path.join(repoRoot, 'webapp', 'lib', 'reward', 'icons.tsx'),
    'utf8',
  )
  const entries = [...src.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?gradient:\s*'([^']+)'/g)]
  return entries.map((m) => ({ id: m[1]!, gradient: m[2]! }))
}

describe('profileIcons', () => {
  it('covers all 10 presets with valid hex stops', () => {
    assert.equal(PROFILE_ICON_GRADIENTS.length, 10)
    const ids = PROFILE_ICON_GRADIENTS.map((g) => g.id)
    assert.deepEqual(
      ids,
      ['flame', 'strength', 'bolt', 'heart', 'summit', 'sunrise', 'focus', 'spark', 'leaf', 'champion'],
    )
    for (const g of PROFILE_ICON_GRADIENTS) {
      assert.match(g.gradient, /^from-\S+ to-\S+$/, `${g.id} keeps a from→to gradient`)
      assert.equal(g.colors.length, 2)
      for (const c of g.colors) {
        assert.match(c, /^#[0-9a-f]{6}$/, `${g.id} stop ${c} is a hex color`)
      }
    }
  })

  it('stays identical to the web PRESET_ICONS gradient strings', () => {
    const web = webPresetGradients()
    assert.equal(web.length, 10)
    for (const w of web) {
      const shared = PROFILE_ICON_GRADIENTS.find((g) => g.id === w.id)
      assert.ok(shared, `shared table has web preset ${w.id}`)
      assert.equal(shared.gradient, w.gradient, `${w.id} gradient matches web`)
    }
  })

  it('falls back to flame for unknown ids', () => {
    assert.equal(profileIconGradient('nope').id, 'flame')
    assert.equal(profileIconGradient(null).id, 'flame')
    assert.equal(profileIconGradient(undefined).id, 'flame')
    assert.equal(profileIconGradient('heart').colors[0], '#f43f5e')
  })
})
