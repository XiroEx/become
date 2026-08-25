# Manifest Schema

`webapp/public/screenshots/v2/manifest.json` is the pipeline record. It is the reason a capture can
be trusted six months later. **Read it before any capture run; append to it after every one.**

## Top level

```jsonc
{
  "capturedAt": "2026-08-24T21:40:00-04:00",   // ISO 8601 with offset. Update on every run
  "origin": "https://become.redbtn.io",         // Always production
  "viewport": { "width": 390, "height": 844, "deviceScaleFactor": 2 },
  "shots": [ /* one object per file */ ],
  "skipped": [ /* screens considered and rejected, with the reason */ ],
  "accounts": { /* email -> one line describing the seeded state */ },
  "seeding": { "scope": "...", "writes": [ /* every API call made */ ] },
  "knownIssues": [ /* every DOM patch and every bug found */ ]
}
```

## `shots[]`

| Field | Type | Rule |
|---|---|---|
| `file` | string | Filename only, no path. `<screen>-<theme>.webp` |
| `page` | string | The route, including query. If the shot is a sheet or a scroll position, say so: `"/dashboard/workout -> Generate sheet"`, `"/dashboard/nutrition (scrolled to meal list)"` |
| `account` | string | The dummy account email |
| `theme` | `"light"` or `"dark"` | Matches the Playwright `colorScheme` |
| `width` / `height` | number | Final webp pixels, normally `780` x `1688` |
| `notes` | string | **The load-bearing field.** What is on screen, why this state, and any deviation |

### What a good `notes` line contains

1. The concrete state visible in the frame, with numbers.
2. Why the state is what it is, when it is not obvious.
3. Any deliberate framing decision.
4. Any deviation from what a reader would expect from the route name.
5. For a dark twin: that it matches its light twin, and any residual difference.

❌ `"Dashboard screenshot, dark mode."`

✅ `"Populated tiles: Day Streak (Building 1/3), Today's Mood (Pretty Good), This Week 1/4, Goal
7.4 lbs to go, Calories 1737/2000, The Becoming summary row, Up Next 'Tomorrow: Day 2 Lower A'.
Streak is only 1 day because the account's activity had to be seeded today; weight/mood history
cannot be backdated through any app API."`

The second one tells a future reader why the streak is 1 and stops them re-running the capture to
"fix" it.

## `skipped[]`

Screens that were considered and not shipped, each with the reason. An empty array is fine, but if
a run rejected a screen, record it. It prevents the next operator repeating a dead end.

## `accounts`

Map of email to a one line state summary, plus a verdict where relevant. The existing entries
record both the account that was used and the one that was rejected, with the reason. Keep that
pattern: the rejection is as useful as the selection.

## `seeding`

```jsonc
"seeding": {
  "scope": "Only the two dummy capture accounts were written to; all writes went through the app's own HTTP APIs.",
  "writes": [
    "pw1: 10 backdated program workouts via POST /api/progress {type:'workout'} + one completed session via POST /api/workouts"
  ]
}
```

Prefix each line with a short account alias. One line per logical group of calls. This is the audit
trail proving no real member was touched.

## `knownIssues[]`

```jsonc
{
  "where": "webapp/app/dashboard/progress/ProgressClient.tsx:560",
  "issue": "The Weekly Volume <Bar> uses a hardcoded fill=\"#18181b\" with no dark variant...",
  "impactOnCapture": "For progress-dark the 6 rendered bar rects were recolored to #e4e4e7 in the DOM at capture time. No app code was changed and no other element was touched."
}
```

| Field | Rule |
|---|---|
| `where` | File and line when it is a code defect, or a plain description when it is behavioural (`"weight / mood history"`) |
| `issue` | The defect, stated so an engineer could fix it without rerunning the capture |
| `impactOnCapture` | Exactly what was changed at capture time, and what was not. Omit when nothing was patched |

Rules:

- **Any DOM patch requires an entry.** No exceptions.
- **Every entry implies a bug to file.** A `knownIssues` list that never shrinks means we are
  papering over defects instead of fixing them.
- Cosmetic nits captured as-is still belong here (the Generate sheet range slider is recorded that
  way), so the next operator does not think it is a capture error.

## Append checklist

- [ ] `capturedAt` bumped.
- [ ] One `shots` entry per new file, `notes` written to the standard above.
- [ ] `accounts` updated if a new account was used or a verdict changed.
- [ ] `seeding.writes` extended with every call this run made.
- [ ] `knownIssues` extended for every patch and every bug observed.
- [ ] File parses: `timeout 30 node -e "JSON.parse(require('fs').readFileSync('webapp/public/screenshots/v2/manifest.json','utf8'));console.log('ok')"`.
