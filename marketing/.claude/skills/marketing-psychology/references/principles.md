# Principles, Ranked by Fit for Become

Nine principles, each with the source, the tier, the Become surface it applies to, and the honest
version. **All source tiers are internal-only. No effect size here may ever be restated as
something Become produces.**

Ranked by how much of Become's actual behaviour problem each one addresses.

---

## 1. Identity and self-signalling

**Source:** self-perception theory (Bem) and the identity-based habit framing popularized in
practitioner writing. Tier A for the underlying theory, Tier C for the popular framing.

**Why it ranks first for Become:** the product already generates evidence about the user. Weight,
mood, sessions, PRs, and a weekly recap that writes the week back to them. Most apps have to
manufacture identity feedback; Become computes it.

**Surfaces:** the weekly recap, the progress hub, push copy after a completed session, landing
copy about what the last month looked like.

**Honest version:** state the behaviour, let the user draw the conclusion.
✅ "Four sessions in eight days. That is what the last week looked like."
❌ "You're becoming an athlete!" (a claim about them, not evidence)

**Failure mode:** praise inflation. If every screen says "amazing," none of them mean anything.

---

## 2. Endowed progress and the goal gradient

**Source:** Nunes and Drèze (2006), loyalty-card field study: a 12-slot card pre-stamped with two
completed at a materially higher rate than an 8-slot card from zero, for identical real effort.
Goal-gradient effects have broad experimental support. Tier A.

**Surfaces:** onboarding, the program phase view, the schedule, any first-run screen.

**Honest version:** count things the user actually did. Onboarding answers are progress. A phase
is a closeable distance where a 12-week program is a wall.
✅ "Phase 1, day 2 of 8."
❌ A progress bar that starts at 20% for no reason.

**Failure mode:** the empty first screen. An account with every tile at zero is the opposite of
endowed progress, and it is Become's most likely activation cliff. See `signup-activation`.

---

## 3. Loss aversion, applied to streaks

**Source:** Kahneman and Tversky, prospect theory. Tier A. Streak mechanics in consumer apps are
widely reported to raise retention (Tier B and C, vendor-published, uncorroborated).

**Surfaces:** the streak tile, streak-at-risk push, the recap.

**Honest version:** the streak is a fact the user owns, and it is repairable. `UserProgress`
already carries `streakDays`, `longestStreak`, `streakFreezes`, and `milestonesReached`.
✅ "Your streak is at 12. A session today keeps it going."
❌ "Don't lose your 12-day streak!" with a countdown.

**Failure modes:**
- Anxiety design. Loss framing plus a timer plus a red colour is a stress machine.
- All-or-nothing resets that make a lapsed user delete the app rather than face the zero.
- Optimizing for streaks. It produces junk logging, which corrupts the data the recap depends on.

**Never:** point loss aversion at the body. "You'll lose your progress" about weight is a health
claim and a shaming move.

---

## 4. Implementation intentions

**Source:** Gollwitzer, if-then planning. Meta-analytic support for a substantial effect on
follow-through versus intention alone. Tier A.

**Surfaces:** onboarding ("which days do you train?"), the schedule, the first push.

**Honest version:** the plan gets written down where the user will see it, and the product acts on
it. Become's `Schedule` model stores `trainingDays` and generates `scheduledWorkouts`, so the
if-then is not a slogan, it is a data structure.
✅ "Which days can you train? We will fill the schedule and name each session."
❌ "Commit to your goals!"

**Failure mode:** asking for a plan and then ignoring it. Every onboarding question must change
what the app shows next or be cut.

---

## 5. Fresh start effect

**Source:** Dai, Milkman, Riis (2014), temporal landmarks and aspirational behaviour. Tier A.

**Surfaces:** the weekly boundary, program phase changes, January, the start of a month.

**Honest version:** use real landmarks, of which Become has several genuine ones. A phase change
is a real event in the data.
✅ "Phase 1 starts Monday. Set your days now."
❌ A manufactured "cohort starts in 4 hours" countdown.

**Marketing implication:** January is the category's largest moment. That is a publishing
deadline, not a persuasion technique. See `seo-geo` and `marketing-plan`.

**Failure mode:** treating every day as a fresh start dilutes all of them. A landmark that
happens daily is not a landmark.

---

## 6. Zeigarnik and the unfinished week

**Source:** Zeigarnik, incomplete tasks remain more cognitively available. Tier A for the classic
effect, with mixed replication strength; treat it as a design heuristic, not a law.

**Surfaces:** the "This Week 1/4" tile, the schedule strip, a single push.

**Honest version:** one visible unfinished thing, stated neutrally.
✅ "This week: 1 of 3."
❌ Three reminders about the same unfinished session, escalating in tone.

**Failure mode:** the pull becomes a nag at the second reminder and a reason to disable
notifications at the third. Frequency caps live in `push-notifications`.

---

## 7. Social proof without numbers

**Source:** Cialdini. Tier A for the principle. **Inapplicable in its usual form here**, because
we have no counts, ratings, or testimonials and may not invent any.

**What survives:** proof of mechanism, proof of coach, proof by specificity. Full inventory in
`references/honest-proof.md`.

**Honest version:**
✅ "Watch the camera count the reps." (a claim the reader can verify in 30 seconds)
❌ "Join thousands of members." (we have no such figure and would not publish it)

**Failure mode:** substituting vagueness for the missing number. "Loved by many" is worse than
saying nothing.

---

## 8. Defaults and friction

**Source:** Thaler and Sunstein, choice architecture; default effects are among the most robustly
replicated findings in behavioural science. Tier A.

**Surfaces:** signup (one email field), onboarding defaults, notification opt-in, dashboard tile
defaults.

**Honest version:** defaults are set to the choice most users would make for themselves, and
every default is reversible in one tap.
✅ A sensible default training-day set the user can change immediately.
❌ Pre-checked notification opt-in. That is a dark pattern; see
`references/dark-patterns-refused.md`.

**Become's real advantage:** magic-link signup is a genuine friction win. One field, no password
to invent, no card. Say it on the page rather than assuming visitors infer it (`offer-design`).

---

## 9. Peak-end rule

**Source:** Kahneman and colleagues. Experiences are remembered by their peak and their ending.
Tier A.

**Surfaces:** the end of a logged session, the weekly recap, the end of a program phase.

**Honest version:** design the ending deliberately. The last screen after a session is the natural
peak: the PR, the volume compared to last week, the week strip updating.

That ending is also the only good moment to ask for something: a share (`referral-program`) or
notification permission (`push-notifications`). Asking at a low point is both less effective and
more annoying.

✅ "Session done. 14 sets, 2 more than last Tuesday. New PR on the lat pulldown."
❌ Dumping the user back to a list with a toast that says "Saved."

**Failure mode:** a permission prompt attached to the peak so aggressively that the peak becomes
the ask. One ask, dismissible, no penalty for "not now."

---

## How to choose among them

1. Diagnose the barrier with B = MAP first. Motivation problems are rarer than they look.
2. If the barrier is **ability**: defaults and friction (8), endowed progress (2).
3. If the barrier is **trigger**: implementation intentions (4), fresh start (5), Zeigarnik (6).
4. If the barrier is **motivation**: identity (1), peak-end (9), proof (7).
5. Streaks (3) amplify whatever is already there. They are never the first fix, and they carry the
   highest risk of harm.
