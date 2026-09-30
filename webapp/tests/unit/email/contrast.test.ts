// Run with: npm run test:file tests/unit/email/contrast.test.ts
//
// The sign-in email arrived unreadable in the Gmail Android app: the wordmark
// was dark ink on the dark header, so the top of the email was blank. The
// cause was not the palette but the painting — the header's darkness came from
// a `linear-gradient`, which is a background-image, and a client's dark mode
// rewrites `color` and `background-color` while leaving a background-image
// alone. The white wordmark was flipped to dark ink and the dark gradient
// stayed put.
//
// So this does not assert a list of hex values. It renders the real email,
// walks every run of text in it, resolves the `color` and the
// `background-color` that text actually lands on, and checks the pair three
// times: as authored, under the dark-mode block the email ships, and with both
// colours inverted (the crude model of a client that rewrites what it can
// parse). The original bug fails all three at the same assertion — a run of
// text whose surface cannot be resolved to a colour at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verificationEmailHtml, emailShell, EMAIL_LIGHT, EMAIL_DARK } from '../../../lib/email'

// ─── WCAG 2.1 contrast ───────────────────────────────────────────────────────

function srgb(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function rgb(color: string): [number, number, number] {
  const hex = color.trim().toLowerCase()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(hex)
  assert.ok(m, `not a hex colour: ${color}`)
  const h = m![1].length === 3 ? m![1].split('').map((c) => c + c).join('') : m![1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color)
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function invert(color: string): string {
  return '#' + rgb(color).map((c) => (255 - c).toString(16).padStart(2, '0')).join('')
}

test('the contrast calculator agrees with the WCAG reference values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21)
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1)
  assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.05, 'the AA boundary grey')
  // The two values this card was about: the footer grey the email used to use,
  // and the one it uses now.
  assert.ok(contrastRatio('#a1a1aa', '#ffffff') < 3, 'zinc-400 on white was never readable')
  assert.ok(contrastRatio(EMAIL_LIGHT.muted, EMAIL_LIGHT.surface) >= 4.5)
})

// ─── A very small HTML walker ────────────────────────────────────────────────
//
// The templates are hand-written, well-formed and tiny, so a tag stack is
// enough — and a real parser would still not tell us what a run of text lands
// on, which is the only question here.

interface El {
  tag: string
  classes: string[]
  style: Record<string, string>
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'meta', 'input', 'link', 'source', 'area', 'base'])

function parseStyle(decls: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of decls.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim()
  }
  return out
}

function attr(attrs: string, name: string): string {
  return new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1] ?? ''
}

interface Run {
  text: string
  stack: El[]
}

/** Every run of visible text in the document body, with the elements enclosing it. */
function textRuns(html: string): Run[] {
  const start = html.indexOf('<body')
  assert.ok(start > 0, 'no <body> in the rendered email')
  const body = html.slice(start)
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g
  const runs: Run[] = []
  const stack: El[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = tag.exec(body))) {
    const text = body.slice(cursor, m.index).replace(/\s+/g, ' ').trim()
    if (text) runs.push({ text, stack: [...stack] })
    cursor = tag.lastIndex
    const [, closing, name, attrs, selfClosing] = m
    const lower = name.toLowerCase()
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === lower) {
          stack.length = i
          break
        }
      }
    } else if (!selfClosing && !VOID_TAGS.has(lower)) {
      stack.push({
        tag: lower,
        classes: attr(attrs, 'class').split(/\s+/).filter(Boolean),
        style: parseStyle(attr(attrs, 'style')),
      })
    }
  }
  return runs
}

/** The `.class { prop: value !important }` rules inside the dark-mode block. */
function darkRules(html: string): Record<string, Record<string, string>> {
  const at = html.indexOf('@media (prefers-color-scheme: dark)')
  assert.ok(at > 0, 'the email ships no dark-mode block')
  let depth = 0
  let end = at
  for (let i = html.indexOf('{', at); i < html.length; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const block = html.slice(at, end)
  const rules: Record<string, Record<string, string>> = {}
  const rule = /\.([a-zA-Z0-9-]+)\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = rule.exec(block))) {
    const decls = parseStyle(m[2].replace(/!important/g, ''))
    rules[m[1]] = { ...(rules[m[1]] ?? {}), ...decls }
  }
  assert.ok(Object.keys(rules).length >= 5, 'the dark-mode block styles almost nothing')
  return rules
}

type Mode = 'light' | 'dark' | 'inverted'

/**
 * What an element declares for one property, honouring the dark-mode class
 * override when rendering dark (the override carries !important, so it beats
 * the inline style — which is exactly why it has to).
 */
function declared(el: El, prop: string, rules: Record<string, Record<string, string>>, mode: Mode): string | undefined {
  if (mode === 'dark') {
    for (const cls of el.classes) {
      const value = rules[cls]?.[prop]
      if (value) return value
    }
  }
  if (el.style[prop]) return el.style[prop]
  if (prop === 'background-color' && el.style.background) {
    // A `background` shorthand is only a surface if it is a flat colour. A
    // gradient or an image is the bug this test exists for: the client cannot
    // rewrite it, so the ink above it moves on its own.
    const shorthand = el.style.background
    return /^#[0-9a-fA-F]{3,6}$/.test(shorthand.trim()) ? shorthand.trim() : `NOT-A-COLOUR(${shorthand})`
  }
  return undefined
}

function resolve(run: Run, prop: string, rules: Record<string, Record<string, string>>, mode: Mode): string | undefined {
  for (let i = run.stack.length - 1; i >= 0; i--) {
    const value = declared(run.stack[i], prop, rules, mode)
    if (value) return value
  }
  return undefined
}

/** AA is 4.5:1, or 3:1 for text at 24px, or 18.66px and bold. */
function required(run: Run): number {
  const size = parseFloat(resolve(run, 'font-size', {}, 'light') ?? '16')
  const weightRaw = resolve(run, 'font-weight', {}, 'light') ?? '400'
  const weight = weightRaw === 'bold' ? 700 : parseInt(weightRaw, 10) || 400
  return size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5
}

function checkContrast(html: string, mode: Mode, label: string, minRuns = 6): number {
  const rules = darkRules(html)
  const runs = textRuns(html)
  assert.ok(runs.length >= minRuns, `${label}: only ${runs.length} runs of text found — the walker missed the body`)
  for (const run of runs) {
    const where = `${label}: "${run.text.slice(0, 48)}"`
    let ink = resolve(run, 'color', rules, mode)
    let surface = resolve(run, 'background-color', rules, mode)
    assert.ok(ink, `${where} — no colour is declared for this text, so the client picks it`)
    assert.ok(surface, `${where} — no ancestor declares a background-color, so the client picks the surface`)
    assert.doesNotMatch(
      surface!,
      /NOT-A-COLOUR/,
      `${where} — the surface under this text is ${surface}. A gradient or image cannot be rewritten by a`
        + ' client that inverts the ink above it, which is how the wordmark went dark-on-dark.',
    )
    if (mode === 'inverted') {
      ink = invert(ink!)
      surface = invert(surface!)
    }
    const ratio = contrastRatio(ink!, surface!)
    assert.ok(
      ratio >= required(run),
      `${where} — ${ink} on ${surface} is ${ratio.toFixed(2)}:1, below the ${required(run)}:1 it needs`,
    )
  }
  return runs.length
}

// ─── The sign-in email ───────────────────────────────────────────────────────

const SIGN_IN = verificationEmailHtml({
  verifyUrl: 'https://become.redbtn.io/verify?token=' + 'a'.repeat(64) + '&mode=login',
  mode: 'login',
})

test('nothing in the sign-in email is painted on a gradient or an image', () => {
  assert.doesNotMatch(SIGN_IN, /linear-gradient|radial-gradient|background-image|url\(/i)
})

test('the sign-in email declares that it brings its own dark styles', () => {
  assert.match(SIGN_IN, /<meta name="color-scheme" content="light dark">/)
  assert.match(SIGN_IN, /<meta name="supported-color-schemes" content="light dark">/)
  assert.match(SIGN_IN, /color-scheme: light dark/)
})

test('every run of text in the sign-in email clears AA as authored', () => {
  const runs = checkContrast(SIGN_IN, 'light', 'sign-in (light)')
  // The wordmark, the greeting, the instruction, the button, the ignore-it
  // line, the fallback link and the CAN-SPAM footer.
  assert.ok(runs >= 8, `expected the whole email to be walked, saw ${runs} runs`)
})

test('every run clears AA again under the dark-mode block the email ships', () => {
  checkContrast(SIGN_IN, 'dark', 'sign-in (dark)')
})

test('every run clears AA again when a client inverts what it can parse', () => {
  checkContrast(SIGN_IN, 'inverted', 'sign-in (inverted)')
})

test('the registration variant is the same email with a different button', () => {
  const register = verificationEmailHtml({ verifyUrl: 'https://x.test/verify?token=t&mode=register', mode: 'register' })
  assert.match(register, />Complete Registration</)
  assert.match(SIGN_IN, />Sign In</)
  for (const mode of ['light', 'dark', 'inverted'] as const) checkContrast(register, mode, `register (${mode})`)
})

// ─── The shell, which every template renders into ────────────────────────────

test('the wordmark sits on a flat surface, in both palettes', () => {
  assert.ok(contrastRatio(EMAIL_LIGHT.headerInk, EMAIL_LIGHT.headerSurface) >= 4.5)
  assert.ok(contrastRatio(EMAIL_DARK.headerInk, EMAIL_DARK.headerSurface) >= 4.5)
  // The regression itself: a header whose darkness is a gradient is refused,
  // whatever the ink on it is.
  const gradient = emailShell({
    title: 'x',
    content: '<p style="color: #ffffff; background: linear-gradient(135deg, #18181b 0%, #27272a 100%);">BECOME</p>',
  })
  assert.throws(() => checkContrast(gradient, 'light', 'gradient', 1), /gradient or image cannot be rewritten/)
})

test('a dark-mode override exists for every surface and ink the shell declares', () => {
  const rules = darkRules(SIGN_IN)
  for (const cls of ['b-page', 'b-header', 'b-header-ink', 'b-card', 'b-ink', 'b-muted', 'b-muted-link', 'b-button']) {
    assert.ok(rules[cls], `no dark-mode rule for .${cls}`)
  }
  // An unclassed element keeps its light ink in dark mode, so the shell's own
  // inherited colour has to be overridden too.
  assert.equal(rules['b-page'].color, EMAIL_DARK.ink)
})

test('the palettes are internally consistent', () => {
  const pairs: Array<[string, string, string]> = [
    ['ink on the card', EMAIL_LIGHT.ink, EMAIL_LIGHT.surface],
    ['muted on the card', EMAIL_LIGHT.muted, EMAIL_LIGHT.surface],
    ['muted link on the card', EMAIL_LIGHT.mutedLink, EMAIL_LIGHT.surface],
    ['button', EMAIL_LIGHT.buttonInk, EMAIL_LIGHT.buttonSurface],
    ['dark ink on the card', EMAIL_DARK.ink, EMAIL_DARK.surface],
    ['dark muted on the card', EMAIL_DARK.muted, EMAIL_DARK.surface],
    ['dark muted link on the card', EMAIL_DARK.mutedLink, EMAIL_DARK.surface],
    ['dark button', EMAIL_DARK.buttonInk, EMAIL_DARK.buttonSurface],
  ]
  for (const [what, ink, surface] of pairs) {
    const ratio = contrastRatio(ink, surface)
    assert.ok(ratio >= 4.5, `${what}: ${ink} on ${surface} is only ${ratio.toFixed(2)}:1`)
  }
})
