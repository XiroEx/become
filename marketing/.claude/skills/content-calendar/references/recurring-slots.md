# Recurring Slots

A named slot turns publishing inventory into an audience habit. The competitor library documents
this working ("Milestone Wednesday" in `marketing/inspo-analysis.md`); Become's version is
self-referential rather than competitive, because ranking-against-others energy pulls against
empowering-not-preachy.

Keep the names stable. Rotate the content inside them, never the names.

---

## The five slots

### Watch It Work

**Promise:** you will see the mechanism happen, on screen, in under 30 seconds.
**Pillar:** Mechanism. **Format:** Reel 15-30s. **CTA:** send.
**Rotation:** LIVE rep counting → plate photo → barcode scan → PR history on the set row → demo
video inside a logged set → back to the top with a new hook.
**Asset source:** film session. Reference stills: `workout-log-dark.webp`, `nutrition-meal-light.webp`.
**Fails when:** the mechanism is described instead of shown.

### One Tap

**Promise:** by the last slide you can do the thing yourself.
**Pillar:** Teaching. **Format:** carousel, 4-6 slides. **CTA:** save.
**Rotation:** log a set with PR history → generate a session for today's equipment → swap an
exercise → shoot a clean plate photo → read the week strip → set your training days.
**Asset source:** `webapp/public/screenshots/v2/` captures with one annotation per slide.
**Fails when:** two taps share a slide, or the annotation points at the wrong control.

### Coach Answer

**Promise:** a real question, answered with the reason behind the rule.
**Pillar:** Coach. **Format:** Reel 30-45s, Jon on camera. **CTA:** send, or a reply prompt.
**Rotation:** pulled from comments and DMs. Keep a running question list; never invent a question.
**Asset source:** monthly film session, four to six answers per session.
**Fails when:** Jon reads product copy, or a client story is invented to carry the answer.
**Hard line:** injury, medical, and pregnancy questions get the referral answer. See `coach-brand-voice`.

### Plan The Week

**Promise:** here is how a real week gets built.
**Pillar:** Planning. **Format:** carousel or Reel. **CTA:** keyword `WEEK1`.
**Rotation:** what week one contains → generating around real equipment → setting training days
around your life → what a phase change looks like → training around a trip.
**Asset source:** `workout-hub-*.webp`, `generate-*.webp`, plus `remotion-assets` frames.
**Fails when:** it shows a program that is not live in the app.

### Read Your Week

**Promise:** your week, written back to you.
**Pillar:** Recap. **Format:** Reel or carousel. **CTA:** save. **Cap: one per week, hard.**
**Rotation:** what the recap says after a good week → after a scrappy week → mood beside volume →
reading a strength trend without a scale → why a flat week is information.
**Asset source:** `progress-light.webp`, `progress-dark.webp`, `mind-*.webp`.
**Fails when:** a number implies an outcome, or the chart is empty. The manifest records that
weight and mood cannot be backdated through any app API, so a dummy account's trend may be a
single point. Check the capture before promising a chart.
**Hard line:** The Becoming is at most one mention here and never the theme of a month.

---

## Slot health

Review every two weeks. For each slot, record shipped, missed, median sends per reach, median
saves per reach.

| Signal | Action |
|---|---|
| Slot shipped every week, sends per reach in the top half | Leave it alone |
| Slot shipped, bottom quartile sends per reach for 4 weeks | Rebuild the hook shapes once, then drop the slot |
| Slot missed twice in a row | Cut the template by one slot; do not backfill |
| Slot consistently over-runs its production budget | Move it to fortnightly rather than dropping it |
| Slot generates comments that become Coach Answers | Protect it; it is feeding another slot |

---

## Adding or retiring a slot

**Add a slot only when:** the existing slots have shipped for eight consecutive weeks, capacity
is proven, and the new slot has a pillar, a format, an owner, and a repeatable asset source.

**Retire a slot by:** announcing nothing. Audiences notice absence, not explanations. Replace it
in the same day-of-week position so the rhythm survives.

**Never** run a slot that requires a capture nobody has agreed to shoot, a feature that is not
live, or a claim we cannot make. A slot with a structural constraint problem is not a content
problem; it is a scope problem, and it should be cut at planning time.
