# Offer Patterns

Worked offer stacks per surface and audience state. All copy is draft and must pass the
literal-truth test before shipping. No pricing appears anywhere, because none exists.

---

## Cold, landing hero

The visitor arrived from a Reel or a search and knows nothing.

| Line | Copy |
|---|---|
| Promise | Your program, your meals, your mind, your numbers. One app. |
| First step | Enter your email and we send a link. Google and passkeys work too. |
| Time cost | Under a minute to your first plan. |
| Proof | Real screens: the dashboard, a session being generated, a plate itemized. |
| Reversal | No password, no card. |

**CTA options.**

| CTA | Rationale |
|---|---|
| `Get this week's plan` | Names the payoff, not the transaction. Best default. |
| `Start with your goal` | Sets up onboarding's first question, so the next screen feels expected. |
| `Get my first session` | Shortest time-to-value framing. Use when the traffic came from a training Reel. |

❌ `Sign up free` — describes the transaction, not the payoff, and leans on the price word.
❌ `Get started` — the most generic button on the internet.

---

## Warm, from a mechanic Reel

They watched a plate get itemized or a session get generated. Sell the thing they just saw.

| Line | Copy |
|---|---|
| Promise | The thing you just watched, on your next meal. |
| First step | Enter your email and the link lands in about a minute. Or use Google. |
| Time cost | Set it up tonight, use it tomorrow. |
| Proof | They already saw it work. Do not re-explain it, show the next screen. |
| Reversal | No password, no card. |

**Rule.** Ad-to-page match: the hook, the first line of the landing page, and the CTA must be the
same promise. If the Reel sold the plate itemizer, do not land them on a training hero. See
`paid-social` for the paid version of this rule.

---

## Hot, from Jon

He sent them. The credibility work is done; do not repeat it.

| Line | Copy |
|---|---|
| Promise | The programs Jon runs with his clients, on your phone. |
| First step | Enter your email. |
| Time cost | A minute. |
| Proof | Jon said so. That is the proof; the page just needs to not undermine it. |
| Reversal | No password, no card. |

**Rule.** Jon speaks in first person and the product speaks in second. A page fronted by his words
must not switch registers mid-block. See `coach-brand-voice`.

---

## Directory listing

Product Hunt, AlternativeTo, a PWA directory. The reader is comparison shopping and skims.

| Line | Copy |
|---|---|
| Promise | Coach-built training, nutrition, and mind practice in one app. Free today. |
| First step | Open it in a browser. Installs to your home screen. |
| Time cost | No download, no store. |
| Proof | Gallery of real captures, in the order that tells the story. |
| Reversal | Email link, Google, or a passkey. No password, no card. |

**Rules.** No ratings, no download counts, no pricing tier, and never the string "(beta)". Gallery
shots come from `webapp/public/screenshots/v2/` only. `web-app-listing` owns the field specs.

---

## Reel end card

Two seconds, one line, and the viewer's thumb is already moving.

| Option | Rationale |
|---|---|
| `become.redbtn.io` and nothing else | Highest completion. The URL is the CTA. |
| `Free today. One email.` | Kills the two objections in five words. |
| `Try it on your next session.` | Suggests the moment, which beats suggesting the action. |

❌ `Link in bio` — an extra step and a dated convention.
❌ `Sign up now!` — a demand with no payoff attached.

---

## Push notification

The user already has an account. The offer is not signup, it is the next action.

| Line | Copy |
|---|---|
| Promise | Today's session is ready. |
| First step | Tap. |
| Time cost | It opens straight to the workout. |
| Proof | Not needed. They are already in. |
| Reversal | Dismiss with no cost. |

**Rule.** Every push must be true at the moment it fires, must be dismissible without penalty, and
must never guilt. `push-notifications` owns the full nudge set.

---

## Share link, from an existing user

The recipient is cold but arrives with borrowed trust.

| Line | Copy |
|---|---|
| Promise | This is the week Sam just finished. Here is the app behind it. |
| First step | Enter your email. |
| Time cost | Under a minute. |
| Proof | The shared artifact itself. |
| Reversal | No password, no card. |

**Rules.** The invite must land on something better than the cold homepage. Never expose another
user's data in a share image without their action creating it. No forced sharing to unlock
anything. `referral-program` owns the loop.

---

## Anti-patterns, all surfaces

| Pattern | Why it is banned here |
|---|---|
| "Free trial" | There is no trial. Signup is not a trial. |
| "Free while in beta" | Implies a future price and puts "(beta)" in copy. |
| "Free forever" | We cannot promise it. |
| "No credit card required" | True but implies a card was coming, which anchors a price. |
| "Unlock premium features" | There is no premium tier for a gate to lead to. |
| "Limited spots" | A web app has no inventory and the reader knows it. |
| "Join 10,000 members" | Fabricated count. Banned outright. |
| "Lose 10 lbs in 8 weeks" | Promised result. Banned outright. |
| "Cancel anytime" | Implies a subscription exists. |

## The offer decision tree

1. Does this surface have exactly one ask? If not, cut until it does.
2. Is the ask the smallest true next step? If not, shrink it.
3. Can the reader picture the next sixty seconds? If not, add the time cost line.
4. Does the surface answer "no password, is that safe?" If not, add one clause.
5. Does it treat the emailed link as the only door? All three are live (`AuthForm.tsx`). Lead with
   email, mention the other two, never claim exclusivity.
5. Is any word aspirational rather than true today? Rewrite it as the true version.
