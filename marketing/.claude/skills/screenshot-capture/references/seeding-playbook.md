# Seeding Playbook

How to give a dummy account a state worth photographing, using only the app's own HTTP APIs.

## The one rule

**Every write goes through an app endpoint with a `Bearer` token.** No direct MongoDB writes, ever.
Direct writes skip Mongoose validation and produce states the product cannot actually reach, which
is how a screenshot ends up showing something that does not exist. The v2 manifest records this
explicitly: `"all writes went through the app's own HTTP APIs"`.

## Accounts

| Account | Who | State | Use for captures |
|---|---|---|---|
| `playwright-test-mobile1@become.test` | Alex Rivera | 11 workout logs on Strength & Size 2.0, ~50% through phase 1, a full nutrition day, mood and weight logged today, one mind session, schedule Mon/Tue/Thu/Fri | **Yes.** Every v2 shot used it |
| `e2etest@become.io` | E2E user | Reset freely by fixtures; state is whatever the last test left | Exploratory walks, not final captures |
| `demo@jondonfit.com` | Jordan Blake | History ~615 days old, so `/api/progress` returns empty arrays and every screen renders day-one | **No.** Documented as unusable |
| Anything else | A real member | Real health data | **Never** |

## The write set (verbatim from the last successful run)

Every call takes `Authorization: Bearer <token>` and `Content-Type: application/json`.

| Goal on screen | Call |
|---|---|
| Training history, volume chart, workout list | `POST /api/progress` with `{type:'workout', ...}` for backdated sessions |
| A completed session with sets and PR badge | `POST /api/workouts` |
| Weight tile and "holding at N lbs" line | `POST /api/weight` |
| Mood tile | `POST /api/mood` |
| Calorie ring, macro bars, itemized meals | `POST /api/nutrition/log`, once per food |
| Water tile | `POST /api/nutrition/water` |
| Mind hub level, XP, streak, unlocked modules | `PUT /api/mind/identity`, `POST /api/mind/state`, `POST /api/mind/session` |
| "This Week" strip and Up Next card | `POST /api/schedule` with the training days |
| Clear first-run coach marks | `PUT /api/tutorial-progress` |
| Remove clutter from the training hub | `POST /api/programs/abandon` on unused 0% enrolments |
| Put a program on the account | `POST /api/programs/enroll` |

The manifest's `seeding.writes` array is the record of what was actually called. Extend it, do not
replace it.

## What can and cannot be backdated

| Data | Backdate? | Consequence |
|---|---|---|
| Program workouts via `POST /api/progress` | Yes | Weekly volume chart shows real weeks. This is how `progress-*.webp` got six weeks of bars |
| Weight (`POST /api/weight`) | **No** | The route stamps "today" and clamps the timezone offset to +/- 14h |
| Mood (`POST /api/mood`) | **No** | Same clamp |
| Nutrition logs | Same day only in practice | Seed and capture on the same calendar day |
| Mind sessions | Gated | Main sessions are limited to one per 20 hours. You cannot rush a chapter |

Consequence for marketing: **weight and mood trend charts are single-point on any freshly seeded
account.** Do not try to fake a trend. Either use an account that has accumulated real days, or
frame the shot to exclude the chart and say so in the manifest note. That is exactly what
`progress-light.webp` did.

## Realism calibration

The state should read like a committed user in week three, not a superhuman and not a beginner.

- ❌ 400 logged workouts, a 180 day streak, every medal unlocked.
  ✅ 11 workouts, 221.6K lbs all-time, phase 1 at 50%, an eight session week counter.
- ❌ Every macro exactly on target.
  ✅ Protein 156/150 slightly over, carbs 145/200, fats 61/65. Real days are uneven.
- ❌ Empty nutrition day plus a full training history.
  ✅ Seed every hub the shot can see, including below the fold.

## Order of operations

1. `PUT /api/tutorial-progress` first, so overlays never interfere with a later seeding step.
2. `POST /api/programs/enroll`, then `POST /api/schedule`, so the week strip has something to show.
3. Backdated workouts via `POST /api/progress`, oldest first, then today's session via
   `POST /api/workouts`.
4. Nutrition, water, weight, mood last. They are same-day only, so they should be the freshest.
5. `POST /api/programs/abandon` on anything left at 0%.
6. Capture light, then dark, in the same session and on the same calendar day.

## Verification before you capture

Walk every route the run will hit, scrolled to the bottom, and confirm:

- No zero-value tile, no "no data yet" row, no empty list.
- The week strip shows at least one completed day.
- The nutrition meal list below the fold is populated, not just the ring above it.
- The mind hub shows an unlocked module set, and locked chapters read as progressive disclosure
  (dashed cards at the bottom fold), not as a wall.

Only then run the capture spec.
