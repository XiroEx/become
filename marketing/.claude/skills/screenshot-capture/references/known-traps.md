# Known Capture Traps

Recorded from the run that produced the v2 set. Read the matching row before capturing that screen.
All of these are real and reproducible on production.

## Data traps

### Weight and mood cannot be backdated

`POST /api/weight` and `POST /api/mood` always stamp today, and the timezone offset is clamped to
+/- 14 hours. No app API can write a historical weight or mood row.

**Effect:** every trend chart on a freshly seeded account is a single point.
**Handling:** frame the shot to exclude the chart, and say so in `notes`. Do not fake it, do not
patch it in.

### Streaks cannot be pre-built

Streak length is derived from real consecutive days. A seeded account reads "Building 1/3".

**Handling:** either accept the honest number and let the copy talk about starting, or use an
account that has genuinely accumulated days. Never edit the number.

### Mind sessions are rate limited

Main mind sessions are gated to one per 20 hours, so a chapter cannot be advanced during a capture
session. Chapter 2 and later render as locked dashed cards at the bottom fold.

**Handling:** that is real progressive disclosure, not an empty state, and it is acceptable in
frame. Do not scroll so far that the locked cards dominate.

### `demo@jondonfit.com` renders as day one

Its history is roughly 615 days old, so `/api/progress` returns empty arrays.

**Handling:** use `playwright-test-mobile1@become.test`.

## Rendering traps

### Weekly Volume bars are invisible in dark mode

`webapp/app/dashboard/progress/ProgressClient.tsx:560` hardcodes `fill="#18181b"` on the
`<Bar>` with no dark variant. On the dark card background the bars vanish and the chart reads as an
empty axis even with six weeks of real data. **This is a live production bug.**

**Handling used:** the rendered bar rects were recoloured to `#e4e4e7` in the DOM at capture time,
disclosed in `knownIssues`. **Better handling:** fix the component. A one-line dark variant removes
the need to patch anything ever again.

### `.mov` exercise demos fail in Chromium

`webapp/components/FramedVideo.tsx:39` (`mimeForVideoUrl`) emits `<source type="video/quicktime">`
for a `.mov` src. Chromium and Firefox refuse it (`canPlayType('video/quicktime') === ''`), so the
demo panel renders black on desktop Chrome and Android while working on iOS Safari. The same files
are served with `Content-Type: video/mp4` and play fine when the type attribute is omitted.

**Handling used:** the source URL was assigned to `video.src` directly for `workout-log-dark`, so
the demo renders as it does on iOS. **Do not reach for an `.mp4` twin:** `webapp/public/exercises/`
holds 42 files covering 39 of the 132 exercises, and only `back-squat`, `bench-press`, and
`cable-row` have an `.mp4`. The real fix is the type attribute in `FramedVideo.tsx`, which is an
app bug and not a capture problem.

### Generate sheet range slider stays white in dark mode

The `<input type="range">` unfilled track keeps its light-mode colour, making it the brightest
element on a dark sheet. Cosmetic only. Captured as-is in `generate-dark`, recorded in
`knownIssues`.

**Handling:** acceptable in frame, but do not make it the focal point of a crop.

## Navigation traps

### Auto-rotating carousels break twin matching

The Mind hub "Suggested Next" carousel advances on a timer. Between the light and dark runs it had
moved, and had to be clicked back to slide 2 ("Self-Image, Kill the Old Version") to match.

**Handling:** identify every carousel on the screen, click it to a known slide, and note the slide
in `notes`.

### `/dashboard/workout/hub` is not the training hub

`/dashboard/workout` is the Workouts / Programs / Generate hub with the week strip and the Continue
Training card. `/dashboard/workout/hub` is a different My Workout and custom exercises screen and is
empty on the capture account.

**Handling:** capture `/dashboard/workout`.

### `/dashboard/progress` has no weight chart

It is the Training Log: workout count, all-time volume, weekly volume bars, workout history,
personal records. The weight, BMI, and mood trend chart lives on `/dashboard`, below the fold.

**Handling:** do not promise a weight chart from the progress route.

### The meal list sits below the fold

On `/dashboard/nutrition` the itemized meals are below the ring, so a scrolled shot loses the app
header. That is expected; the existing `nutrition-meal-*` shots record it in `notes`.

### First-run overlays remount after navigation

`.rtut-shield` coach marks can mount again after a route change. `dismissTutorials(page)` must be
called after **every** navigation, not once at the start. `PUT /api/tutorial-progress` on the
account beforehand reduces, but does not eliminate, the problem.

### Daily check-in modal

`authenticate()` clicks "Skip for Today" and then "Continue Anyway" if present. If a new modal
variant ships, the capture will show it. Check the first frame of every run.

## Timing traps

### `waitForAppScreen` waits for text, not for motion

It resolves once the body has at least 120 characters plus a 400ms settle. Framer Motion enters,
count-up numbers, and gradient blobs may still be moving.

**Handling:** add `await page.waitForTimeout(900)` before `page.screenshot`, and check the frame for
half-faded elements.

### The 20 minute twin window

The v2 dark twins were captured about 20 minutes after the light ones, same calendar day, so no
re-seeding was needed. Cross a midnight boundary and the nutrition day resets and the twins diverge.

**Handling:** capture both themes in one sitting. If a session drags near local midnight, stop and
resume the next day with a fresh seed.
