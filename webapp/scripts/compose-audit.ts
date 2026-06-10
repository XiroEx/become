import { composeSession, composeThemedSession } from '../lib/mind/composeSession'
import { AFFIRM_STATEMENT_KINDS } from '../lib/mind/moves'
import type { SessionContext, MindSessionPlan } from '../lib/mind/moves'

const AFF = new Set<string>(AFFIRM_STATEMENT_KINDS)
let fails = 0
function audit(label: string, plan: MindSessionPlan | null) {
  if (!plan) return
  // effective kinds including the runtime amplify swap
  const variants: string[][] = [[], []]
  for (const m of plan.moves) {
    variants[0].push(m.kind)
    variants[1].push(m.altPositive ? m.altPositive.kind : m.kind)
  }
  for (const kinds of variants) {
    const dupes = kinds.filter((k, i) => kinds.indexOf(k) !== i)
    const affirmCount = kinds.filter((k) => AFF.has(k)).length
    if (dupes.length > 0) { fails++; console.log(`DUP [${label}] ${kinds.join(',')}`) }
    if (affirmCount > 1) { fails++; console.log(`AFFx${affirmCount} [${label}] ${kinds.join(',')}`) }
  }
}

const states = [null, 'stressed', 'distracted', 'low_energy', 'locked_in'] as const
const longStmt = 'Who is hard-working and gets a job done no matter what. I create my own reality. I help people that are in need.'
for (let ch = 1; ch <= 5; ch++)
  for (const st of states)
    for (const cooldown of [true, false])
      for (const stmt of [null, 'I keep my word.', longStmt])
        for (const recent of [[], ['mirror','breath','win'], ['speak','choice','identity']])
          for (let seed = 0; seed < 60; seed++) {
            audit(`ch${ch}/${st}/${cooldown}/${seed}`, composeSession({
              chapter: ch, unlockedSystems: [], recentState: st ?? null,
              missionAction: 'Do the thing.', identityStatement: stmt, recentKinds: recent,
              dayOfYear: 100, seed, now: 1_000_000_000,
              lastBreathAt: cooldown ? 1_000_000_000 - 1000 : null,
            }))
          }

for (const sys of ['state-shift','self-image','vision','mission','discipline','anti-sabotage','social'])
  for (let seed = 0; seed < 60; seed++)
    audit(`theme:${sys}/${seed}`, composeThemedSession(sys, {
      chapter: 5, unlockedSystems: [], recentState: null, missionAction: 'x',
      identityStatement: longStmt, dayOfYear: 100, seed, now: 1, lastBreathAt: null,
    }))

console.log(fails === 0 ? 'AUDIT PASS — no dupes, max 1 affirm-statement move per session (incl. amplify swaps + all themes)' : `AUDIT FAIL: ${fails}`)
