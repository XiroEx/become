// Run with: npx tsx --test tests/unit/suggestions/SuggestionCard.test.tsx
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { SuggestionCard } from '../../../components/intelligence/SuggestionCard'
import type {
  Suggestion,
  SuggestionSeverity,
} from '../../../lib/suggestions/types'

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'log-weight',
    severity: 'nudge',
    title: 'Log your weight',
    body: 'A weekly check-in keeps the trend honest.',
    dismissible: true,
    cooldownDays: 7,
    source: 'mindset',
    ...overrides,
  }
}

test('SuggestionCard: marked "use client"', async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const src = await fs.readFile(
    path.resolve(process.cwd(), 'components/intelligence/SuggestionCard.tsx'),
    'utf8',
  )
  assert.match(src, /^['"]use client['"]/m)
})

test('SuggestionCard: renders title + body + suggestion id data-attr', () => {
  const html = renderToStaticMarkup(
    <SuggestionCard suggestion={makeSuggestion()} />,
  )
  assert.match(html, /data-testid="suggestion-card"/)
  assert.match(html, /data-suggestion-id="log-weight"/)
  assert.match(html, />Log your weight</)
  assert.match(html, /A weekly check-in keeps the trend honest\./)
})

const SEVERITIES: { severity: SuggestionSeverity; badge: string; wrapperRe: RegExp }[] = [
  { severity: 'info', badge: 'Info', wrapperRe: /bg-zinc-900\/60/ },
  { severity: 'nudge', badge: 'Nudge', wrapperRe: /bg-amber-950\/40/ },
  { severity: 'warning', badge: 'Warning', wrapperRe: /bg-rose-950\/40/ },
  { severity: 'celebration', badge: 'Celebration', wrapperRe: /bg-emerald-950\/40/ },
]

for (const { severity, badge, wrapperRe } of SEVERITIES) {
  test(`SuggestionCard: severity=${severity} → distinct badge + wrapper styling`, () => {
    const html = renderToStaticMarkup(
      <SuggestionCard suggestion={makeSuggestion({ severity })} />,
    )
    assert.match(html, new RegExp(`data-severity="${severity}"`))
    assert.match(html, new RegExp(`>${badge}<`))
    assert.match(html, wrapperRe)
    assert.match(
      html,
      new RegExp(
        `aria-label="${badge} suggestion: Log your weight"`,
      ),
    )
  })
}

test('SuggestionCard: dismissible=true → renders × dismiss button with aria-label', () => {
  const html = renderToStaticMarkup(
    <SuggestionCard suggestion={makeSuggestion({ dismissible: true })} />,
  )
  assert.match(html, /data-testid="suggestion-dismiss"/)
  assert.match(html, /aria-label="Dismiss Log your weight"/)
})

test('SuggestionCard: dismissible=false → dismiss button absent', () => {
  const html = renderToStaticMarkup(
    <SuggestionCard suggestion={makeSuggestion({ dismissible: false })} />,
  )
  assert.doesNotMatch(html, /data-testid="suggestion-dismiss"/)
})

test('SuggestionCard: primaryAction renders Link to href with label', () => {
  const html = renderToStaticMarkup(
    <SuggestionCard
      suggestion={makeSuggestion({
        primaryAction: { label: 'Log now', href: '/dashboard/mind' },
      })}
    />,
  )
  assert.match(html, /data-testid="suggestion-primary-action"/)
  assert.match(html, /href="\/dashboard\/mind"/)
  assert.match(html, />Log now</)
})

test('SuggestionCard: omitted primaryAction → no primary-action link', () => {
  const html = renderToStaticMarkup(
    <SuggestionCard suggestion={makeSuggestion()} />,
  )
  assert.doesNotMatch(html, /data-testid="suggestion-primary-action"/)
})
