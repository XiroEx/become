# Become — Fitness Coaching Platform

## What Is This?

A mobile-first PWA for personalized fitness coaching. Users authenticate via magic links, enroll in multi-phase training programs, log workouts in real time, and track weight/mood/progress over time. Built for a coach named Jon Don.

**Repo:** `XiroEx/become` on GitHub (private)
**Live deployment:** RedRun at `become.redbtn.io` (workspace ID: `69ab83dd21070736089dc29d`, node .3:32000). Firebase config in repo is legacy/unused.

## Channels

Two git-sourced RedRun workspaces, same MongoDB and same env:

| Channel | Domain | Branch | Workspace ID |
|---|---|---|---|
| Production | become.redbtn.io | `main` | `69ab83dd21070736089dc29d` |
| Beta | become-beta.redbtn.io | `beta` | `6a77a584e2c526617ae198f1` |

Both autoDeploy, so **merging to a branch IS the deploy for that channel**. The
normal flow is unchanged: `agent/<host>-<feature>` → `beta` (beta channel picks it
up) → `main` (production picks it up).

They share a database on purpose, so beta is a code-level preview and not an
isolated sandbox — data written on beta is production data. Only two env values
differ, and both must: `NEXT_PUBLIC_APP_URL` (magic-link emails are built from
it, so prod's value would land beta testers on production) and
`NEXT_PUBLIC_APP_NAME`.

**Deployment is git-sourced. Do NOT run `/deploy become` for a normal release.** The
workspace tracks `main` with `autoDeploy: true` and syncs within ~20-40s of a merge,
unattended (verified 2026-07-29 across three merges). `/deploy` is for the exceptions
only: a workspace with autoDeploy off, a genuine build retry, or inspecting state.

Sync and build are separate. The workspace builds `baseDirectory: webapp`, so a
**build only fires when `webapp/` actually changed**. A merge touching only repo-root
files (AGENTS.md, README) syncs but correctly does not rebuild — `buildState` stays
`built` on the previous SHA. That is not a stuck deploy. Confirmed 2026-07-29: merge
a952896 (AGENTS.md only) synced at +16s and never rebuilt, while merges touching
`webapp/` started a build job ~21s after the merge.

Hand-triggering `build?force=true` while the automatic build is already running
KILLS it: the running job fails with "Build interrupted (no active job found during
reconciliation)". That is exactly what happened on 2026-07-29, and it was mistaken
for an infra flake. Merge and wait; only intervene if no build appears after a few
minutes.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| React | 19.2 |
| Database | MongoDB via Mongoose 9 |
| Auth | Passwordless magic links + JWT (7-day, HTTP-only cookie + Bearer) |
| Styling | Tailwind CSS v4, dark mode, safe-area insets for PWA |
| Animations | Framer Motion 12 |
| Charts | Recharts 3 |
| Drag & Drop | @hello-pangea/dnd 18 |
| Icons | lucide-react |
| Email | Nodemailer (SMTP/Gmail) |
| Deployment | RedRun (git-sourced from `main`, autoDeploy) |
| Package Manager | npm |

## Project Structure

```
become/
├── webapp/                      # The Next.js app (everything lives here)
│   ├── app/
│   │   ├── api/                 # API routes (REST-style)
│   │   │   ├── auth/            # send-link, verify-link, check-session, me, login, register, logout
│   │   │   ├── programs/        # CRUD, search, enroll, active, saved, abandon, start-date, current-workout
│   │   │   ├── workouts/        # Log & query workouts
│   │   │   ├── weight/          # Weight logging (with skip tracking)
│   │   │   ├── mood/            # Mood logging (1-5 scale)
│   │   │   ├── schedule/        # Calendar scheduling + settings
│   │   │   ├── progress/        # Progress summary
│   │   │   └── exercise-videos/ # Video lookup
│   │   ├── dashboard/           # Protected pages
│   │   │   ├── workout/         # Browse, create, detail, schedule, workout, live workout (route: /dashboard/workout)
│   │   │   ├── calendar/        # Calendar + settings
│   │   │   ├── progress/        # Charts & stats
│   │   │   ├── mind/            # Mood tracking
│   │   │   ├── nutrition/       # Nutrition section
│   │   │   └── chat/            # Chat section
│   │   ├── login/               # Magic link login
│   │   ├── register/            # Registration
│   │   ├── verify/              # Magic link verification
│   │   └── layout.tsx           # Root layout (Geist font, PWA SW registration)
│   ├── components/              # React components (client-side)
│   ├── lib/                     # Utilities: auth.ts, mongodb.ts, email.ts, clientAuth.ts, hydrateExercises.ts
│   ├── models/                  # Mongoose schemas: User, MagicLink, Program, Exercise, ExerciseVideo, UserProgress, Schedule
│   ├── public/                  # PWA manifest, icons, exercise videos (.mov/.mp4)
│   ├── scripts/                 # Utility scripts
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts           # Remote images (Instagram, YouTube), video CORS headers
│   └── postcss.config.mjs
├── firebase.json                # App Hosting config (rootDir: webapp, backendId: jondonfit)
├── apphosting.yaml              # Env vars: MONGODB_URI, JWT_SECRET (secrets)
├── .firebaserc                  # Firebase project: georgeanthonycrm
└── AUTHENTICATION_SYSTEM_DOCUMENTATION.md
```

## Database (MongoDB)

**Become is the one app whose data lives on hosted Atlas, not on the fleet Mongo.**
Production app data: Atlas cluster `jondonfit.ctp0tfj.mongodb.net`, database
`jondonfitdb` (auth data in `become_auth`). The `jondonfit` naming is legacy —
it predates the rename to Become. Every other redbtn app uses the
`server.georgeanthony.net` box, so it is easy to assume this one does too.

A `become` database DOES exist on `server.georgeanthony.net:27017`, which is
what makes the wrong answer look right: it is an abandoned copy (most
collections empty, a couple hundred stray food rows) and nothing reads it.
Verified 2026-08-12 — `jondonfitdb` holds the live data (60 users, meal logs
from that day).

The fleet box is still in the picture for one thing: the **redsecrets store**
(`redshared` on `192.168.1.10:27017`), which is where the real connection
string comes from.

### Where config actually comes from (read before trusting an env var)

`lib/runtimeConfig.ts` resolves `BECOME_RUNTIME_CONFIG` from redsecrets and
**prefers it over the container's environment variables**. A `docker inspect` of
`MONGODB_URI` or `JWT_SECRET` therefore shows a value that may be stale and is
not necessarily the one in use. Read the payload if you need the truth.

In production (`NODE_ENV=production`, which `next start` sets) the payload is
REQUIRED — with no redsecrets bootstrap, `getRuntimeConfig()` throws and every
authenticated route returns 401 while `AuthGuard`, which only checks token
expiry client-side, still renders the page. The app looks fine and every list is
silently empty. For local work run `next dev`, where local env is authoritative.

### Models

- **User** — email, hashed password (legacy), name, saved programs
- **MagicLink** — token (64-char), sessionId (32-char), 15-min TTL auto-delete
- **Program** — multi-phase structure: phases → workouts → exercises (referenced by slug). Fields: duration_weeks, training_days_per_week, goal, target_user (Beginner/Intermediate/Advanced). Text search index on name/description/tags
- **Exercise** — slug (unique), name, aliases, category, mechanics, movement patterns, muscles (primary/secondary/stabilizer), equipment, tracking type, instructions, cues, video URLs, prerequisites/variations/alternatives. Compound indexes on category/difficulty/movement
- **ExerciseVideo** — exercise name, video URL, thumbnail
- **UserProgress** — per-user document: weight history, mood history (1-5), workout logs (sets with reps/weight/completed), active programs with progress tracking, streak count
- **Schedule** — one per user+program (compound unique index). Training days (0-6), start date, auto-advance flag, scheduled workouts with status (scheduled/completed/missed/skipped/rest)

### Key Patterns
- Programs reference exercises by `slug`, hydrated server-side via `hydrateExercises.ts`
- Exercise grouping supports supersets, circuits, trisets, giant sets, EMOM, AMRAP
- Lean queries (`.lean()`) for read-only endpoints
- TTL index on MagicLink for auto-cleanup

## Authentication Flow

Passwordless magic link system (see `AUTHENTICATION_SYSTEM_DOCUMENTATION.md` for full detail):

1. User submits email → `POST /api/auth/send-link` creates MagicLink doc + sends email
2. Frontend polls `POST /api/auth/check-session` every 2s with sessionId
3. User clicks email link → `/verify?token=xxx&mode=login|register`
4. `POST /api/auth/verify-link` validates token, creates user if new, returns JWT
5. JWT stored in HTTP-only cookie (`auth_token`, 7-day, Secure in prod) + localStorage
6. Verify page closes/redirects; polling tab picks up JWT and redirects to dashboard

**Auth helper:** `verifyAuth()` in `lib/auth.ts` — reads Bearer token from Authorization header, verifies JWT, returns userId + email.

## API Conventions

- Route handlers in `app/api/` using Next.js App Router (`route.ts` exports)
- Auth via Bearer token in `Authorization` header → `verifyAuth()` middleware
- Response format: `NextResponse.json({ ...data })` or `NextResponse.json({ error: "msg" }, { status: 4xx })`
- No centralized error handler — try/catch per route

## Frontend Patterns

- **AuthGuard** component wraps protected routes
- **BottomNav** — 5-tab mobile navigation
- **DailyCheckInModal** — prompts mood/weight on dashboard load
- **PageTransition** — Framer Motion enter/exit animations
- **PWA** — manifest.json, service worker, InstallPrompt component, safe-area CSS utilities
- State management: React hooks only (no Redux/Zustand/Context providers beyond auth)

## Environment Variables

### Required
```
MONGODB_URI          # MongoDB connection string
JWT_SECRET           # JWT signing secret
```

### Email (Nodemailer SMTP)
```
EMAIL_HOST           # SMTP server (default: smtp.gmail.com)
EMAIL_PORT           # SMTP port (default: 587)
EMAIL_USER           # SMTP username
EMAIL_PASS           # SMTP password
EMAIL_FROM           # From address (defaults to EMAIL_USER)
```

### Entitlements
```
ENTITLEMENTS_ENFORCED     # "false" (default) | "true"
```
The free/plus paywall kill-switch. Read per request straight off `process.env`
(`entitlementsEnforced()` in `lib/entitlements.ts`) and NOT through
`lib/runtimeConfig.ts` — that module ignores `process.env` entirely when
`NODE_ENV === 'production'`, which `next start` sets, so routing it there would
make the switch permanently read as unset. It is not a secret, so it belongs in
the RedRun workspace `appConfig.env` (runtime env), never a build arg.

- **OFF (default)** — no user-visible gating at all; allowance usage is still
  counted, so the real distribution is known before the flip (shadow mode).
- **ON** — gates and the free-tier allowances enforce for `tier: 'free'`.
  `role: 'admin'` bypasses everything either way.

Two ordering rules, both non-optional:
1. **Run `webapp/scripts/migrate-tiers.mjs --prod --apply` before flipping it.**
   The `Tier` enum collapsed to `free|plus`, so an admin PATCH (which uses
   `runValidators`) throws on any user still holding a legacy `premium`/`pro`
   value, and every un-migrated member reads as `free`.
2. Beta and production **share one database**, so a beta-only flip enforces for
   beta traffic only, but the shadow counts it writes are the same rows
   production reads. Flip beta briefly with a named test account, then
   production — do not soak.

Two guards to keep in mind when adding a gate:
- `requireFeature` = "may this member TOUCH this feature" and deliberately
  passes for a capped free member, so they can still edit and DELETE what they
  own (deleting is the only way back under an inventory cap).
- `requireQuota` (`lib/entitlementGuards.ts`) = "may they CREATE another one".
  Every create path uses this one. A create path left on `requireFeature` is
  silently ungated.

#### The client side of a gate

Four pieces, and nothing else should exist:

| Piece | Job |
|---|---|
| `hooks/useEntitlements.ts` | The ONLY caller of `GET /api/me/entitlements`. Module-level snapshot + 60s TTL + a localStorage seed, so a screen with three gated components makes one request. |
| `lib/entitlementsClient.ts` | Client-safe types and copy, plus `gateFrom(status, body)` — the one 403 parser. `lib/entitlements.ts` imports mongoose, so a component may only take TYPES from it. |
| `components/UpgradeSheet.tsx` | The one upsell. Renders `gate.error` verbatim; the server owns the wording. |
| `components/TierGate.tsx` | Wraps a whole surface a free member may see but not use (Vision). |

Rules that are easy to get wrong:
- **Read `canCreate`, never `allowed`.** `allowed` is true for a capped free
  member on purpose (that is what lets them edit and delete their own rows), so
  a create button wired to `allowed` is silently ungated.
- **Every tier surface must bail on `enforced === false`.** That single check is
  what makes the whole epic ship dark, and it is asserted in
  `tests/unit/entitlements/uiSurfaces.test.tsx`.
- `gateFrom` only accepts a 403 carrying BOTH `feature` and `requiresTier`, so
  an ownership or role 403 still falls through to the caller's normal error.
- UI locks are explanatory. The client fails OPEN (network blip → no lock); the
  server is the gate.
- Nutrition AI refusals arrive as `EntitlementRequiredError` from
  `lib/nutrition/aiEngine.ts`, threaded from `runStore`'s HTTP status. Check it
  BEFORE `PlateUnavailableError` or a paywall reads as an outage.

### Public (Next.js)
```
NEXT_PUBLIC_APP_NAME      # "Become"
NEXT_PUBLIC_APP_TAGLINE   # Tagline text
NEXT_PUBLIC_APP_URL       # Base URL for magic links
NEXT_PUBLIC_PROFILE_IMAGE # Coach profile picture
NEXT_PUBLIC_LOGO          # App logo
```

## Development

```bash
cd webapp
npm install
npm run dev          # starts MongoDB via docker compose (../db/compose.yml) + Next.js dev server
```

Dev MongoDB is spun up from `../db/compose.yml`. Production uses hosted Atlas —
see the Database section above; it is the one app that does not use the fleet
Mongo box.

## Shell & Background Jobs (CRITICAL)

**Never write an unbounded wait.** Patterns like `until [ -f /tmp/report.txt ]; do sleep 2; done`
block *forever* if the file never appears. When this agent runs as the Become Discord agent
(Claude Code over SSH), a forever-blocked bash call means the run never returns — it hangs the
parent graph run indefinitely and the thinking-indicator keeps spamming a Discord typing
indicator (this caused ~14.7h typing loops + dozens of zombie graph runs on 2026-05-31).

Rules:
- **Always bound a wait** with both a max-iteration cap *and* a not-found fallback. Replace
  `until [ -f F ]; do sleep 2; done` with:
  ```bash
  for i in $(seq 1 60); do [ -f F ] && break; sleep 2; done
  [ -f F ] || { echo "TIMED OUT waiting for F"; exit 1; }
  ```
- **Wrap any potentially-long command in `timeout`**, e.g. `timeout 180 node test.cjs`.
- **Prefer running Playwright synchronously** (foreground, with its own `timeout` and an explicit
  page/navigation timeout) over backgrounding a job and polling for a report file. If you must
  background, the poll loop MUST have a hard cap and must report failure when the cap is hit.
- Never leave a process that can outlive your turn waiting on a condition that may never become
  true.

## Git Workflow

- **`main`** — production, protected
- **`beta`** — integration branch, PRs merge here first
- **`agent/<hostname>-<feature>`** — one isolated feature branch per task (e.g. `agent/alphaSystem-landing-rework`), PR to `beta`, delete after merge. Never a shared long-lived `agent/<hostname>` branch — concurrent agents collide on it.
- **Start every task from a fresh base.** Run `git fetch origin --prune` first and branch from `origin/beta` — never from a local `beta`/`main` or a leftover checkout state. Remote-node checkouts (board/Discord agents) go stale between runs; a stale base produces PRs full of phantom conflicts and reverts. If a fetch fails with a `.lock` error, remove the stale lock file under `.git/` and retry — do not proceed on the stale base.
- **If a push is rejected (non-fast-forward): fetch, then rebase your feature branch onto its upstream and push again.** Never force-push `beta` or `main`, and never resolve a rejection by discarding commits that exist on the remote.
- Never commit directly to `main` or `beta`
- You have **explicit standing permission** to merge feature branch → `beta` → `main` as part of the normal deploy flow. Do not pause to re-ask each time; the user has already authorized this pipeline.

## Key Files to Read First

| File | Why |
|------|-----|
| `webapp/models/Program.ts` | Core data model — phases, workouts, exercise references |
| `webapp/models/Exercise.ts` | Exercise schema — the canonical exercise definition |
| `webapp/models/UserProgress.ts` | Progress tracking — weight, mood, workout logs, streaks |
| `webapp/lib/auth.ts` | JWT creation/verification, `verifyAuth()` middleware |
| `webapp/lib/hydrateExercises.ts` | How exercise slugs become full objects |
| `webapp/app/api/programs/route.ts` | Program list/create pattern (representative of all API routes) |
| `webapp/components/AuthGuard.tsx` | How protected routes work |
| `webapp/app/dashboard/workout/[programId]/workout/live/page.tsx` | Live workout tracking (most complex UI) |

## What's Missing / Incomplete

- No test framework or tests
- Chat and nutrition sections exist as pages but may be stubs
- Redis URL is configured in .env but unused in code
- No CI pipeline (RedRun builds on merge to `main`; no tests gate the deploy)
- No rate limiting on API routes
- No centralized error handling or logging
