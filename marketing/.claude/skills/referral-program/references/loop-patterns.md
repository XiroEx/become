# Loop Patterns and Leak Diagnostics

## The six-stage loop

```
1 TRIGGER          The moment the member feels something worth telling someone
2 ARTIFACT         The thing that gets sent
3 CHANNEL          How it leaves the app (share sheet, DM, story, link paste)
4 RECIPIENT SEES   What a stranger encounters when they tap
5 ACTIVATION       Signup, and the first meaningful action
6 BACK TO TRIGGER  The new member reaches their own proud moment
```

A loop is only as strong as its worst stage. Multiply the stage rates and the arithmetic is
brutal: five stages at 50% each yields 3%. **Find the worst stage, fix only that one, re-measure.**

---

## Become's three candidate loops

### Loop A — The shared session or program (already built)

The infrastructure exists. `webapp/models/Share.ts` stores a public, read-only, self-contained
snapshot of a program, a workout, or a one-off session. `/share/<shareId>` serves it with no
auth. `webapp/lib/share.ts` mints the token and sanitizes the payload. `ownerName` powers a
"Shared by" line, `sourceProgramId` lets a signed-in recipient jump to the live program, and
`views` counts stage 4 for free.

| Stage | Surface | Leak risk | Fix |
|---|---|---|---|
| 1 Trigger | End of a logged session, or a generated program the member liked | **High.** No ask exists at the proud moment | Add the ask at session completion |
| 2 Artifact | The session snapshot | **High.** A 14-row exercise table is a document, not an artifact | Render a visual summary card as the preview, keep the full list below |
| 3 Channel | Native share sheet, link paste | Low | Preload share text |
| 4 Recipient | `/share/<shareId>`, auth-free | Moderate | Ensure it reads well cold, on a phone, both themes |
| 5 Activation | Magic link, then the program | **High.** Intent is lost if signup lands on a blank dashboard | Use `sourceProgramId` to resume intent |
| 6 Loop close | New member trains, then shares | Moderate | Only works if stage 1 is fixed for everyone |

**Verdict: the strongest loop, because most of it already exists.** The gaps are the ask at
stage 1, a legible artifact at stage 2, and intent preservation at stage 5.

### Loop B — The weekly recap

| Stage | Surface | Leak risk | Fix |
|---|---|---|---|
| 1 Trigger | Recap is ready, weekly | Low. Naturally recurring and naturally proud | Ask inside the recap |
| 2 Artifact | Rendered recap card | Moderate. Must be legible cold and suppress empty blocks | One hero number plus a line |
| 3 Channel | Story, DM | Low | Story-shaped 1080x1920 export |
| 4 Recipient | A page showing an anonymised or opt-in version | **High.** No such page exists yet | Build it, or point at the landing feature section |
| 5 Activation | Magic link | Moderate | |
| 6 Loop close | Weekly, once they have a week | Low | Strongest recurrence of the three |

**Verdict: the best recurring artifact, blocked on stage 4.** The recap references The Becoming;
keep that to one mention and do not let it become the campaign theme.

### Loop C — The PR moment

| Stage | Surface | Leak risk | Fix |
|---|---|---|---|
| 1 Trigger | A new PR is detected during logging | Low. Genuine, spontaneous pride | Offer the share right there |
| 2 Artifact | A single-set card: exercise, weight, reps, date | Low. Naturally legible and naturally flattering | |
| 3 Channel | Story, DM | Low | |
| 4 Recipient | Cold. A PR card means little to a stranger | **High** | Needs a "what is this" line and a real destination |
| 5 Activation | Magic link | Moderate | |
| 6 Loop close | Requires the new member to reach their own PR, which takes weeks | **High** | Slowest loop to close |

**Verdict: the most emotionally reliable trigger, the weakest close.** Good for reach and brand,
poor as a compounding loop.

---

## Leak diagnostics

Work the stages in order. Stop at the first stage under its floor.

| Stage | Metric | Denominator | Floor before it is the problem |
|---|---|---|---|
| 1 → 2 | Ask acceptance | Asks shown | Under 5% means the moment or the ask is wrong |
| 2 → 3 | Share completion | Share sheets opened | Under 50% means the artifact embarrassed them at the last second |
| 3 → 4 | Views per share | Shares created (`Share.views` gives this today) | Under 1.0 means links are being sent and not opened |
| 4 → 5 | Signup rate | Share page views | Under 5% means the recipient page is the leak |
| 5 → 6 | Activation | Signups from a share link | Compare against baseline signup activation. Below it means intent was lost at signup |

**Honest denominators matter.** "Our referral conversion is 40%" computed on shares that were
opened, ignoring the 80% of asks that were dismissed, is a number that will steer a bad decision.
Define these with `analytics-tracking` before quoting any of them.

**Sample size caution.** At current volume most of these rates will bounce around on tiny
denominators. Read them as directional, wait for the pattern to repeat, and see `ab-testing`
for the low-traffic playbook rather than declaring a winner from a good week.

---

## Loop shapes worth knowing

| Shape | How it works | Fit for Become |
|---|---|---|
| **Artifact loop** | The product makes something worth sending | **Best fit.** Recap, PR, session snapshot |
| **Collaboration loop** | You need someone else to use the product with you | Weak today. No multi-member training surface exists |
| **Incentive loop** | Both sides get something of value | **Unavailable.** No currency exists and none may be invented |
| **Word-of-mouth loop** | People talk because the product is unusual | Real. Whole-plate photo logging and a session generator that takes your actual equipment are genuinely surprising mechanics |
| **Content loop** | Public pages rank and attract strangers | Adjacent. `/share/<shareId>` pages are public and indexable. See `seo-geo` |

**The two to build are the artifact loop and the word-of-mouth loop.** Both are honest for a free
product. The incentive loop is closed to us and that is not a limitation to work around, it is a
constraint that produces better design.

**The content-loop note is worth a decision, not a default.** Share pages are public by design.
Whether they should be indexable is a real question: it is free long-tail surface area, and it is
also a stranger's snapshot appearing in search. Decide deliberately with `seo-geo` and default to
`noindex` until someone decides otherwise.

---

## Anti-patterns, refused

| Anti-pattern | Why it is out |
|---|---|
| Gate a feature behind an invite | Forced sharing. Refused. |
| Contact-list upload and bulk invite | Invasive, and it makes the sender look bad |
| Auto-post on the member's behalf | Never. The member composes their own message |
| Leaderboard exposing streak losses | Public shaming |
| A share that includes another member's data | Absolutely refused |
| Fake "N friends joined" counters | Fabricated proof |
| Asking after a missed day or broken streak | Kicking someone on a down beat |
| Credits, points, discounts, free months | Invented pricing for a product with no price |
| Dark-pattern decline copy | "No thanks, I'll train alone" is confirmshaming. See `marketing-psychology` |
