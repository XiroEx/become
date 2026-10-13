// SERVER-ONLY. The database half of the reviewer demo sign-in — the config
// read, and the ONE rule that cannot live in lib/reviewSignIn.ts because it is
// a fact about a row rather than about a request:
//
//   THE CODE OPENS THE DEMO ACCOUNT, OR NOTHING.
//
// `review.email` is configuration, and configuration can be wrong. Typed as a
// real member's address — a coach's, a beta tester's, anyone's — a
// config-only check would hand a stranger that member's account, their
// weigh-ins, their meals and their journal. So the row itself has to agree:
// an existing User is only signed in when it carries `isReviewAccount: true`,
// which is set exactly once, by the create below, on an address nobody was
// using. A mis-set config therefore fails closed instead of leaking a member.

import dbConnect from '@/lib/mongodb'
import User, { type IUser } from '@/models/User'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import {
  REVIEW_CONFIG_MAX_AGE_MS,
  type ReviewAccountConfig,
} from '@/lib/reviewSignIn'
import { REVIEW_ACCOUNT_NAME, reviewUserFields } from '@/lib/reviewSeed'

/**
 * The review section of the runtime config, read fresh enough that turning the
 * door off is a config change rather than a deploy. A store that is briefly
 * unreachable leaves the cached value in place (see getRuntimeConfig).
 */
export async function readReviewConfig(): Promise<ReviewAccountConfig> {
  const config = await getRuntimeConfig({ maxAgeMs: REVIEW_CONFIG_MAX_AGE_MS })
  return config.review
}

export type ReviewAccountResult =
  | { ok: true; user: IUser & { _id: unknown }; created: boolean }
  /** The address is in use by somebody who is NOT the demo account. */
  | { ok: false; reason: 'not_the_demo_account' }

/**
 * The demo account row for `email`, creating it the first time the review code
 * is used. Refuses — loudly, and without signing anybody in — when the address
 * already belongs to an ordinary member.
 */
export async function ensureReviewAccount(email: string): Promise<ReviewAccountResult> {
  await dbConnect()

  const existing = await User.findOne({ email })
  if (existing) {
    if (existing.isReviewAccount !== true) {
      console.error(
        '[review sign-in] review.email names an account that is not flagged as the demo '
          + 'account. Refusing. Point review.email at an address no member is using, or '
          + 'clear it: a review code must never open a member\'s account.',
      )
      return { ok: false, reason: 'not_the_demo_account' }
    }
    return { ok: true, user: existing as IUser & { _id: unknown }, created: false }
  }

  // Created with the flag in the same write as the row, so there is never an
  // instant where the demo account exists without the thing that identifies it.
  const created = await User.create({
    email,
    name: REVIEW_ACCOUNT_NAME,
    // Passwordless, exactly like every magic-link member: the string is a
    // placeholder that no login path compares against.
    password: 'review-account-no-password',
    ...reviewUserFields(),
  })

  return { ok: true, user: created as unknown as IUser & { _id: unknown }, created: true }
}
