# Onboarding Patterns

Become's onboarding is five steps at `/onboarding`: **Goals, Background, Body & nutrition,
Equipment, Review**. Read `webapp/app/onboarding/page.tsx` before proposing a change. It is a
substantial flow that already does several things right, and a generic "cut onboarding in half"
recommendation would break them.

## What the flow already does well

- **Targets are computed from real answers.** The nutrition step derives calories and macros from the
  user's own numbers rather than falling back to schema defaults that describe nobody. That is the
  reason the step exists and the reason it earns its place.
- **Plain-English options.** Activity levels are described by what the day looks like ("Desk job,
  mostly sitting, little walking") rather than by a multiplier. Experience levels carry a
  one-line definition. This is the right register.
- **An opt-out on a sensitive field.** Biological sex includes "Prefer not to say."
- **A visible step counter with a named step.** "Step 3 of 5 · Body & nutrition."
- **Progress is saved as answers change**, so a dropped connection does not cost the whole flow.

Preserve all five. The opportunities are in ordering, payoff visibility, and what happens at the end.

## The question economics test

Run every question through this. Three questions, and any "no" means the question is deferred or cut.

1. **Does the answer change what the app shows next?** Not eventually. Next.
2. **Could the app infer it, default it well, or ask it later at the moment it matters?**
3. **Is the cost of asking (taps, thinking, discomfort) smaller than the value of the answer?**

Applied to the current flow:

| Step | Question | Changes what next? | Verdict |
|---|---|---|---|
| 1 Goals | Primary goals | Program recommendations and nutrition direction | Keep, first |
| 2 Background | Experience level | Program difficulty and exercise selection | Keep |
| 2 Background | Training days per week | Schedule shape | Keep |
| 3 Body & nutrition | Height, weight, age, sex | Calorie and macro targets | Keep, needs framing |
| 3 Body & nutrition | Activity level | TDEE, so the targets | Keep |
| 3 Body & nutrition | Direction (lose, maintain, gain) | The calorie offset | Keep |
| 4 Equipment | Available equipment | Which exercises can appear | Keep, highest value per tap |
| 5 Review | Confirmation | Nothing, but it builds trust in the numbers | Keep if it shows the computed targets |

The current flow passes the test. That is unusual and worth stating in any audit, because the default
recommendation for a five-step onboarding is to shorten it, and here that would cost real
personalization.

## Where the opportunity actually is

### 1. Make the payoff visible on every step

The step counter says how far in you are. It does not say why you are still here.

```
❌ Step 3 of 5 · Body & nutrition
✅ Step 3 of 5 · Body & nutrition · Sets your calorie and macro targets
```

```
❌ Step 4 of 5 · Equipment
✅ Step 4 of 5 · Equipment · So no session asks for a machine you don't have
```

Cost: one line per step. This is the highest value change in the flow.

### 2. Frame the sensitive step before asking

Body stats are the highest-abandon question type in fitness onboarding, and the copy around them is
the most sensitive in the entire product.

```
❌ Enter your body stats to continue.
✅ These four numbers set your calorie and macro targets. Nothing is shared, and you can
   change them any time.
```

Rules for this step, non-negotiable:

- No language about how the body currently looks. Ever.
- No implied judgement of any number entered.
- No before/after framing, no target weight presented as a promise.
- Keep the "Prefer not to say" option and never make it feel like a lesser path.
- Both unit systems, with the user's choice remembered. A user forced into unfamiliar units is
  guessing, and the targets inherit the guess.

### 3. Show the computed result at the review step

Step 5 justifies steps 1 through 4. If it shows the calorie and macro targets, the training days, and
the equipment filter that came out of the answers, then the flow ends on evidence rather than on a
form submission.

```
✅ Your targets: 2,150 calories. 165g protein, 210g carbs, 70g fats.
   Four training days. Barbell, dumbbells, and cables only.
   [ Start day one ]
```

The final button matters. `Finish` ends a form. `Start day one` starts a plan.

### 4. End with something scheduled

The single largest determinant of day-2 return is whether anything is waiting. Onboarding should hand
off to a program enrollment or a first session, not to an undifferentiated dashboard.

```
❌ [ Finish ]  →  dashboard with every hub showing and no next action
✅ [ Start day one ]  →  the recommended program's first session, or the generate sheet
```

## Patterns worth adopting

| Pattern | What it is | Fit for Become |
|---|---|---|
| Progressive disclosure | Ask only what the next screen needs; ask the rest in context later | Strong. Anything affecting week four does not belong in step 1. |
| Payoff-per-step | Every step states what it changes | Strong. Cheapest win available. |
| Computed-result reveal | End on the numbers the answers produced | Strong. The flow already computes them. |
| Sensible defaults | Pre-fill the common answer, let the user change it | Medium. Never pre-fill body stats. |
| Skip with consequence stated | "Skip for now, you can set targets later" | Medium. Only where skipping genuinely works. |
| Back navigation | The current flow supports it | Keep. Removing it to protect completion is a dark pattern. |

## Patterns we refuse

| Anti-pattern | Why |
|---|---|
| Fake "calculating your personalized plan" delay with a progress animation | Manufactured effort. The user would not endorse it if we explained it. |
| Asking for an email a second time inside onboarding | They already gave it to get here. |
| A paywall or "upgrade" step | No pricing exists. There is nothing to gate. |
| Pre-checked notification or email opt-in | Consent has to be an action. |
| Disabling back navigation to protect completion rate | Roach motel. |
| A goal weight framed as a promise, or a projected date | Promised outcome and timeline. Out of bounds. |
| Any body-composition commentary on entered stats | Body-shaming, in the most private moment in the app. |
| Requiring the PWA install or notification permission to continue | Both are asked after an earned win, never as a gate. |

## Auditing a step

For each step, record:

1. **Question:** what is asked.
2. **Changes next:** what it alters on screen, specifically.
3. **Cost:** taps, thinking, discomfort.
4. **Framing:** does the copy say what the answer buys?
5. **Skippable:** yes or no, and what happens if skipped.
6. **Verdict:** keep, reframe, defer, cut.

Present the six columns as a table. That table is the deliverable for any onboarding audit, and it is
what makes "cut a step" a defensible recommendation rather than a reflex.

## Measuring it

Per-step completion is the only useful onboarding metric. Overall completion tells you there is a
problem; per-step tells you where. If per-step is not instrumented, that is the first recommendation,
handed to `analytics-tracking`.

Watch for a cliff at step 3, and read the drop against device type. A body-stats step that abandons
on mobile and completes on desktop is an input problem, not a trust problem.
