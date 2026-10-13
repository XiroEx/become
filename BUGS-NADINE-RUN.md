# Bug list — Nadine persona run (2026-08-06)

Found by running a real persona through the product: **Nadine, 36F, out of shape,
busy, smart, no nutrition background, recently into cardio, wants to change.**

Where each was observed:

- **PROD** — `nadine@redbtn.io` (`6a73f4b9b1d73f4a3f8d5a70`) on become.redbtn.io,
  real onboarding + day 1.
- **LOCAL** — the same code on a scratch DB with 13 days of seeded history, used
  for the longitudinal surfaces (prod's admin bootstrap is disabled, so the Mind
  daily-reset loop isn't reachable there).

Screenshots and step-by-step notes: `webapp/tests/e2e/screenshots/nadine/`.

---

## Status — re-checked 2026-08-06 against production (`741cce6`)

| # | Item | Status |
|---|---|---|
| 1 | Mindset + Chat invisible to real members | **OPEN — business decision** |
| 2 | Negative progress % on The Becoming | **FIXED** (#805/#806) |
| 3 | Macro preset does not deliver its advertised split | **FIXED** (#801–#804) |
| 4 | "Lose Weight — TDEE − 500" label is wrong | **FIXED** (#805/#806) |
| 5 | Recommends a program, never enrols her | **FIXED** (#805/#806) |
| 6 | Dashboard tiles/layout 500 on unrelated bad history | **FIXED** (#805/#806) |
| 7 | 178 g protein impractical for a beginner | **FIXED** (#801–#806) |

All seven are closed except #1, which is a launch decision rather than a defect.

**The retroactivity gap is closed too.** `NutritionGoal` now carries
`macroPreset` + `calcVersion`; a row from an older version of the macro maths is
recomputed on the next read, so members who onboarded before the fix get correct
targets without a migration. Hand-typed numbers (`macroPreset: 'custom'`) are
never touched, and a member with incomplete body stats keeps what they had.

---

---

## P1 — Mindset and Chat are invisible to every real member

**Where:** `webapp/components/FeatureGuard.tsx:28`
**Observed:** PROD

`FeatureGuard` allows `role === "admin"` and blocks everyone else, so a genuine
signup sees a lock and *"Mindset coaching is coming soon."* Chat is gated the
same way (`app/dashboard/chat/page.tsx:471`).

The inconsistency, not just the gate: the dashboard still renders a **Mindset
card** ("Daily Reflection — Track your mental wellness journey" + an *Explore
Mindset* button) and the bottom nav still has a **Mind tab**. Both walk the
member into the locked wall with no explanation.

**Decide:** ship it, or stop advertising it from the dashboard and nav.

---

## P1 — Negative progress percentage on The Becoming

**Where:** `webapp/lib/mindXP.ts:92` (computed) → `app/dashboard/mind/becoming/BecomingClient.tsx:213` (rendered)
**Observed:** LOCAL, confirmed by direct computation

```ts
const pct = Math.min(100, Math.round((inChapterXp / inChapterNeeded) * 100))
return { needed: inChapterNeeded, current: Math.max(0, inChapterXp), pct }
```

`pct` is clamped at the top but not the bottom — while `current`, on the very
next line, *is* floor-clamped. Someone already knew this could go negative.

It is reachable by a brand-new member. The Mind intake maps two of its four
options to a higher chapter with zero XP (`startingChapterForPoint`):

| Intake choice | Chapter | Renders as |
|---|---|---|
| "I feel lost" | 1 | 0% |
| "I know what I want but I'm stuck" | 1 | 0% |
| **"I'm building momentum"** | 2 | **−50%** |
| **"I'm ready to go to the next level"** | 3 | **−100%** |

The two most confident members get the most broken screen.

**Fix:** clamp the bottom — `Math.max(0, Math.min(100, …))`. One line. Worth a
test, since the same off-by-a-clamp already got fixed for `current`.

---

## ~~P2 — The macro preset does not deliver the split it advertises~~ — FIXED

Shipped in #801/#802 (percentages became authoritative; the hard 250 g protein
ceiling is gone) and #803/#804 (the computed split is now called **Custom**, the
"recommended" badge moves by goal AND experience, and beginners are pointed at
Balanced).

Re-verified for Nadine under `741cce6` — label now equals delivered, every time:

| Option | Label | Delivered |
|---|---|---|
| Custom | 40/30/30 | 40/30/30 — 165 g P |
| Balanced | 30/40/30 | 30/40/30 — 124 g P |
| High Protein | 40/30/30 | 40/30/30 — 165 g P |
| Lower Carb | 35/25/40 | 35/25/40 — 144 g P |

As a beginner she is now badged **"Start here" on Balanced** (124 g P), not
pushed at the 165 g Custom split.

Original writeup below, for reference.

## P2 — The "Recommended" macro preset does not deliver the split it advertises

**Where:** label from `lib/nutrition/tdee.ts:203` (`RECOMMENDED_SPLITS.lose = 35/35/30`);
overridden at `lib/nutrition/tdee.ts:295-297` (protein floor)
**Observed:** PROD

The onboarding card reads **"Recommended — Tuned to your goal — the safe default
— 35/35/30"**. Nadine picked it and got:

| | Grams | Calories | Actual % |
|---|---|---|---|
| Protein | 178 g | 712 | **43%** |
| Carbs | 126 g | 504 | **31%** |
| Fats | 48 g | 432 | **26%** |

The `proteinFloor` (1.0 g/lb for her direction) overrides `proteinFromSplit`, and
the label is never recomputed. The member picks a ratio and silently receives a
different one.

**Fix:** derive the displayed ratio from the *computed* targets, or show the
floor explicitly ("35/35/30, adjusted to a 178g protein minimum").

---

## P2 — The "Lose Weight" card promises TDEE − 500 and delivers less

**Where:** `webapp/app/onboarding/page.tsx:127` (`sub: 'TDEE − 500'`)
**Observed:** PROD

Nadine's TDEE is 2060. She got **1648**, i.e. **−412**, because the 20% max-deficit
guardrail correctly kicked in. The guardrail is right; the label is wrong, and it
is the number she'll check the app against.

**Fix:** make the sub-label reflect the applied adjustment, or caveat it.

---

## P2 — Onboarding recommends a program and never enrols her

**Where:** onboarding step 1 → dashboard
**Observed:** PROD

Step 1 showed *"RECOMMENDED FOR YOU — BECOME — 12 Week Fat-Loss Foundation
Program — 12 weeks · 4 days/week · Built around your primary goal: Lose Weight"*.
Finished onboarding, and the dashboard says **"No program yet — Browse programs
and enroll when you're ready."**

The highest-intent moment in the funnel ends in a shrug. There is a "Skip for
now" but no path that actually enrols her from the recommendation.

---

## P3 — Dashboard read endpoints 500 on a validation error in unrelated history

**Where:** `/api/dashboard/tiles`, `/api/dashboard/layout`
**Observed:** LOCAL

Both returned 500 and the whole stat-tile row disappeared — no streak, no mood, no
weekly count, no calories.

**The trigger was my own malformed seed row** (a `workoutLogs[].exercises[].sets[]`
missing the required `setNumber`), so this is *not* a confirmed live bug. The
failure mode is real though: these are **read** paths that perform a full-document
`.save()`, so any single legacy subdocument that fails schema validation takes the
entire dashboard down. Worth hardening regardless of whether prod has such rows.

---

## Judgement calls — not bugs, but worth revisiting

**178 g of protein is not a realistic instruction for this member.** It is 43% of
her calories, and she told the app she is a beginner with no nutrition knowledge.
Consider capping protein as a share of calories, not only per pound.

**Nothing ever asked what she enjoys.** She picked Beginner + Dumbbells; she is a
cardio person. The one place the app noticed was excellent — after 13 days of
treadmill-heavy logs the dashboard surfaced *"Bring legs back in — your recent
logs do not show much legs work."* That should fire in week one, not only once
enough data accumulates.

**"Day Streak 1" before doing anything.** She had only typed her weight into
onboarding.

---

## Retracted

**Height inputs mislabelled.** I reported that both the feet and inches fields
read "ft". They do not — `app/onboarding/page.tsx:1021` renders `ft` and `:1028`
renders `in`, correctly. That was a false positive from my probe script reading
the wrong DOM parent, not a product defect.

---

## Not covered by this run

Mind sessions 2–14 individually. Production has no reachable admin bootstrap
(`/api/admin/e2e-admin-setup` → 401), so the daily-reset loop could not run there;
the local run reached the Mind hub and intake but WSL crashed mid-loop. The Mind
**surfaces** (hub, chapter/level, session card, intake) were observed; the
**content** of repeated sessions was not.
