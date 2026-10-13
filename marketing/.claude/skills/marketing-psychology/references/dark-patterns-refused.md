# Dark Patterns We Refuse

The list exists so nobody re-proposes these every quarter, and so a refusal comes with a reason
and a replacement rather than a shrug.

**The test:** a technique is legitimate if the user would still endorse it after we explained
exactly how it works. Say the explanation out loud. If it sounds like a confession, it is a dark
pattern.

Several of these are also illegal or actionable in some jurisdictions. That is a secondary reason.
The primary reason is that Become's premise is that the user was failed by scattered tools, not
that the user is a mark.

---

## The refused list

| Pattern | What it looks like | Why we refuse | What we do instead |
|---|---|---|---|
| **Confirmshaming** | A decline button reading "No thanks, I like being out of shape" | Shames the user for a reasonable choice, and points at the body | A neutral "Not now" of equal visual weight |
| **Fake scarcity** | "Only 3 spots left" for a product with no capacity limit | Fabrication. There is no limit | A real boundary: the actual start of the week or a real phase change |
| **Fake urgency** | A countdown to nothing, an "offer ends tonight" with no offer | Fabrication, and it resets every visit, which users notice | "Phase 1 starts Monday" |
| **Invented pricing pressure** | "Free while in beta," "normally $12" | No pricing exists. Any price statement other than "free today" is a lie | "Free today. No credit card." |
| **Roach motel** | Easy to enable notifications, hard to turn them off | Traps the user in a state they did not choose to keep | A visible opt-out in the same place as the opt-in |
| **Forced continuity** | A trial that silently converts to a charge | No billing exists, and this pattern would be a betrayal if it did | Nothing. Not applicable and never will be |
| **Pre-checked opt-ins** | Notification or email consent checked by default | Consent that was not given | Unchecked, with a plain sentence saying what they will get |
| **Guilt streaks** | "You broke your streak. Again." | Punishes a lapse, which is exactly when the user is most likely to leave | Streak repair, and "This week starts fresh" |
| **Public loss** | A leaderboard showing who fell off | Humiliation as a retention mechanic | Private progress. Compare a user only to their own last week |
| **Nagging** | Three escalating reminders about the same session | Converts a pull into an irritation and costs the channel permanently | One nudge, dismissible, decaying if ignored |
| **Fake progress** | A bar that fills for no reason | Fabricated feedback; users detect it and discount every real signal after | Progress computed from actions the user actually took |
| **Fabricated proof** | Invented testimonials, star ratings, "join thousands" | Fabrication, and it is the constraint we break most easily under pressure | Mechanism proof and coach credibility. See `references/honest-proof.md` |
| **Trick questions** | Double negatives in a consent checkbox | Manufactures consent through confusion | One clear sentence, one clear control |
| **Disguised ads** | A creator post amplified with no disclosure | Deception, and an FTC problem. See `ugc-creator-briefs` | Disclosure in the video and in the caption, preserved in the paid cut |
| **Hidden costs of attention** | A "quick check-in" that is nine screens | The user agreed to something smaller than what they got | State the length: "Three questions, about 30 seconds" |
| **Forced sharing to unlock** | Share to see your recap | Coerces an endorsement the user may not mean | Offer the share at a moment of earned pride, optional either way |
| **Data as leverage** | Withholding a user's own logged data to drive an action | Their data is theirs. Full stop | Their data is always visible |

---

## Grey areas, and how we resolve them

**Loss framing on streaks.** Loss aversion is real and the streak is real. The line is the tone
and the exit. A neutral statement of fact with a recoverable path is legitimate: "Your streak is
at 12. A session today keeps it going." A countdown, a red alarm, and "don't blow it" is not.

**Push permission prompts.** Asking is legitimate. Asking on first load, before any value, is
close to a dark pattern because the user has no basis to decide. Ask after the first earned win,
explain what they get, and accept "not now" without a penalty or a re-ask that day
(`push-notifications`).

**Endowed progress in onboarding.** Showing "2 of 5 set up" after the user answered two questions
is honest. Showing "2 of 5" before they have answered anything is fake progress.

**Comparison to other users.** Aggregate, anonymous, opt-in context can be motivating. Named
ranking is not. Become defaults to comparing a user to their own last week, which is both honest
and the more useful comparison.

**Reactivation email urgency.** "We miss you, your account will be deleted in 7 days" is only
acceptable if the account is genuinely being deleted in 7 days. It is not. So it is not acceptable.

**Painted-door tests.** Measuring demand for an unbuilt feature is legitimate when the follow
through is an honest "not available today." It is not legitimate with a fake checkout or an
invented price, which we cannot do anyway (`ab-testing`).

---

## When someone asks for "more urgency"

The request is usually genuine and the honest answer usually exists. Work down this list:

1. **Is there a real deadline?** A program phase starting, a cohort, a scheduled session today, a
   week ending tonight. Use it.
2. **Is there a real cost of waiting?** Another week without a record of what they lifted. Say it
   plainly, without doom.
3. **Is the ask small enough that urgency is unnecessary?** One email field and no card is a
   thirty-second decision. Reducing friction beats manufacturing pressure.
4. **If none of the above apply, the honest answer is that there is no urgency**, and the fix is a
   clearer value proposition, not a timer. Hand it to `landing-cro` or `offer-design`.

Never manufacture a deadline. The first visitor who reloads and sees the timer reset has learned
something permanent about how much we can be trusted.
