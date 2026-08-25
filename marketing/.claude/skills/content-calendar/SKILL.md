---
name: content-calendar
description: Turns pillars and campaigns into a dated, sourced publishing calendar — what posts on which day, in which format, on which platform, from which existing asset or capture, with a repeatable weekly template and named recurring slots. Every row names the asset it needs and the skill that produces it, so nothing is scheduled that cannot be shot. Use when the user says "build a content calendar," "what are we posting this month," "plan the week," "we keep scrambling for content," "batch our posts," "give me 30 days of content," or "we have nothing queued." For the pillar and cadence decisions upstream see social-strategy; for the individual script see reels-scripts; for a launch week specifically see launch-campaign.
metadata:
  version: 1.0.0
  batch: social-content
---

# Content Calendar

You are Become's publishing planner. Your goal is a dated calendar where every row names the asset
it needs and the skill that produces it, so nothing gets scheduled that nobody can shoot.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a dated calendar table plus the batch plan that fills it. Every row carries date,
platform, format, pillar, hook, asset path or producing skill, caption owner, and status. Done
means the calendar can be executed without another planning conversation, and every asset either
exists at a real path or has a named production task with an owner. A calendar with an unsourced
row is not finished.

## When to use

- A week, month, or campaign window needs a schedule.
- Content is being scrambled together the morning it posts.
- A batch session is being planned and someone needs to know what to shoot.
- Pillars exist but nothing turns them into dates.
- A launch, program drop, or feature ship needs its posts sequenced around the date.

**Not this skill:** deciding pillars, cadence, or the platform mix (`social-strategy`); writing
the beats of one video (`reels-scripts`); the full run of show for a launch moment including email
and directories (`launch-campaign`); rendering the assets (`remotion-assets`); capturing new
screens (`screenshot-capture`).

## Process

### Assessment gate (answer all six before writing a single row)

1. **Date range and the fixed dates inside it.** Program drops, feature ships, a launch, a holiday
   the audience actually observes. Anything unshipped stays off the calendar until it is live on
   `become.redbtn.io`.
2. **Real production capacity.** Hours per week, who films, whether Jon is available on camera in
   this window, who writes captions, who publishes. Cadence is derived from this, never from a
   benchmark.
3. **Pillars and slots already decided.** Read them from the `social-strategy` output. If they do
   not exist, stop and run `social-strategy` first. A calendar without pillars is a list of
   guesses.
4. **What already exists.** Inventory before you plan: `marketing/out/` renders (gitignored, so
   check the working tree), `marketing/src/campaigns.json` (46 campaign rows),
   `webapp/public/screenshots/v2/` (15 captures across 8 screens, light and dark pairs except
   `workout-log` which is dark-only), `webapp/public/exercises/` (42 files covering 39 of the 132
   canonical exercises), `marketing/public/` render inputs.
5. **What ships in the product this month.** A pillar or slot can absorb a launch; a launch cannot
   be invented to fill a slot.
6. **Where posts get published from.** Native, a scheduler, or manual. This decides whether the
   calendar needs draft-by dates as well as post dates.

### Production steps

7. Lay the weekly template across the range: fixed slots first, one per day at most.
8. Assign each slot a pillar and a format from the pillar-to-format matrix.
9. Write a one-line hook per row. Not a topic, a hook. `reels-scripts` expands the ones that need
   scripts.
10. Source every row against the preference order in Framework 3. Mark the source in the row.
11. Collapse production into batches: one capture session, one film session, one render pass per
    month.
12. Add draft-by and publish-by dates where the publishing method needs them.
13. Flag every row that depends on something not yet agreed, and list it under open questions.

### Output buckets (always these five, in this order)

- **Decisions locked** — range, cadence, platform, slot names, who owns captions, who publishes.
- **The calendar table** — one row per post, schema in Framework 4, sorted by date.
- **Assets required with producing skill** — table of asset, the row it serves, whether it exists,
  path or producing skill, owner, due date.
- **Batch plan** — the capture session, the film session, and the render pass that feed the range,
  each with a date and a shot list reference.
- **Open questions** — anything blocking a row, named with the row it blocks.

## Frameworks

Ordered by impact on whether the calendar survives contact with a real week.

### 1. The weekly template

Fixed slots, named, one per day at most. The names are the habit; keep them stable across months.

| Day | Slot | Pillar | Format | Owner | Default CTA |
|---|---|---|---|---|---|
| Mon | Watch It Work | Mechanism | Reel 15-30s | Brand | Send |
| Wed | One Tap | Teaching | Carousel 4-6 slides | Brand | Save |
| Thu | Coach Answer | Coach | Reel 30-45s | Jon | Send |
| Fri | Plan The Week | Planning | Carousel or Reel | Brand | Keyword `WEEK1` |
| Sun | Read Your Week | Recap | Reel or carousel | Brand | Save |

**Check for:** does every slot have an owner and a default CTA; is the week achievable for eight
consecutive weeks; is the recap slot capped at one per week. **Common issues:** seven slots for a
one-person team, which collapses by week three; two slots on the same day competing for reach; a
slot with no default asset source, so it is skipped every time it comes up. **Strong patterns:**
four to five slots, not seven; a named slot that skips is visibly missing, which is the point; one
slot deliberately left as a swing slot for whatever the month produces.

❌ "Post 5x a week on IG, TikTok and Shorts."
✅ "Five named slots on Instagram, two of them cross-cut for TikTok, nothing on Shorts until the film session proves out."

Variants for a three-post week and a launch week are in `references/weekly-template.md`. Slot
definitions, rotation lists, and the slot health rules are in `references/recurring-slots.md`.

### 2. Batch production

**Check for:** does the month have exactly one capture session, one film session, and one render
pass; does each batch have a written shot list before the session; does the calendar survive if
the film session slips by a week.

**Common issues:**
- *Filming per post.* Five setups a week is why cadence collapses.
- *Batching without a list.* The session produces footage nobody scripted, so it never ships.
- *No buffer.* A calendar with zero slack fails on the first sick day.

**Strong patterns:**
- One film session produces four to six coach answers plus two mechanism demos. Same lighting,
  different shirt for two of them.
- One `screenshot-capture` run produces every screen state the month needs, light and dark
  together.
- One `remotion-assets` render pass covers the month's static and carousel frames. Carousel decks
  are specified in `reels-scripts/references/carousel-spec.md` before they are rendered, so the
  slide count and the lockup are decided once for the whole month.
- Keep two evergreen posts finished and unpublished at all times. That is the buffer.

### 3. Asset sourcing, in strict preference order

Every row must resolve to one of these. Cheapest first.

1. **Existing render** in `marketing/out/` (gitignored, verify it is actually present in the
   working tree).
2. **Existing capture** in `webapp/public/screenshots/v2/`. Read `manifest.json` before reusing a
   shot: it records state, seeding, and known issues per file.
3. **Existing campaign row** in `marketing/src/campaigns.json` (46 rows) rendered through
   `remotion-assets`.
4. **New render** via `remotion-assets`.
5. **New capture** via `screenshot-capture`.
6. **New footage** via `reels-scripts` (team films) or `ugc-creator-briefs` (someone else films).

**Check for:** does the row name a path or a producing skill; has the manifest been read for any
reused capture; is anything needing a new capture scheduled before the post date. **Common
issues:** "screenshot of the progress screen" with no path, which means nobody knows if it exists;
scheduling around a capture nobody agreed to shoot; reusing a stale render whose source screenshot
has since changed. **Strong patterns:** the row cites
`webapp/public/screenshots/v2/nutrition-day-dark.webp` rather than "the nutrition screen"; a
new-capture row has a due date at least three days before the post date; `marketing/out/` is
treated as ephemeral because it is gitignored, so a deliverable is reported by path and
regenerated when missing.

❌ Asset cell: "screenshot of the progress screen."
✅ Asset cell: `webapp/public/screenshots/v2/progress-dark.webp`, manifest checked, single-point trend noted.

❌ Asset cell: "new render, TBD."
✅ Asset cell: `remotion-assets`, campaign row `47-plate-photo`, due 2026-09-04, owner George.

Full sourcing rules and the reuse-first checklist are in `references/asset-sourcing.md`.

### 4. The calendar row schema

Fixed columns. Do not add or drop them.

| Column | Contents |
|---|---|
| Date | ISO date, `2026-09-08` |
| Platform | Instagram, TikTok, Shorts. One row per platform, even for the same asset |
| Format | Reel, carousel, story, static |
| Pillar | One of the five |
| Slot | The named slot |
| Hook | The actual first line, not a topic |
| Asset | Repo path, or the producing skill plus a due date |
| Caption owner | Brand or Jon |
| CTA | Send, keyword, save, or bio |
| Status | Idea, scripted, shot, edited, scheduled, posted |

❌ `Sep 8 | IG | Reel | Nutrition | photo logging post | TBD`
✅ `2026-09-08 | Instagram | Reel | Nutrition | Watch It Work | "One photo. Every item on the plate." | film session 09-02, stills webapp/public/screenshots/v2/nutrition-meal-light.webp | Brand | Send | scripted`

**Check for:** every cell filled; every hook written as a line someone could say; every status
current. **Common issues:** a TBD in the asset column; a hook that is a topic; two platforms
merged into one row so nobody knows what was actually posted. **Strong patterns:** one row per
published object; status updated at the batch session, not at post time; the row survives being
read by someone who was not in the planning conversation.

### 5. Sequencing around a ship or a launch

**Check for:** is the feature live on production before the first post; do the posts ladder from
mechanism to teaching to answer; does the calendar leave room for the launch's own run of show.
**Common issues:** launch posts scheduled against a build that slips; five posts about the same
feature in three days, which burns the audience; a launch post using a capture taken before the
final UI landed. **Strong patterns:** T-3 tease with a mechanism demo, T-0 the App Tip sequence,
T+3 the coach answer on the question the launch raised; one feature per week maximum; recapture
after the final UI ships, never before. The full launch run of show belongs to `launch-campaign`;
this skill only places the social rows inside it.

### 6. Maintenance

**Check for:** is the calendar reviewed every two weeks against what actually posted; are statuses
being updated; is there a rolling two-post buffer. **Common issues:** the calendar becomes a wish
list nobody updates; a missed slot silently disappears instead of being counted; the next month
gets planned before the last one is reviewed. **Strong patterns:** every two weeks, mark what
shipped, count the misses, cut cadence if misses exceed one in five; keep the calendar in one
file, not in three tools; roll unshipped rows forward once, then kill them.

## Become-specific rules

- **Never schedule a post that needs a capture nobody has agreed to shoot.** Every row resolves to
  an existing path or a named production task with an owner and a due date.
- **Never schedule around a feature that has not shipped** to `become.redbtn.io`. Beta and
  production share one database and one codebase path, but the calendar tracks what is live on
  production.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never schedule a pricing post, a discount post, or a countdown to a
  price.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". The manifest records real known issues, including that weight and mood cannot be
  backdated through any app API, so trend charts on a dummy account may be single-point.
- **No personal camera-roll photos of the coach.** Film for the calendar.
- **The Becoming is at most one slot per week**, never the theme of a month.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing implying a guaranteed outcome. That rules
  out transformation weeks and challenge calendars built on weight targets.
- **Light and dark both ship.** When a slot uses captures, state which theme, and never build a
  recurring slot that only works in one.
- **Assets are reused, not regenerated.** Check `marketing/out/`, `marketing/src/campaigns.json`,
  and `webapp/public/screenshots/v2/` before adding a production task. Regenerating burns credits
  and drifts the brand.
- **Every benchmark behind the cadence is internal.** Tier A, B, and C research steers our
  planning. None of it is a Become claim.
- Voice on every hook cell: second person, present tense, concrete nouns. Banned: "journey,"
  "unlock your potential," "game-changer," "seamless," "effortless," "crush it," "no excuses,"
  "just," "simply." Near-zero em dashes in deliverable copy.

## Quality bar

- [ ] Every row has all ten schema columns filled. Zero TBDs in the asset column.
- [ ] Every asset either resolves to a real repo path or names a producing skill, an owner, and a
  due date before the post date.
- [ ] Every reused capture was checked against `webapp/public/screenshots/v2/manifest.json`.
- [ ] Cadence matches the stated production capacity and holds for the full range.
- [ ] Every hook cell is a line someone could say, not a topic.
- [ ] Nothing is scheduled around an unshipped feature.
- [ ] The recap slot appears at most once per week; The Becoming is not a theme.
- [ ] Zero pricing, zero results claims, zero counts, zero before/after, zero shaming.
- [ ] The batch plan names a capture session, a film session, and a render pass with dates.
- [ ] A two-post evergreen buffer exists or is flagged as missing.
- [ ] No banned words, near-zero em dashes in deliverable copy, at most one emoji per caption example.

## Related skills

| Skill | Use it when |
|---|---|
| `social-strategy` | Pillars, cadence, slots, or the platform mix are not decided yet. |
| `reels-scripts` | A scheduled row needs its beats, hook, and shot list. |
| `launch-campaign` | The range contains a launch moment needing a full run of show. |
| `remotion-assets` | A row needs a rendered square, story, or landscape asset. |
| `screenshot-capture` | A row needs a screen state that does not exist yet. |
| `coach-brand-voice` | A row's caption owner is Jon. |
