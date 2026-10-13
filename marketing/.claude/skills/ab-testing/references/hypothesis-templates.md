# Hypothesis and Write-up Templates

Fill these in. Do not paraphrase them. The value is that every experiment reads the same way and
can be compared six months later.

---

## 1. Hypothesis

> Because **[evidence, with a number and a source]**, we believe **[specific change]** will cause
> **[primary metric]** to **[increase or decrease]** for **[segment]**, measured by
> **[event name]**. We are wrong if **[guardrail metric]** moves against us by more than
> **[threshold]**.

Worked examples. **Every number in them is
[ILLUSTRATIVE — no analytics exists yet; replace with measured numbers].** They demonstrate the
sentence shape, not our funnel. A hypothesis that reuses one of these figures as if it were
measured is worse than no hypothesis, because it launders a guess into an evidence clause.

**Landing hero**
> Because 62% of mobile visitors never scroll past the hero (`page_viewed` plus scroll depth,
> last 4 weeks, N = 1,410), we believe naming the mechanism in the H1 ("Point your camera at
> lunch. Get the plate itemized.") will increase signup_started per mobile visitor, measured by
> `signup_started`. We are wrong if the bounce rate on `/` rises by more than 5 points.

**Magic-link email subject**
> Because 34% of `magic_link_sent` events have no matching `magic_link_clicked` within 24 hours
> (last 4 weeks, N = 260), we believe a subject that names the action ("Your sign-in link for
> Become") will increase click-through, measured by `magic_link_clicked` within 60 minutes. We
> are wrong if spam complaints rise at all.

**Push nudge**
> Because 41% of users with a scheduled session on a given day do not log it (`Schedule`
> statuses, last 4 weeks), we believe a same-morning reminder naming the session will increase
> `workout_logged` on scheduled days for users with push enabled. We are wrong if the push
> opt-out rate rises above 2% weekly.

Rules:
- One change per variant. If you must bundle, say so and accept that a null result is
  uninterpretable.
- The segment is explicit. "Everyone" is a segment only if you mean it.
- The guardrail has a numeric threshold agreed in advance.

---

## 2. Test design block

```
Test name:            202609_hero_mechanism
Owner:
Surface:              webapp/app/page.tsx (hero, webapp/components/landing/HeroLine.tsx)
Variants:             A = current hero (control), B = mechanism-first H1
Allocation:           50 / 50
Unit of randomization: first-party anon_id cookie, assigned in middleware, sticky 30 days
Exposure event:       experiment_viewed { test: "...", variant: "A" | "B" }
Primary metric:       signup_started per exposed visitor
Guardrails:           bounce rate, account_created per exposed visitor, page LCP
Segment (pre-declared): mobile (viewport < 768px)
Channel isolation:    production only; beta excluded by channel property
Planned run:          4 whole weeks, Mon to Sun
Stopping rule:        fixed horizon, no interim reads
```

---

## 3. Sizing block

Numbers below are [ILLUSTRATIVE — no analytics exists yet; replace with measured numbers]. The
arithmetic is the part to copy.

```
Baseline (p):           3.9% signup_started per visitor, last 4 weeks, N = 1,410
Weekly volume:          ~350 visitors
Minimum detectable:     +30% relative (3.9% -> 5.1%)
n per arm  = 16 * (1 - p) / (p * r^2)
           = 16 * 0.961 / (0.039 * 0.09)
           = 15.4 / 0.00351
           ~ 4,380 per arm
Total needed:           8,760
Weeks at current volume: 8,760 / 350 = 25 weeks
VERDICT: SKIP the split. Ship B on reasoning, measure with a 4-week pre/post window and
         treat the result as directional, not causal.
```

Always convert to weeks. Weeks are what people react to.

---

## 4. Decision rule, agreed before data

Write one of these sentences, literally, before the test starts:

- "If B beats A on `signup_started` with the interval excluding zero, we ship B. Otherwise we keep
  A and move the budget to the next backlog item."
- "If the result is not resolvable at the planned horizon, we ship the version the team judges
  better on reasoning and record that no causal claim was made."
- "If any guardrail regresses past its threshold, we stop and revert regardless of the primary
  metric."

A test without this sentence will be rationalized after the fact. Every time.

---

## 5. Result write-up

Also [ILLUSTRATIVE — no analytics exists yet; replace with measured numbers]. Copy the structure
and the call, not the figures.

```
Test:          202609_hero_mechanism
Ran:           2026-09-02 to 2026-09-29 (4 whole weeks)
Exposed:       A = 1,402   B = 1,388     (SRM check: 50.3 / 49.7, OK)

Primary metric: signup_started per exposed visitor
  A: 3.8%  (53 / 1,402)
  B: 4.9%  (68 / 1,388)
  Relative:  +29%
  Interval:  roughly -8% to +80% relative
  Readable:  NO. The interval spans zero.

Guardrails:
  bounce           A 71%   B 69%    no regression
  account_created  A 2.9%  B 3.4%   no regression
  LCP              A 1.9s  B 1.9s   unchanged

Pre-declared segment (mobile): same direction, smaller N, also unresolvable.

Call: Ship B. Not because the test proved it, but because B is directionally positive,
      regresses nothing, and is better reasoned. Recorded as a non-causal ship.

What we learned about the visitor:
  Naming the mechanism did not hurt clarity or speed. The lever is probably not the H1 wording.
  Next test should be a bigger swing: the first screen's proof element, not its sentence.

Next action: 202610_hero_proof_capture, owner: ...
```

Rules for the write-up:
- Report guardrails **before** the primary metric, so nobody reads the win and stops.
- "Not readable" is a legitimate and common result. Say it plainly.
- Always end with what you learned about the visitor and what it changes in the backlog.
- Never publish an internal lift externally. It is not a Become claim.

---

## 6. Backlog row

```
| Idea | Surface | Evidence | Expected value (1-5) | Confidence (1-5) | Effort (1-5) | Score | Type | Owner |
```

`Score = value × confidence ÷ effort`. Type is `test`, `ship-and-watch`, or `research`. Sort by
score, cap the list at 15 rows, delete rather than defer.

Most rows at Become's volume will be `ship-and-watch`. That is correct, not a failure of ambition.
