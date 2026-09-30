/**
 * POST /api/auth/review-sign-in — the reviewer demo sign-in.
 *
 * Become is passwordless, and an App Store or Play reviewer cannot read the
 * inbox a magic link lands in. This is the one narrow door that lets them in:
 * the designated demo account, a fixed code from the runtime config, typed on
 * the normal sign-in screen (web, iOS and Android all POST here).
 *
 * The rules are in lib/reviewSignIn.ts and the rule about WHICH ROW may be
 * opened is in lib/reviewAccount.ts. This handler is the plumbing between
 * them, in this order and no other:
 *
 *   1. read the config fresh enough that the switch is a config change;
 *   2. count what this email and this address have already spent;
 *   3. record the attempt — before deciding, so a refusal still costs;
 *   4. decide (shut door → malformed → rate limit → account → code);
 *   5. only then touch the database for the account, seed it, and mint the
 *      session the magic-link flow would have minted.
 *
 * The response body is the same shape /api/auth/verify-link answers with, so
 * the native app stores the session exactly as it does after a magic link.
 */
import dbConnect from '@/lib/mongodb'
import { signToken, authCookie } from '@/lib/auth'
import { ensureReviewAccount, readReviewConfig } from '@/lib/reviewAccount'
import { seedReviewAccount } from '@/lib/reviewSeed'
import {
  REVIEW_INVALID_MESSAGE,
  clientAddressFromHeaders,
  decideReviewSignIn,
  normalizeReviewEmail,
} from '@/lib/reviewSignIn'
import {
  attemptKeys,
  clearReviewAttempts,
  readReviewAttemptBudget,
  recordReviewAttempt,
} from '@/models/ReviewSignInAttempt'

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = normalizeReviewEmail((body as { email?: unknown })?.email)
    const rawCode = (body as { code?: unknown })?.code
    const code = typeof rawCode === 'string' ? rawCode.trim() : ''

    const config = await readReviewConfig()

    // The rate limit needs the database whatever the answer turns out to be:
    // counting attempts is what stops the fixed code being guessed.
    await dbConnect()
    const address = clientAddressFromHeaders((name) => req.headers.get(name))
    const keys = attemptKeys(email || 'unknown', address)
    const budget = email && code
      ? await readReviewAttemptBudget(keys)
      : { priorAttempts: 0, retryAfterMs: 0 }

    // Recorded BEFORE the decision, so a wrong guess costs the guesser a try
    // even if the handler throws on the way out. A malformed body is not
    // recorded: it never reached a comparison.
    if (email && code) await recordReviewAttempt(keys)

    const decision = decideReviewSignIn({
      config,
      email,
      code,
      priorAttempts: budget.priorAttempts,
      retryAfterMs: budget.retryAfterMs,
    })

    if (!decision.ok) {
      console.warn(`[review sign-in] refused: ${decision.reason}`)
      return json(
        { message: decision.message, error: decision.reason === 'rate_limited' ? 'rate_limited' : 'invalid_review_code' },
        decision.status,
        decision.retryAfterSeconds
          ? { 'Retry-After': String(decision.retryAfterSeconds) }
          : {},
      )
    }

    const account = await ensureReviewAccount(decision.email)
    if (!account.ok) {
      // The configured address belongs to somebody who is not the demo
      // account. Identical refusal to a wrong code: the misconfiguration is
      // ours to see in the logs, not the caller's to probe for.
      return json({ message: REVIEW_INVALID_MESSAGE, error: 'invalid_review_code' }, 403)
    }

    const user = account.user
    const userId = String(user._id)

    // Believable data, re-anchored to now. A failure here must not stop the
    // reviewer getting in — an empty app is reviewable, a broken sign-in is not.
    try {
      await seedReviewAccount(userId)
    } catch (seedErr) {
      console.error('[review sign-in] seeding the demo account failed', seedErr)
    }

    const token = await signToken({ userId, email: user.email, role: user.role || 'user' })

    // A correct code hands the budget back: a reviewer signing in on a second
    // device, or after a reinstall, must not be locked out by their own
    // successful sign-ins.
    await clearReviewAttempts(keys).catch(() => {})

    console.warn(`[review sign-in] granted for the demo account (${userId})`)

    return json(
      { token, user: { id: userId, name: user.name, email: user.email } },
      200,
      { 'Set-Cookie': authCookie(token) },
    )
  } catch (err: unknown) {
    console.error('review-sign-in error', err)
    return json({ message: 'Server error' }, 500)
  }
}
