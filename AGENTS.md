# Become — Fitness Coaching Platform

## What Is This?

A mobile-first PWA for personalized fitness coaching. Users authenticate via magic links, enroll in multi-phase training programs, log workouts in real time, and track weight/mood/progress over time. Built for a coach named Jon Don.

**Repo:** `XiroEx/become` on GitHub (private)
**Live deployment:** RedRun at `become.redbtn.io` (workspace ID: `69ab83dd21070736089dc29d`, node .3:32000). Deploy with `/deploy become`. Firebase config in repo is legacy/unused.

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
| Deployment | Firebase App Hosting |
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
│   │   │   ├── programming/     # Browse, create, detail, schedule, workout, live workout
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

Remote: `server.georgeanthony.net:27017`, database: `become`

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

Dev MongoDB is spun up from `../db/compose.yml`. Production uses the remote MongoDB on `server.georgeanthony.net`.

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
- **`agent/<hostname>`** — working branches, PR to `beta`
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
| `webapp/app/dashboard/programming/[programId]/workout/live/page.tsx` | Live workout tracking (most complex UI) |

## What's Missing / Incomplete

- No test framework or tests
- Chat and nutrition sections exist as pages but may be stubs
- Redis URL is configured in .env but unused in code
- No CI/CD pipeline (deployment is Firebase App Hosting)
- No rate limiting on API routes
- No centralized error handling or logging
