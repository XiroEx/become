# Filing Guide

How to add captures to the library without making `marketing/inspo-analysis.md` worse.

## Structure

```
marketing/inspo/                         # gitignored, local only
├── 2026-08-24-marketing-inspo/          # 30 images: STNDRD + Ladder
├── 2026-08-24-jon/                      # 8 in-app Become captures (not analysed)
├── 2026-08-24-george/                   # 1 site screenshot (not analysed)
└── YYYY-MM-DD-<slug>/                   # your new folder
marketing/inspo-analysis.md              # committed. THE artifact
```

Folder naming: `YYYY-MM-DD-<slug>`, date of capture (not of analysis), slug in kebab case naming the
source or the theme. Examples: `2026-09-02-hevy-story-ads`, `2026-09-14-fitbod-carousel`.

**`marketing/inspo/` is in `marketing/.gitignore`.** The images never leave the machine. That is
deliberate: competitor creative is a reference, and republishing it is not something we do. The
analysis file is the deliverable and is committed.

## Filing procedure

1. **Create the folder.** `mkdir -p marketing/inspo/YYYY-MM-DD-<slug>` and move the captures in.
   Keep original filenames; the index references them.
2. **Count and inventory.**
   ```bash
   timeout 60 bash -c 'ls -1 marketing/inspo/YYYY-MM-DD-<slug> | wc -l && ls -1 marketing/inspo/YYYY-MM-DD-<slug> | head -40'
   ```
3. **Look at every frame once.** Write a one-line description as you go. This is the only time the
   images get opened; make it count.
4. **Append index rows** to the "Per-image index" table in `marketing/inspo-analysis.md`.
5. **Update the source header** at the top of the file: folder, image count, captured date, analysed
   date, and any companion folders.
6. **Extend the synthesized pattern sections only where the new captures show something the file
   does not already name.** Restating an existing pattern makes the file longer and less useful.
7. **Add to "Steal this" or "Avoid this" only for a genuinely new, actionable item.**
8. **Re-read the whole file.** If it now contradicts itself, fix it. One coherent document beats an
   accurate append log.

## Index row format

The existing table:

```markdown
| # | File | Brand | Format | One-liner |
|---|---|---|---|---|
| 2 | IMG_7983 | STNDRD | Story — feature list | "**Workouts**" headline left, six `→` bullets ("on demand workouts ranging from 15–45 minute sessions"…), phone mockup bleeding off the right edge showing the Arnold Split program card. |
```

Rules for the one-liner:

- **Describe, do not evaluate.** Evaluation belongs in the synthesized sections.
- **Quote the actual copy** where it matters. Verbatim competitor headlines are what make the index
  searchable.
- **Name the layout** in the same vocabulary the pattern sections use: "phone bleeding off the right
  edge", "cut-out floating UI chip", "hand-drawn ellipse on the target control", "two-tone stacked
  headline".
- **Say when the frame is bad and why.** The existing index does this well: "Flattest, most skippable
  frame in the set", "Empty state leaked into an ad". A weak frame is as instructive as a strong one.
- Continue the numbering; do not restart per folder.

❌ `| 31 | IMG_9001 | Hevy | Story | A nice ad for their workout tracker. |`

✅ `| 31 | IMG_9001 | Hevy | Story — feature hero | "LOG IT IN 3 TAPS" in condensed all-caps over a dark ground, single phone centred showing the set-entry keypad; no bullets, no footer lockup. Strongest single-claim frame in their set. |`

## Format labels

Use the existing vocabulary so the table stays sortable by eye:

`Story — series cover`, `Story — feature list`, `Story — feature hero`, `Story — feature detail`,
`Story — how-to (step N)`, `Story — how-to cover`, `Story — how-to (payoff)`, `Story — closer / CTA`,
`Story — themed series post`, `Story — community`, `Story — community proof`,
`Story — gamification`, `Carousel cover (1/N)`, `Carousel N/M`, `Story — program hero`.

New labels are fine when the format is genuinely new. Reusing an existing label loosely is not.

## When a new brand joins

Add a row to the "What's actually in the library" table at the top: brand, image count and file
range, format, and one sentence on what the set is. Note anything about the capture method that
changes how the frames should be read, for example screen recordings carrying platform chrome.

Then ask the two questions the analysis already answers for STNDRD and Ladder:

1. **What is present?** Which of the six formats do they run, and in what mix?
2. **What is absent, and why does it matter?** The existing file's most useful paragraph is the one
   noting that neither brand uses memes, talking-head UGC, before-and-afters, testimonial cards, or
   pricing creative, and that both sell the mechanism rather than a promise.

Then add a "Fit / clash with Become" note: what aligns with our brand and constraints, and what
pulls against them. That section is what turns observation into a usable decision.

## Keeping the file readable

- Target under 250 lines. It is 134 today.
- If the per-image index passes about 80 rows, split it: keep the synthesized patterns in
  `inspo-analysis.md` and move the raw index to a companion file, with a pointer.
- Never paste an image into the analysis file. It is a text digest, and its value is that it can be
  read in two minutes without opening anything.
- Every pattern claim cites the frames that back it. A claim with no frame reference is an opinion.

## What never goes in

- Competitor imagery committed to the repo.
- A competitor price, member count, rating, or result restated as anything other than an observation
  about their creative.
- Any suggestion to trace, reuse, or composite their assets.
- Personal captures of real Become members or of the coach's camera roll.
