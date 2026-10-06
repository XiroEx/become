# Become — Fitness Coaching Platform

## What Is This?

A mobile-first PWA for personalized fitness coaching. Users authenticate via magic links, enroll in multi-phase training programs, log workouts in real time, and track weight/mood/progress over time. Built for a coach named Jon Don.

**Repo:** `XiroEx/become` on GitHub (private)
**Live deployment:** RedRun at `become.redbtn.io` (workspace ID: `69ab83dd21070736089dc29d`, node .3:32000). Firebase config in repo is legacy/unused.


## Before you ship (agents): run what CI runs

CI's `expo` job fails on things that are cheap to catch locally. On 2026-09-30, three native PRs went red on exactly these (TS2322 on an optional string, and `react-hooks/set-state-in-effect` twice). Before `workspace_ship` or `git push`:

- Any change under `expo/`: `cd expo && npx tsc --noEmit && npx eslint .`. Zero errors; warnings are fine.
- Any change under `shared/api-client/` or `shared/core/`: run that package's `npm test`. Any PR changing `shared/core/` MUST bump its version in `shared/core/package.json`. Until redsync's app-repo fixes land, publishing a new `@become/core` version is a manual step.
- Any contract test you add under `webapp/tests/unit/contract/`: seed fixtures the way the model requires (required fields included), and give the file its OWN member. Contract files run in parallel against one database.
- `react-hooks/set-state-in-effect`: prefer deriving the value during render. Suppress it (`// eslint-disable-next-line react-hooks/set-state-in-effect`) ONLY when the effect genuinely syncs from something outside React (a route param, an app-state or network callback), with a one-line reason above it.
- The webapp is built by RedRun from `webapp/` ALONE. Never import from `../shared/*` in webapp code: it passes CI and breaks every production build. Webapp consumes published `@become/core` from `https://registry.redbtn.io/`.

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

## The native app: store builds only, and NO Expo-hosted services (NP-040)

**A merge is the deploy for the webapp. It is not the deploy for `expo/`.**

George, 2026-09-30: **no Expo-hosted service, ever** — no EAS Build, no EAS
Submit, no EAS Update, no Expo Push Service, no expo.dev project. Expo
*libraries* and the *CLI* are fine and are what we use (`expo prebuild`,
`expo export`, expo-router, expo-notifications for permissions and local
notifications). The consequence for v1 is **no over-the-air updates at all**:
every native change AND every JS-only fix ships as a **store build**, built
locally (`expo prebuild` → Xcode archive / `./gradlew bundleRelease`) and
uploaded by hand. `expo/RELEASE.md` is the procedure.

The only lever that reaches an app already installed on a phone is the
**minimum-version gate** (NP-041): `minVersion` / `latestVersion` / `storeUrl`
per platform in `BECOME_RUNTIME_CONFIG` → `GET /api/app/config` →
`expo/lib/version/versionGate.ts`. `latestVersion` shows a dismissible banner,
`minVersion` a full-screen block — so set `minVersion` only to a build that is
actually downloadable on that store, and remember the gate fails open on any
error (it is not a kill switch). "Releasing a fix" in `expo/RELEASE.md` has the
whole sequence.

`eas.json` and `expo-updates` are banned and the ban is enforced, not merely
documented: `expo/scripts/check-no-ota.mjs` is the first step of CI's `expo`
job, `expo/__tests__/storeDistribution.test.ts` runs it against fixtures in both
directions, and `webapp/tests/unit/ci/nativeJobs.test.ts` repeats the file
checks in `verify`, which runs on every PR. A SELF-HOSTED server speaking the
open expo-updates protocol stays a possible later card — only if George asks.

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
- A **circuit** is rounds of the whole block, so its members may not disagree about how many: `alignCircuitSets` / `setSetsAt` in `lib/workout/buildAsYouGo.ts` hold every member to the FIRST one's `sets` (and mirror it into `groupRounds`). Supersets are explicitly left free to pair 5 sets of one thing with 3 of another. A newly added exercise defaults to `defaultSetsFor(list)` — the first exercise's count — never a hardcoded 3
- That rule is applied where an exercise list is PRODUCED, not only by the gestures that make a circuit: `SessionBuilder` / `SessionEditor` seed their rows through `alignCircuitSets`, and so do the Live/Track loaders (`LiveWorkoutClient`, `WorkoutFormClient`, expo's `useLiveWorkout` / `useQuickLiveWorkout`). A circuit written in the program editor, imported, generated, or saved before the rule existed therefore still runs as one block — `buildWorkoutFlow` walks `max(groupRounds, …sets)` rounds and OMITS a member with no set left, so an unaligned circuit renders with holes in its tail rounds. Align the list before the set grid is sized off `ex.sets`, never after
- The post-workout summary reads a logged set by its TRACKING TYPE, never as `weight × reps`: `webapp/lib/workout/summaryMetrics.ts` (and the same rules re-stated in `expo/components/live/WorkoutSummary.tsx`) owns the set chips, the aggregates, the PR comparison and the circuit/superset blocks for all three callers. Note the Live view's input convention when feeding it — that screen types a timed set's SECONDS into its reps box and its DISTANCE into its weight box, so `LiveWorkoutClient` translates on the way into the summary exactly as it does on the way into `saveWorkout`. Hand it raw and a 10-minute / 2000 m treadmill reads "2000×600" and drops 1,200,000 lbs into Volume
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

### The two auth routes, and why they are two

`/login` and `/register` are separate PATHNAMES rendering one component
(`components/AuthScreen.tsx`, copy from `lib/authPageMode.ts`). They used to be
one route told apart by a bare `?register` query param, and the "Already have an
account? **Sign in**" toggle at the bottom of the sign-up form was therefore a
link from `/login?register` to `/login` — a query-only change on the page the
router was already rendering, which it ignores. The address bar never moved and
the form never re-rendered: the link did nothing, and read perfectly while doing
it. Do not merge them back behind a query param.
`/login?register` still 307s to `/register` for every link outside this repo.

**Sign-up asks for an email and nothing else.** No name box: `send-link` used to
answer `400 Name is required for registration`, and it no longer does. New
members get `User.name` = the email's local part (`lib/displayName.ts`, shared
with the check that recognises it) and **onboarding step 2 collects the real
one** — the box starts empty when the stored name is that placeholder, and the
step will not advance until it is filled. `MagicLink.name` survives read-only so
a link minted by the previous build, all of which live 15 minutes, still lands
the name its owner typed.

### Opening the web signed in (the one-time hand-off)

A web-only screen opened from the native app used to land the member on
`/login`: `middleware.ts` gates `/dashboard/*` on the `auth_token` cookie and
the in-app browser has none. `POST /api/auth/handoff { path }` (session
required) answers a random CODE — 32 bytes, stored only as a SHA-256, alive for
60 seconds, bound to the member and to ONE target path — and
`GET /auth/handoff?code=` spends it, sets the cookie and hands the browser to
`/auth/finish?next=<path>#<jwt>`, which puts the same JWT where the web app
keeps it (localStorage, `token`) and routes on. **The token travels in the
FRAGMENT**, never the query string, which is the shape the Google return already
uses (`app/auth/callback/google/route.ts`).

Four rules, and they all live in `webapp/lib/authHandoff.ts`:

- **Single use** — one atomic `findOneAndUpdate` filtered on `usedAt: null`
  (`models/HandoffCode.ts`). Read-then-write would hand two browsers a session.
- **Sixty seconds, decided in code.** The TTL index is housekeeping only; mongod
  sweeps about once a minute, which would keep a dead code alive.
- **One member.** The session is minted from the User ROW at redemption, so a
  demotion, or an account that has gone, is honoured.
- **Allow-listed targets only** — `HANDOFF_ALLOWED_PATHS`, checked when the code
  is minted AND again when it is spent, so shrinking the list takes effect for
  codes already in flight. Every refusal redirects to `/login?error=handoff`,
  identically, so "no such code" cannot be told from "already spent".

Native side: **`expo/lib/web/openWebSignedIn.ts` is the one helper.** It takes a
PATH (never a URL), prefixes `WEBAPP_BASE_URL`, fetches a code and opens the
in-app browser; on a network error, a refusal, or no session it opens the plain
URL — exactly today's signed-out behaviour, because a Tier-3 button that does
nothing is worse than one that asks you to sign in. The three hand-built link
helpers (`lib/programs/browserLauncher.ts`, `lib/nutrition/recipeLinks.ts`,
`lib/admin/adminLinks.ts`) move onto it as their own tickets land — two of them
still point at pages that do not exist.

Tests: `webapp/tests/unit/auth/handoff.test.ts` (the rules, both routes'
refusals, and every allow-listed target resolved against a real page under
`app/`), `handoffCode.test.ts` (single use, the race, expiry — real Mongo),
`handoffRoundTrip.test.ts` (mint → redeem → replay, end to end) and
`expo/__tests__/openWebSignedIn.test.ts`.

### Sign in with Apple (NP-125, native v1)

`POST /api/auth/apple { identityToken, nonce, authorizationCode?, fullName? }`
answers the SAME session every other auth path answers — one JWT format, one
cookie — because it ends in `bridgeAppleToBecomeSession`, which shares its
minting step with `bridgeToBecomeSession` (`webapp/lib/authBridge.ts`).

**The hard part is matching, not verifying.** With "Hide My Email" Apple hands
us a per-app relay alias, so matching by email would create a SECOND account
for a member who already has one. Hence the order, and it is the whole feature:

1. **Apple's `sub`** — `User.apple.sub`, partial-unique indexed for the same
   reasons `authId` is. Stable across an email change and across the member
   turning Hide My Email on or off.
2. **A verified, REAL email, once**, backfilling the subject. This is what lands
   an existing magic-link/Google/passkey member in the account they already
   have. Deliberately NOT tried for a relay alias or an unverified address —
   `canMatchAppleEmailToMember` in `lib/apple/email.ts` is the whole rule.
3. **Create**, `onboardingCompleted: false`. Apple shares the address on the
   FIRST authorization only, so a row may have to be created with none: it gets
   an unroutable placeholder on `appleid.invalid` (RFC 2606), which
   `isApplePlaceholderEmail` recognises.

**"Already a member? Link your email"** (`lib/appleLink.ts`) is the way out of
case 3 for someone who is not new. `POST /api/auth/apple/link { email }`
(session required, 409 unless the account has an Apple identity, no usable
address AND unfinished onboarding) sends an ordinary sign-in link to the real
address, carrying `MagicLink.appleLinkUserId`. Verifying it MOVES the Apple
subject onto the account that owns the address and purges the throwaway row
through `lib/accountPurge.ts` — so the member ends with one account and the
proof was their inbox, not our guess. An existing account that already carries
a DIFFERENT Apple subject is refused rather than overwritten.

**Verification** (`lib/apple/identityToken.ts`) checks the signature against
Apple's JWKS, the issuer, the audience (`io.redbtn.become` — Apple signs every
app's tokens with the same keys, so the audience is the check that matters),
exp/nbf with NO clock tolerance, and the nonce AFTER the signature. The nonce
is accepted raw or as its SHA-256 hex, because some SDKs hash it for you.

**Deletion revokes the grant, and that is an Apple requirement.** The
authorization code is exchanged at sign-in for a refresh token
(`lib/apple/rest.ts`, ES256 client secret signed with the .p8 — best effort, a
member is never locked out by Apple having a bad minute), stored at
`User.apple.refreshToken` with `select: false`, and handed back at PURGE time,
not at request time (`lib/apple/deletion.ts`, called from
`app/api/cron/purge-deletions`). A failed revoke HOLDS THE ROW BACK so the next
daily sweep retries; that wait is bounded by `LEGAL_DELETION_DAYS`, or a
mis-pasted .p8 would keep a deleted member's data alive forever.

Config lives in the runtime payload's `apple` section (`bundleId` defaults to
the iOS bundle id; `teamId` / `keyId` / `privateKey` are only needed for the
exchange and the revoke).

Native: `expo/components/AppleSignInButton.tsx` renders Apple's OWN
`ASAuthorizationAppleIDButton` (approved title, logo, colours, localised for
free — a hand-built one is a rejection), gated on `isAvailableAsync()` so it
does not appear on Android, with `ios.usesAppleSignIn: true` and the
`expo-apple-authentication` config plugin in `app.json`. The relay case does
NOT store the session until the member answers the link offer, because storing
it navigates them into the empty account they are trying to escape
(`expo/app/(auth)/login.tsx`).

Tests: `webapp/tests/unit/auth/appleIdentityToken.test.ts` (wrong audience,
expired, nonce mismatch, wrong issuer, forged signature, the address rules),
`appleSignInRoute.test.ts` (both matching paths and the link merge, end to end
against real Mongo and a fake Apple — `tests/unit/auth/fakeApple.ts`),
`tests/unit/account/appleRevocation.test.ts` (the revocation, the deferral and
its bound) and `expo/__tests__/appleSignIn.test.tsx`.

### Google, natively (NP-126): the system auth session and a one-time code

**Google refuses sign-in inside an embedded web view** (`disallowed_useragent`),
so the app runs the web flow in the SYSTEM authentication session
(`WebBrowser.openAuthSessionAsync` → `ASWebAuthenticationSession` / a Custom
Tab). The web flow ends at `/auth/finish#<jwt>`, which is right for a browser
tab and wrong for an app: the only way a URL re-enters an app is a scheme ANY
app on the device can claim, so **the app never receives the token.** It
receives NP-121's one-time code, in the other direction:

1. the app invents a **verifier** (32 bytes from `expo-crypto`'s CSPRNG, kept in
   memory) and opens `/api/auth/google?app=1&challenge=<sha256, base64url>`;
2. that route arms one short-lived HttpOnly cookie (`become_app_auth`, holding
   the challenge — a hash, not a secret) and otherwise starts the ordinary
   redAuth flow. `app=1` with no usable challenge is REFUSED before the flow
   starts, because a started flow would end with a token in a fragment no app
   can read;
3. `/auth/callback/google` sees the cookie, mints a code bound to the member AND
   the challenge, and redirects to `/auth/app-callback?code=…`. No JWT, no
   session cookie: the token it just minted is discarded;
4. `/auth/app-callback` redirects to `become://auth/app-callback?code=…`, which
   is what CLOSES the authentication session and resolves
   `openAuthSessionAsync`. A universal link cannot: the authentication session
   only recognises its own callback scheme;
5. `POST /api/auth/exchange { code, verifier }` answers the same session
   everything else does. **Every refusal is one 400 `{ error: 'invalid_code' }`**
   — unknown, spent, expired, wrong verifier — so none can be told apart.

The rules that travel are NP-121's, plus one: **single use** (atomic claim on
`usedAt: null`), **sixty seconds decided in code** (never mongod's TTL sweep),
and **one device** — the verifier, which is why carrying the code over a
claimable scheme is safe and carrying a token would not be. Neither the code nor
the verifier is stored: `models/AppAuthCode.ts` keeps SHA-256s of both.

`webapp/lib/appAuthCode.ts` holds the rules and the four constants the app
mirrors in `expo/lib/auth/googleSignIn.ts`. The app computes the challenge with
a plain-TypeScript SHA-256 (`expo/lib/auth/sha256.ts`) rather than a native
digest, so the one value the flow's security rests on is computable in Jest;
`expo/__tests__/sha256.test.ts` pins it against Node's crypto on every padding
boundary. `components/GoogleSignInButton.tsx` draws the web's own four-colour G —
the only colour literals allowed to exist outside `lib/theme/tokens.ts`, as RGB
triplets, because Google's brand colours are fixed by Google and not the app's
palette.

Tests: `webapp/tests/unit/auth/appAuthCode.test.ts` (the rules, the refusals
both routes make before Mongo, and the constants read out of `expo/`),
`appAuthRoundTrip.test.ts` (mint → exchange → **replay is 400**, wrong verifier
burns the code, expiry, a deleted member, the race — real Mongo), and
`expo/__tests__/googleSignIn.test.tsx`.

## API Conventions

- Route handlers in `app/api/` using Next.js App Router (`route.ts` exports)
- Auth via Bearer token in `Authorization` header → `verifyAuth()` middleware
- Response format: `NextResponse.json({ ...data })` or `NextResponse.json({ error: "msg" }, { status: 4xx })`
- No centralized error handler — try/catch per route

### `tz` is a number, and the IANA zone is `tzZone`

Every date-scoped route answers for the CALLER'S local day, and the only thing
it will listen to is `tz` as **minutes west of UTC** — `Date.getTimezoneOffset()`
semantics, so New York in summer is `240` and CET in winter is `-60`.
`readTzOffset` / `readTzOffsetFromBody` (`webapp/lib/dayWindow.ts`) parse it with
`Number()`, clamp to ±840, and turn **anything else into 0 = UTC**. Sending
`tz=America/New_York` therefore reads as "UTC" and is silently wrong — which is
exactly how every native read was answered for the UTC day, and how an Eastern
member's 9pm mood was dated tomorrow (fixed: NP-009).

Rules, all four load-bearing:

- **Reads** put it on the query string; **writes** put it in the JSON body. A
  handful of routes read both (`/api/streaks/freeze`, `/api/nutrition/log`'s
  DELETE), so the shared client sends the query param on every method and
  additionally merges `{ tz, tzZone }` into POST/PUT/PATCH JSON bodies.
- **The IANA zone travels only as `tzZone`** (body only). The server can verify
  that one with `Intl` and prefers it over the number beside it —
  `webapp/lib/captureUserTimezone.ts`.
- **Never send `tz: 0` as a stand-in for unknown.** `POST /api/workouts`
  PERSISTS a reported offset as the member's zone, and a fabricated 0 marks them
  UTC, which fires their morning push at ~3am local. Omit it instead: route
  code gates on `readOptionalTzOffsetFromBody(body) !== null`.
  `POST /api/me/timezone` goes one further and refuses a bare `0` with no
  `tzZone` outright (`resolveTimezoneReport`), because it is the route members
  with NOTHING stored are onboarded through: a wrong 0 there is not a
  correction, it is the 3am push. Real UTC sends a zone beside it and is kept.
- **Windowed allowances never key on the request's `tz`** — they key on the
  STORED zone (`webapp/lib/allowances.ts`), so moving your clock cannot open a
  fresh daily bucket.

### Where the stored zone comes from

`UserProgress.timezoneOffset` / `timezone` is what the notify cron places a
member's local hour with, and every sweep SKIPS a member who has neither. It
used to be written by `POST /api/workouts` and nothing else, so a member who
only logged food or only ran Mind sessions got no reminders at all and had
their windowed AI allowances bucketed on UTC.

`POST /api/me/timezone { tz, tzZone }` is now the main writer: both apps call
it when the app opens, at most once per LOCAL day — web from
`components/TimezoneSync.tsx` (mounted in the dashboard layout), native from
`expo/components/TimezoneReporter.tsx` (launch + the first foreground of a new
local day, gated in process memory). A failed report never stamps the day, so
the next open retries.

Exactly one route forgives another spelling, and only for bundles already in
the field: `PUT /api/mind/session` reads `tz` and falls back to a numeric
`tzOffset` (`readTzOffsetFromBodyCompat`). `MindJourney.begin` sent `tzOffset`
from 2026-08-12 until NP-031, so the session a member began at 9pm in New York
was stamped with tomorrow's UTC day and the next `GET /api/mind/session?tz=`
dropped it as `new_day` — reopening the tab lost the session. Send `tz`.

The native/shared side is `shared/api-client/src/tz.ts`: `DATE_SCOPED_FAMILIES`
lists every family that reads `tz`, and the offset is recomputed per request
because DST moves it. That list drifts the moment a new route reads `tz`, so
`webapp/tests/unit/tzFamilyParity.test.ts` scans `app/api` for the readers and
fails when a family is missing from it. `admin` is the one deliberate exemption
(coach-only; native never calls it).

### A write can carry the day it was made on (`date` + `loggedAt`)

`tz` alone dates a write from the SERVER'S clock, which is wrong for anything
that did not reach the server the moment it happened. A weigh-in made offline at
11:50pm and replayed by the native queue at 12:05am landed on the next day — and
because the day-keyed routes hold exactly one entry per local day, the replay did
not duplicate, it filed the value on the wrong day and could overwrite a newer
one.

`POST /api/weight` and `POST /api/mood` therefore accept two optional fields
(`resolveEntryDay` in `webapp/lib/dayWindow.ts` is the whole decision):

- **`date`** — a `YYYY-MM-DD` LOCAL day key, keyed with `utcMidnightDateKey`.
  Refused with 400, never silently filed under today: a malformed key, a key
  that is not a real calendar day, a day in the FUTURE of the caller's own
  local today, and one older than `BACKDATE_WINDOW_DAYS` (7 — the offline
  queue; a caller may widen it, which is how Health imports reach back
  further — see below).
- **`loggedAt`** — an ISO instant, stored on the entry, that orders two
  deliveries of the SAME day against each other. The newer one wins
  (`isStaleReplay`), so a queue draining out of order cannot overwrite a newer
  value; the loser is answered `200 { applied: false }` because there is
  nothing to retry. A future `loggedAt` is clamped to now, and a row without
  one (every row written before this) loses to any incoming write, which is the
  last-write-wins behaviour every client had.

**A request that sends neither behaves exactly as it did before.** A back-dated
entry deliberately does NOT touch the streak (`recordStreakActivity` only ever
credits the day it runs on), the weight prompt/skip state, or
`profile.currentWeightKg` when a later weigh-in already exists.

### A weigh-in that came from Apple Health / Health Connect (`source` + `externalId`)

`POST /api/weight` also accepts, on top of `date` + `loggedAt`
(`webapp/lib/healthImport.ts` is the whole decision, `readHealthImport` the
reader):

- **`source`** — `'healthkit' | 'health-connect'`. Anything else is a 400; a
  request with no `source` is the ordinary member-typed write and is unchanged.
- **`externalId`** — the SAMPLE's own id. Health re-offers the same rows on
  every sync, so this is the only thing that can say "this is that one again".
  An id with no `source` is a 400: it de-duplicates against nothing.

Both are stored on the `weightHistory` entry, and four rules follow from them:

1. **The day comes from the sample, never from the import.** An import with no
   `date` is a 400 rather than being filed under the day the sync happened to
   run — that is the bug, and a wrong day looks exactly like a right one.
2. **A repeat of the same `externalId` is ignored.** Answered
   `200 { applied: false, duplicate: true }`: the row is not rewritten, so a
   value the member has since corrected by hand survives every later sync. The
   match is on the id alone, not the day.
3. **An import reaches back `HEALTH_IMPORT_BACKDATE_WINDOW_DAYS` (90)**, not the
   offline queue's 7 — a first sync carries months of real weigh-ins off a smart
   scale. Older than that is still a 400.
4. **An import is not member activity.** No streak day, even for a sample dated
   today (the streak records showing up in Become, and a scale syncing in the
   background is not that), and it does not answer the weight prompt
   (`lastPromptDate` is left alone). It IS real data, so `lastWeightDate`,
   `profile.currentWeightKg` and the goal-reached check still follow the newest
   weigh-in.

An import must carry a weight: `skip` with a `source` is a 400.

#### The native side of it (Health Connect, NP-199)

Android speaks that route through `react-native-health-connect`, and everything
above the platform boundary is shared with the iOS half that follows in NP-185 /
NP-186 — one sync (`expo/lib/health/sync.ts`), one set of switches, one route.
Four things to know before touching it:

- **Three flags, all default off, each its own SecureStore key**:
  `become.optin.health` (the umbrella), `become.sync.health.read` (Health →
  Become) and `become.sync.health.write` (Become → Health). They are read ONCE
  per process, at launch (`expo/lib/health/switches.ts`), and the sync consults
  that snapshot — so turning a direction off stops it at the NEXT LAUNCH, which
  is what Settings tells the member and what Health Connect itself does with a
  revoked permission ("does not take effect until the app process restarts").
- **Three Android permissions and no more**: `READ_WEIGHT`, `WRITE_WEIGHT`,
  `WRITE_EXERCISE`. Nothing reads workouts or steps back out of Health Connect.
  The code's list, `app.json`'s manifest permissions and Play's health apps
  declaration in `expo/RELEASE.md` are held equal by
  `expo/__tests__/androidHealthConnect.test.ts` — Play blocks a release whose
  declaration does not match, and an unused health permission is a question
  nobody can answer.
- **Become's own writes are filtered out of every read** (`metadata.dataOrigin`
  = `io.redbtn.become`). Without it the app re-imports the weigh-in it just
  wrote, on every launch, and re-stamps the member's own typed value as imported.
- **The day comes from the record's own `zoneOffset`** (seconds east, converted
  to the minutes west the wire uses), not from the phone's current zone — same
  rule as above, enforced on the client so a sample the route would refuse is
  dropped instead of posted.

It needs a dev build (Health Connect is not in Expo Go) and `minSdkVersion 26`,
raised in `app.json` through `expo-build-properties`.

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
1. **Run `webapp/scripts/migrate-tiers.mjs --prod --apply` BEFORE THE DEPLOY**,
   as a hard pre-deploy step — not before flipping the switch, which is too
   late. The `Tier` enum collapsed to `free|plus` and **the enum ships with the
   build, not with the kill-switch**. Mongoose validates every INITIALIZED path
   on `save()`, so once the new code is live, any write to a hydrated user
   still holding a legacy `premium`/`pro` value throws
   `ValidationError: tier: 'pro' is not a valid enum value` — including an
   admin PATCH (`runValidators`) and the authId/avatar backfill that
   `lib/authBridge.ts` performs on a member's first Google or passkey sign-in.
   That backfill failing means the sign-in itself fails (Google →
   `/login?error=google`, passkey → 400) and keeps failing on every retry.
   `authBridge` therefore also saves with `{ validateModifiedOnly: true }`, so
   the code survives a legacy row that the migration missed or that a restore
   reintroduces. Both halves are required: the migration fixes the data, the
   option fixes the code.
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

And a third rule, which is where both Mind paywalls were walked past:
**the gate belongs on the route that SPENDS, not only on the friendly route in
front of it.** `mind-sessions` was enforced on `/api/mind/session` while
`POST /api/ai/mind/session` — the route that dispatches the composer — carried
only `requireSpendCap`, and a member locked at 10/10 still got a `runId`.
`vision` was enforced on `/api/mind/vision` while
`POST /api/mind/journal { system: 'vision' }` (every protocol the Vision
workspace saves) and `POST /api/ai/mind/flow { system: 'vision' }` were open.
`requireAiFeature` (`lib/ai/allowance.ts`) is that guard for an `/api/ai` route;
a spend ceiling can never stand in for it, being identical for free and plus,
429 rather than 403, and off in production.

And a fourth, the same idea read backwards: **an advertised feature must be an
enforced feature.** `FEATURE_MIN_TIER` is what `GET /api/me/entitlements`
reports, so every entry in it is a promise. `share-programs` was an entry there,
in `FREE_LIMITS` and in the client copy, and NO route anywhere passed it to a
guard — `POST /api/programs/[programId]/share` is `requireTrainerOrAdmin` and
nothing else. Wrong in both directions at once: a Plus member was told they had
sharing and was refused by the role check, and a free-tier TRAINER was told they
did not and shared successfully. It was REMOVED rather than wired up, because
sharing is a ROLE capability — it writes `sharedWith`, the grant that plants a
program in another member's library, and that is staff-only by design. Gating
the route would have left the Plus half of the mismatch standing; dropping the
role check to make the advertisement true would have widened who may write the
grant. `tests/unit/entitlements/enforcementCoverage.test.ts` fails the build if
a feature is advertised with no route that gates on it.

#### The Mind session counters (there are two, on purpose)

`MindProgress.mainSessionCount` is **chapter progress measured in sessions**,
not a session count. The intake maps "I'm building momentum" → chapter 2 and
"I'm ready for the next level" → chapter 3, a self-declared level-up
(`POST /api/mind/progress/levelup`) advances one, an admin can set one, and
`GET /api/mind/progress` then PERSISTS
`max(count, (chapter - 1) * SESSIONS_PER_CHAPTER)` so the chapter survives the
round trip. The head start is the intended product.

`MindProgress.completedMainSessions` is the number of main sessions the member
actually finished — only a counted completion in `POST /api/mind/session`
increments it — and it is **the only one the `mind-sessions` allowance may
read**. Reading the other one put a brand-new free member at 10/10 before their
first session and refused it with "You've finished your first 10 Mind
sessions"; a self-declared level-up then burned 9 more phantom sessions.

Rows written before that field existed have none, which reads as 0 and fails
open (nobody is locked out). **Run
`webapp/scripts/backfill-mind-session-count.mjs --prod --apply` before the
deploy**, alongside `migrate-tiers.mjs`: it seeds each row with
`min(mainSessionCount, days that member completed a session on)` — the head
start is the difference between those two bounds — and only fills rows where
the field is absent, so a second run is a no-op and live increments are never
clobbered.

#### Counted allowances (the ledger)

Inventory allowances ("3 custom exercises") are a live count of rows the member
owns — and "owns" has to mean AUTHORED, not merely "their id is on the row".
Custom foods counts `Food.authoredBy`, a field only the three gated create
surfaces stamp (`importManualFood(..., { authored: true })`), never
`{ source: 'manual', createdBy }`. `importManualFood` hardcodes
`source: 'manual'` and is also how `POST /api/nutrition/foods/import` (which
accepts `source: 'manual'` outright, and is `FoodSearchModal`'s routine
fallback) and the barcode scanner materialise a USDA/OpenFoodFacts hit so it
can be LOGGED. Both are ungated on purpose — gating them takes food logging
away from free members entirely — so counting their rows was a fail-open bypass
AND an over-count at the same time: a member at 3/3 could mint a fourth through
`/foods/import`, while ordinary logging ate all three slots with rows they
never knowingly created and so could not delete to free one. The flag is an
argument, never a body field: a client that could set it could also unset it.

Because the slot is charged on `authoredBy`, **ownership for a food PATCH or
DELETE is `authoredBy`, OR `createdBy` together with `source: 'manual'`**
(`lib/nutrition/foodOwnership.ts`). `createdBy` ALONE is not ownership, and
treating it as such was a real hole: it is stamped on whoever first caused a
USDA or OpenFoodFacts row to be materialised, which is simply whoever searched
for it, so any member could rewrite or delete a shared catalogue row that every
other member's logs referenced. The `source` qualifier is what separates a row
a member actually authored from one their search happened to import.

`authoredBy` stays unconditional on purpose. An inventory cap is only humane
because deleting frees a slot, so a row billed to one member and deletable only
by another is a lockout with no self-service way out — and rows shaped exactly
like that exist, from the window in which `authoredBy` was writable from the
PATCH body. Whoever the slot is charged to can always delete the row and get the
slot back, and no qualifier may ever be added to that branch.

And a count only works if the row actually CARRIES the field being counted.
`POST /api/meal-logs/combine` saved its reusable meal as
`Meal.create({ user: auth.userId, ... })` — `user` is MealLog's owner path,
Meal's is `createdBy` — so Mongoose strict mode dropped the key and every meal
saved there was written with NO owner: never counted against the 3-meal
allowance (five combine-saves from a 0/3 baseline all returned 201 with `used`
still 0), absent from `GET /api/meals?mine=true`, and undeletable by the member
who made it. Neither an allowlist nor a deny-list catches that — the field was
spelled confidently and simply belonged to another model — so the guard is
derived from the SCHEMA: `createStrict` (`lib/strictCreate.ts`) throws on a
top-level key that is not a schema path, and every meal, food and program create
goes through it. Add a path and it is accepted automatically; address one to the
wrong model and the create fails loudly instead of losing the value.

**Run `webapp/scripts/repair-orphan-meals.mjs --prod --apply` before the
deploy**, alongside `migrate-tiers.mjs` and `backfill-mind-session-count.mjs`. It recovers each orphan's owner from the
MealLog that the same combine request created (`mealId` → `user`, a path that
DID land) and repairs only where every log referencing the meal names the SAME
member; zero witnesses or several are reported and left alone, because a guess
would hand one member's meal to another AND charge them an allowance slot for
it. Ownerless `isPublic`/`isVerified` rows are catalog, never reassigned. The
write re-asserts ownerlessness in its filter, so a second run is a no-op.

A live count is a READ, and a create route that reads a count, compares it to
the limit and then writes a row serialises nothing in between: ten concurrent
`POST /api/nutrition/foods` from a free member at 0/3 landed ten rows, on
production, on every counted cap. So a create also takes an in-flight CLAIM
(`lib/inventoryClaims.ts`, `models/InventoryClaim.ts`) and the order is the
mechanism: **claim first, count second, decide from `live + rank`.** A claim is
released only AFTER the row is committed — automatically, from
`lib/afterResponse.ts`, so no route has to remember and none may call
`releaseClaim` itself — which is what makes the two reads jointly complete: a
competing create is either already in the count or still in the array, never
neither. Nothing here is durable, so there is no counter to drift and DELETING
STILL FREES A SLOT IMMEDIATELY; a claim whose release is lost simply stops
counting after 30s, because a stuck claim would lock a member out and an
over-admitted row would not.

Windowed ones — **1 AI food estimate per day, 3 workout generations per
week** — have nothing to count, because what is spent is a graph dispatch that
leaves no row behind. `models/AllowanceUsage.ts` is that row: one document per
`(userId, feature, bucketKey)`, with a **unique** index on exactly those three.

That index is the mechanism, not a nicety. `lib/allowanceLedger.ts` increments
first (`findOneAndUpdate` + `$inc` + `new: true`) and the decision reads the
value the increment RETURNED. A peek-then-compare would let two requests
arriving together against a limit of 1 both read 0 and both spend — a
double-tapped button is enough. Two rules fall out of it:

- **E11000 means two opposite things.** An upsert can lose the insert race (retry
  once — it is a plain `$inc` now, and without the retry the loser of the first
  claim of the day gets a 500 under load only), or the dedupe filter excluded a
  row that already holds this outcome's key (do NOT retry — that bills twice for
  one estimate). `chargeWithRetry` handles both and is unit-tested for it.
- **A denied claim does not decrement.** `used` counts attempts once enforcement
  is on; `remaining` still clamps to 0 and the inflation is a free abuse signal.
  Spend analysis should read `used` (already net of refunds), never `used +
  refunds`.

The bucket is the **member's local day/week**, from `windowBucket()` in
`lib/allowances.ts`, and the offset comes from `UserProgress.timezoneOffset` —
**never from the request**. A client-supplied `tz` is a window-minting oracle
(a different offset per call = a fresh allowance each time), and it also has to
agree with what `GET /api/me/entitlements` reports.

Refund ONLY when the server knows nothing was queued — `triggerOwnedRun`
returned `ok: false`. A run that started and then failed is not refundable: the
graph ran, and "it didn't work" is a claim only the client can make.

`/api/ai/*` routes call `requireAiAllowance` / `requireSpendCap`
(`lib/ai/allowance.ts`) in a fixed order: **auth → validate body → charge →
trigger → refund on trigger failure**. Validating first keeps a typo free;
charging before the trigger makes the allowance a gate rather than a meter.
`tests/unit/allowance/inventory.test.ts` fails the build if a new `/api/ai` POST
route ships without one, and pins `app/api/generate/*` as permanently unmetered
— those are the deterministic fallback every AI route degrades to, so metering
them would turn a soft paywall into a dead end for exactly the people who hit
the cap.

```
ALLOWANCE_ABUSE_CAPS_ENFORCED   # "false" (default) | "true"
```
A **second, separate** switch for `lib/spendCaps.ts` — ceilings on the AI
surfaces that carry no price (coach replies, Mind composition, food
verification). They exist because those dispatch with no user in the loop
(`lib/mind/precompose.ts` on app open, `MindJourney`'s suggestions effect, the
food-flag relaunch), braked only by localStorage, which is per device and gone
with any storage wipe. They are **not** a paywall: identical for free and plus,
refused as **429** so `gateFrom` cannot raise the upgrade sheet from one, and
set an order of magnitude above a real session. Default OFF so launch day has
zero user-visible gating; the counts accrue regardless, so the distribution is
known before it is ever turned on.

#### `grandfathered` is a reason, not a grant

The gates read `tier` and nothing else. The tier derivation that maps
`grandfathered: true` to Plus is WRITER-side (the billing webhook,
`migrate-tiers.mjs`) and has to stay there — deriving it on the request path
would grandfather members automatically, which is exactly what the offline
script exists to do deliberately. The flag therefore says nothing on its own,
and the invariant that makes it look like a grant holds only because the
migration writes `tier: 'plus'` and `grandfathered: true` in one `$set`.

So it is reported as what it is: both `GET /api/me/entitlements` and
`GET /api/billing/status` pass it through `reportedGrandfathered(tier, flag)`,
which is false on any row that is not `tier: 'plus'`. Raw, it told a member
being gated as free that they were grandfathered — "Thanks for being here
early" over a screen of locks. That row should be impossible;
`loadUserEntitlement` logs one if it is ever seen, because it means someone we
promised not to charge is being charged.

#### The client side of a gate

Five pieces, and nothing else should exist:

| Piece | Job |
|---|---|
| `hooks/useEntitlements.ts` | The ONLY caller of `GET /api/me/entitlements`. Module-level snapshot + 60s TTL + a localStorage seed, so a screen with three gated components makes one request. |
| `lib/entitlementsClient.ts` | Client-safe types and copy, plus `gateFrom(status, body)` — the one 403 parser. `lib/entitlements.ts` imports mongoose, so a component may only take TYPES from it. |
| `components/UpgradeSheet.tsx` | The REACTIVE upsell: it appears because something was refused, and answers that one refusal. Renders `gate.error` verbatim; the server owns the wording. Names no amount, ever. |
| `components/TierGate.tsx` | Wraps a whole surface a free member may see but not use (Vision). |
| `app/dashboard/plan` | The PROACTIVE one: the whole plan, side by side, and the only place prices are shown. |

#### The NATIVE side of the same three refusals (NP-010)

The native app has no `gateFrom`, no `aiConsentRefusalFrom` and no spend-cap
branch of its own, and must never grow one:
`shared/api-client/src/errors.ts#classifyApiError(err)` is the single classifier
for both apps and returns exactly one of `session-expired` (401), `plan-gate`
(403 parsed *exactly* as `gateFrom` parses it), `ai-consent` (403 with
`reason: 'ai_consent_required'`), `forbidden` (any other 403), `rate-limited`
(429, with `Retry-After` when the response carried one), `conflict` (409, with
its `error` code), `client` (any other 4xx), `server` (5xx), `offline` (fetch
threw) and `invalid-response` (the schema rejected the body). It replaced
`mapStatusToErrorKind`, which filed every 403 under `auth` next to 401 — which
on this API signs a member out for a plan gate or an AI-consent refusal.

`expo/lib/errors/useApiErrorHandler.tsx` is the one place a class becomes an
action: `session-expired` → sign-out (NP-002) **once per session**, however many
requests were in flight; `plan-gate` → the upgrade sheet (NP-052);
`ai-consent` → the consent sheet (NP-046). Everything else comes back to the
caller with the server's wording verbatim and no sheet. The three answers are
props on `ApiErrorHandlerProvider` (mounted in `expo/app/_layout.tsx`) rather
than imports, so the hook cannot pull a sheet into every screen that makes a
request, and `routeApiError` is the same decision for code that is not a
component (the AI run client, the offline replay).

The three rules that travel with it, all asserted in
`shared/api-client/tests/classifyApiError.test.ts` (against the bodies the web
routes actually send) and `expo/__tests__/useApiErrorHandler.test.tsx`: only a
403 carrying BOTH `feature` and `requiresTier` opens the upgrade sheet; the
server's `error` text is rendered verbatim; a 429 is never an upsell.
`shared/api-client/tests/webParity.test.ts` reads `webapp/lib/legal`,
`entitlementsClient.ts` and `lib/ai/allowance.ts` as text and fails if the
reason code, the gate's two required fields or the 429 ever drift from the copy
the shared client carries.

#### The NATIVE side of the plan snapshot (NP-049)

The phone reads plan state through the same three pieces the web does, in the
same order, and grows no fourth:

| Piece | Job |
|---|---|
| `expo/lib/entitlements/store.ts` | The ONLY native caller of `GET /api/me/entitlements`. A module snapshot + the same 60s TTL, a persisted seed for first paint, and the ordering rules below. Usable outside React, which is why it is a store and not a hook. |
| `expo/lib/entitlements/useEntitlements.ts` | The hook over it. `enforced`, `canCreate(feature)`, `feature(feature)`, `refresh()`. |
| `expo/components/entitlements/` | `AllowanceLock` (the lock + the reason + the way back out) and `AllowanceCounter` (`2/3`, and when it resets). Both draw NOTHING when `enforced` is false. |

**There is no native copy of the gate copy.** `featureHeadline`,
`allowanceLine`, `formatResetsAt`, `syntheticGate`, `planGate`, `gateFrom`,
`FEATURE_LABELS` and `PLUS_BENEFITS` are re-exported from `@become/core`
(Decision NP-017) through the Metro `file:` link, which is the same module
`webapp/lib/entitlementsClient.ts` re-exports from the published package. That
those two are the same module is the ONLY reason the phone and the browser
cannot explain a cap in different words, and it is checked from both sides:
`webapp/tests/unit/entitlements/coreDrift.test.ts` (the always-on `verify` job)
imports the webapp's module AND `shared/core/src/entitlements.ts` and compares
every table and every function output, so a source change that has not been
published and pinned fails there; `expo/__tests__/entitlementsWebParity.test.ts`
refuses a second declaration in either tree and pins the TTL against the web
hook's.

Four ordering rules, ported whole from `webapp/hooks/useEntitlements.ts` and
asserted in `expo/__tests__/entitlementsStore.test.ts`: the identity check runs
FIRST (a token the store has not seen drops the snapshot — it is not stale data,
it is somebody else's plan); a forced read never adopts a request that was
already on the wire; a forced read also marks those requests superseded so one
cannot land on top; and `invalidateEntitlements()` supersedes as well as
expiring the TTL. Without the last two, a member at 3/3 who deletes one stays
locked for a further full minute.

Two things are native-only. `AuthProvider` tells the store the session on every
`commit` and **drops the snapshot on sign-out**, because a sign-out here is a
navigation rather than a page load, so the module cache would otherwise outlive
it. And the persisted seed **is never read while signed out**: it is scoped to a
member by `lib/cache/lastKnown`, and with no session to scope it to that module
falls back to whichever member id is still active — which painted the previous
member's tier straight back onto the next member's first screen.

The rules that travel are the web's: read `canCreate`, never recompute it from
`limit` and `used`; when `enforced` is false render no lock, counter or plan
card; a delete frees its slot immediately, so force a read after one.

#### The NATIVE upgrade sheet and tier gate (NP-052)

Same arrangement as the web — one upsell surface, opened by every gate — with one
structural difference: **the purchase leaves the app.** Plus may be sold from the
iOS app only through an external link on the US storefront (decision 9/20, App
Review 3.1.1(a)), so the CTA hands Stripe's URL to `Linking.openURL` (Safari on
iOS, Chrome on Android) and **never to `expo-web-browser`** — an in-app browser is
still inside the app for 3.1.1 purposes, and that is a store rejection rather than
a bug. `expo/__tests__/upgradeSheet.test.tsx` reads the four native billing
sources as text and fails on an import of `expo-web-browser`, `WebBrowser.*`,
`browserLauncher` or `openWebSignedIn`.

| Piece | Job |
|---|---|
| `expo/lib/entitlements/upgradeSheet.ts` | `showUpgradeSheet(gate)` — a module store, not a hook, because the callers are not all components. Refuses anything that is not a gate. |
| `expo/components/entitlements/UpgradeSheetHost.tsx` | Mounted ONCE in `app/_layout.tsx`, above every route. The only thing that renders the sheet. |
| `expo/components/entitlements/UpgradeSheet.tsx` | The sheet. Renders `gate.error` verbatim with `allowanceLine`, three `PLUS_BENEFITS` rows, and one action slot (`CheckoutAction`). |
| `expo/components/entitlements/TierGate.tsx` | Wraps a surface a free member may see but not use (Vision). |
| `expo/lib/entitlements/billing.ts` | `checkoutRefusalState`, `startCheckout`, `openBillingPortal`, `probeCheckoutAvailable`. Every URL leaves through `openExternally`. |

Both POSTs send **`returnTo: 'app'`** (NP-051): Stripe returns a native buyer to
Safari, which has never held their session, and `middleware.ts` would bounce them
off `/dashboard/plan` to `/login` seconds after their card was charged. `'app'`
swaps in the public `/billing/*` pages, which carry a `become://` button back.

The state machine is the web's, ported rather than reinvented —
`webapp/components/UpgradeSheet.tsx#checkoutRefusalState` cannot be imported from
a Next.js client component, so `upgradeSheet.test.tsx` reads BOTH function bodies
and fails if the five codes and two statuses ever drift. The distinction that
matters is the one the web learned the hard way: a REFUSED checkout is not an
ABSENT one. Only 404 / 503 / `billing_not_configured` are "nothing to buy";
`fix_payment_method` offers the portal, `already_*` says so, and everything else
is a retry that must never read as "not for sale".

Three rules travel with it, and all three are asserted: no amount, trial or date
is written in the sheet (a price in the app needs a store release to change, the
server's needs a deploy); a 429 never opens it; a 403 without BOTH `feature` and
`requiresTier` never opens it. The last two are `classifyApiError`'s job and
`onPlanGate` in `app/_layout.tsx` is the only caller.

Native does NOT yet carry the web sheet's "See everything in Plus" link: the
native plan page is NP-050, and opening the web one in a browser would put a
second buy button on a surface this card deliberately keeps to one.

#### The plan page (`app/dashboard/plan`)

The sheet answers "why was I stopped?"; this answers "what is this and what
does it cost?". Before it existed the only way to learn either was to be told
no first, so `PlanCard`'s "See Plus" and the profile's `PlanRow` now LINK here
rather than raising a featureless sheet, and the sheet itself carries a "See
everything in Plus" link back.

Three things about it are structural rather than cosmetic:

- **`page.tsx` is a SERVER component and the client half takes props.**
  `FREE_LIMITS` / `FEATURE_MIN_TIER` are the source of truth for every cell in
  the table, and they live in `lib/entitlements.ts`, which imports mongoose. So
  the page reads them on the server and hands down plain rows. Nothing on the
  page is typed out by hand: add a feature to `FEATURE_MIN_TIER` and it appears,
  with its real allowance, on the next build.
- **Prices live in exactly one constant**, `PLAN_PRICING` in `lib/planCopy.ts`
  ($14.99/month, $119.99/year). Every derived figure — the $59.89 saving, the
  33%, the $10.00 a month — is recomputed from those two in
  `tests/unit/entitlements/planPage.test.tsx`, so editing one number and not the
  others fails the build. **They must match the Stripe prices**
  (`billing.stripePricePlus*`); nothing reads an amount back off Stripe.
- **Every other client reads those same strings over the wire.**
  `GET /api/billing/plans` (`app/api/billing/plans/route.ts` →
  `lib/billing/plans.ts`) serves the two prices, the renewal lines and the
  Free/Plus rows as DISPLAY STRINGS, built per request from `PLAN_PRICING`,
  `FREE_LIMITS`/`FEATURE_MIN_TIER`, `FEATURE_LABELS`, `FREE_FOREVER` and
  `RENEWAL_TERMS` — so a price change is a deploy and never an App Store
  release, and the web page and the API cannot disagree. No number crosses that
  wire and no client computes an amount. The schema is
  `BillingPlansResponseSchema` in `shared/api-client`;
  `tests/unit/billing/planPrices.test.tsx` renders the real plan page
  components and asserts every string in the response appears in that markup,
  then mutates `PLAN_PRICING` and watches the response follow it. It is NOT
  `/api/billing/status`: that one answers what is configured and what this
  member holds, this one what the plan costs and contains.
- **The free-forever list names the route that serves each claim**, and the same
  test asserts that route calls no entitlement guard (bar a cap the entry names
  itself, e.g. logging a workout is free while STARRING it is `custom-sessions`).
  It is `enforcementCoverage.test.ts` read backwards: that one fails when a
  feature is advertised and enforced by nothing, this one when a surface is
  advertised as free and has quietly grown a gate.

The CTA obeys the same rule as the sheet, one step further: a button is drawn
only when checkout is known to work AND **that billing period has a price**.
`checkoutAvailable` on the entitlements snapshot is a single bit for "monthly OR
annual", which is enough for the sheet (it only sells monthly) and not enough
here, so the page probes `GET /api/billing/status` for `plans.{monthly,annual}`.
Everything else — the state union, `checkoutRefusalState`, and every non-CTA
branch (`CheckoutAction`) — is imported from `UpgradeSheet.tsx`, so there is one
place in the app where "your card failed" stops meaning "not for sale".

With enforcement off the page does not `return null` (a route that renders
nothing is a blank screen); it returns a neutral card that names no tier, no cap
and no amount — `UnenforcedPlan`, exported from `PlanPageClient.tsx` so it can be
rendered in a test — and `uiSurfaces.test.tsx` pins it for what it must NOT
contain. **It still carries "Manage billing" for a member who holds a
subscription**; see the next section for why that is not an exception to the
launch-day contract.

#### "Manage billing" — the way OUT, and where it lives

The Terms (sections 9 and 10), the support page and the renewal line under the
buy button all tell a member to **choose Manage billing**. For a long while that
control did not exist: the only caller of `POST /api/billing/portal` was the
upgrade sheet's "Update payment method", which appears solely after checkout
refuses someone whose card has ALREADY failed. An active subscriber saw "You're
on Plus" and a date and would have had to email to cancel — the thing New York
GBL 527-a is written to stop.

Five rules, all asserted in `tests/unit/billing/manageBilling.test.tsx`:

- **The label is `MANAGE_BILLING_LABEL` in `lib/legal`**, interpolated into the
  Terms, the support page and `renewalLine()` AND rendered by the button. Never
  type the words out; the test fails if any of those surfaces stops matching.
- **Visibility is `hasManageableBilling(snapshot.subscription)`** in
  `lib/entitlementsClient.ts` — whether STRIPE holds a subscription, never the
  tier. Grandfathered members and admins are Plus with no customer and see
  nothing (the portal would answer `409 no_customer`); `past_due` derives to
  free and still sees it, because their card is the problem. `status: 'none'` is
  the row every member gets the moment they open checkout, so it does not count.
- **Two mount points, one rule.** `CurrentPlan` on the plan page (the card is
  all a subscriber sees there — the pricing block is hidden for Plus) and
  `components/billing/BillingSection.tsx` in Settings, which renders nothing for
  anyone without a subscription. The button itself
  (`components/billing/ManageBillingButton.tsx`) is pure and takes the portal
  state as a prop, because a control only reachable through an effect is one no
  test in this repo can see.
- **BILLING IS NOT A TIER SURFACE, so it does NOT bail on `enforced === false`.**
  The kill-switch governs whether TIER is enforced, not whether money is real —
  `lib/billing/apply.ts` applies webhooks regardless of it — so a member can hold
  a live subscription while the switch is off, and the switch is off by default.
  The first version of this fix put the button only in `CurrentPlan`, which sits
  *after* the plan page's `enforced === false` return: on a real deploy the
  button was on no screen at all, which is exactly what got reported. `Settings`
  never had it (`BillingSection` ignores the switch on purpose) and
  `UnenforcedPlan` now does too. A billing exit names no tier, no cap and no
  price, so nothing about the dark launch changes; the member it can appear for
  is one Stripe is charging, and that member must always be able to cancel.
  `manageBilling.test.tsx` asserts the whole thing in BOTH switch states.
- **One way to open it**: `openBillingPortal()` in `lib/billingPortal.ts`. Every
  failure — 503 (no portal configuration in the Stripe dashboard), 409, 502, a
  dropped connection — collapses to "didn't open, try again", never to "you have
  no subscription".

Rules that are easy to get wrong:
- **Read `canCreate`, never `allowed`.** `allowed` is true for a capped free
  member on purpose (that is what lets them edit and delete their own rows), so
  a create button wired to `allowed` is silently ungated.
- **Every tier surface must bail on `enforced === false`.** That single check is
  what makes the whole epic ship dark, and it is asserted in
  `tests/unit/entitlements/uiSurfaces.test.tsx`. A BILLING control is not a tier
  surface — see "Manage billing" above — and must survive the switch.
- `gateFrom` only accepts a 403 carrying BOTH `feature` and `requiresTier`, so
  an ownership or role 403 still falls through to the caller's normal error.
- UI locks are explanatory. The client fails OPEN (network blip → no lock); the
  server is the gate.
- Nutrition AI refusals arrive as `EntitlementRequiredError` from
  `lib/nutrition/aiEngine.ts`, threaded from `runStore`'s HTTP status. Check it
  BEFORE `PlateUnavailableError` or a paywall reads as an outage.
- **The follow-up ticket is a round trip, and half of it is client code.** The
  route mints it into the success body as `allowance.ticket`; `runStore.start`
  captures it onto the run record, `runAiTask` carries it on `AiTaskResult`,
  the estimator hands it out as `PlateEstimate.allowanceTicket`, and
  `SnapPlateModal` sends it back as `allowanceTicket` on a CORRECTION only. Any
  break in that chain compiles, passes the route-shape greps, and silently
  turns the correction into a second scan — so a free member's first "it was 6
  tacos, not 3" is refused. Never attach the last ticket to a fresh estimate:
  that makes a new outcome ride the previous charge, the same leak reversed.
  `tests/unit/allowance/followUpTicket.test.ts` drives the whole chain.

### Consent, age and email opt-out (go-live items 1, 12, 14, 15 — shipped 2026-09-13)

**`User.consent`** is the record that a member agreed to the Terms and Privacy
Policy and attested to the minimum age: `{ termsVersion, acceptedAt,
minimumAge, source }`. It is written by exactly three paths and read by one:
- the sign-up form's required tick → `send-link` stamps `LEGAL_VERSION` on the
  MagicLink → `verify-link` writes `consent` in the SAME save that creates the
  row (`source: 'signup'`);
- `components/ConsentGate.tsx` (mounted in the dashboard layout AND on
  onboarding) polls `GET /api/me/consent` once per app load and BLOCKS until
  `POST /api/me/consent { accepted: true }` succeeds (`source: 'gate'`). This is
  what covers Google, passkey, login-mode signups and every member from before
  the field existed. It fails OPEN on a network error, like every client lock.
- `POST /api/billing/checkout` also sends Stripe `consent_collection:
  { terms_of_service: 'required' }` and puts `termsVersion` in the session
  metadata. **Stripe refuses that parameter unless a Terms of Service URL is
  saved in the Dashboard (Settings → Business → Public details) on Become
  LLC's account.** The route catches that one refusal, logs
  `TERMS_URL_MISSING_LOG`, and retries once WITHOUT it under a different
  idempotency key, so a missed dashboard step degrades to "in-app record only"
  rather than "checkout is a 502". Any other Stripe error still throws.

`LEGAL_VERSION` (`lib/legal/index.ts`) is what "current" means: a stored
version that differs re-triggers the gate for EVERY member. Bump it for a
change a member must agree to again, not for a typo.

**Minimum age is 13** (`LEGAL_MINIMUM_AGE`, George 2026-09-13), attested by
the same tick (`CONSENT_STATEMENT` is the one sentence, shown by the form and
the gate). Under-18s use the Service with parent/guardian permission (Terms §4).
`PATCH /api/profile` refuses `profile.age < 13` with `400 age_below_minimum`,
and the onboarding input carries the same `min`.

**Sales tax is INCLUDED in the flat price** (George 2026-09-13). The Terms and
`RENEWAL_TERMS` say so; nothing may say "plus tax". The Stripe prices therefore
have to be configured tax-inclusive (`tax_behavior: inclusive`) on Become LLC's
account — a dashboard step, not code.

**Email (CAN-SPAM).** `emailFooter()` in `lib/email.ts` puts the postal address
(`LEGAL_ADDRESS_LINES`) on every outbound email. Engagement mail (streak
milestone / at-risk) also carries an HMAC unsubscribe link
(`lib/emailUnsubscribe.ts` → public `GET|POST /api/email/unsubscribe?u=&t=`,
no session, RFC 8058 `List-Unsubscribe` headers) that sets
`User.emailPreferences.engagement = false`; `lib/streak.ts` checks that flag at
send time and Settings → Email toggles it through
`/api/notifications/preferences` (`emailEngagement`). Sign-in links are
transactional: address only, no opt-out.

`HEALTH_DISCLAIMER_SHORT` is the in-app medical disclaimer (gate, onboarding
review step, Settings). It must never claim more than Terms §1 does.
Tests: `tests/unit/legal/consent.test.tsx`, `tests/unit/email/canSpam.test.ts`.

### Account deletion (store readiness, shipped 2026-09-24)

**Settings → Delete account → confirm**, on the web and in both store builds.
Apple checks this BY HAND (Review Guideline 5.1.1(v)): a reviewer signs in and
looks for it without leaving the app. Google Play's Data safety form asks the
same question from the outside and is answered by the PUBLIC
`/delete-account` page, which renders signed out and is in `LEGAL_LINKS` — that
list is what puts it in the landing footer and on every legal page.

**A request is a SOFT delete with a fixed 7-day reversal window**
(`RESTORE_WINDOW_DAYS`, `lib/accountDeletion.ts`). The window is what actually
happens; `LEGAL_DELETION_DAYS` (30) is what the Privacy Policy promises, and
the first must always be smaller than the second or §13 becomes a false
statement. `deletion.purgeAfter` is STORED, not derived on read, so changing
the window never moves a date a member was already given.

Five things about it that are load-bearing:

- **Push registrations are dropped at REQUEST time, not at purge time.** A
  member who has asked to be deleted must stop hearing from us that minute, and
  `models/PushSubscription.ts` holds both species — a web push endpoint and a
  native Expo token — so one `deleteMany` covers the web app and both store
  builds. `notificationsEnabled` is latched false in the same breath, or the
  background resync in `/api/notifications/subscribe` puts one back.
- **The restore link's HMAC IS the credential, and it is signed over
  `deletion.requestedAt`** (`lib/accountRestoreToken.ts`). There is no session
  to present, by construction. Binding it to the timestamp is what makes it
  expire with no TTL: cancel, or request again, and every link minted for the
  old request is dead. The link points at the PAGE; the API route's `GET`
  redirects rather than mutating, because mail scanners fetch every URL in an
  email before a person sees it, and a GET that cancelled a deletion would let
  a corporate mail filter undo it silently.
- **`lib/accountPurge.ts` is a declarative plan, not a function full of
  deletes**: `delete` for the member's own rows, `detach` for shared catalogue
  rows other members' logs reference (that is what the Privacy Policy means by
  "separated from you rather than deleted"), `pull` for an id inside somebody
  else's array, plus cascades for images keyed by their parent row.
  `tests/unit/account/deletion.test.ts` walks `models/` and fails the build
  when a model is neither purged nor in `PURGE_EXEMPT` with a reason — a
  collection added next month cannot quietly start surviving deletion.
- **The User row is deleted LAST, and only when every step answered.** A
  half-purged member whose user row is gone is a member whose data is
  unreachable and undeleted; leaving the row means the next sweep retries them.
- **One schedule, production only**:
  `.github/workflows/purge-deleted-accounts.yml` POSTs
  `/api/cron/purge-deletions` daily with `x-cron-secret`. Beta and production
  are two workspaces over one database, so a second schedule would be a second
  runner deleting the same rows. The route's `GET` is a dry run by
  construction — only a POST may delete a person.

Native specifics: the settings screen is
`expo/app/(app)/(tabs)/profile/health.tsx`, a hidden route (`href: null`) in
the `(tabs)` tree, so **the gear on the dashboard is the only way in** — without it the screen (and the deletion path) is unreachable in a
store build while still compiling. Android claims `/account/restore` with its
own `autoVerify` intent filter; iOS gets it from `applinks:become.redbtn.io`.
The confirmation phrase and the window are duplicated in
`expo/lib/account/deleteAccount.ts` because the webapp is zod-free and does not
import `@become/api-client`; `tests/unit/account/storeReadiness.test.tsx`
compares the two files so they cannot drift (a mismatch would 400 every native
deletion and nothing in either build would say so).

Tests: `tests/unit/account/deletion.test.ts` (window, MAC, purge plan),
`deletionRoutes.test.ts` (confirmation, the non-mutating GET, the cron secret),
`storeReadiness.test.tsx` (reachability on all three surfaces, including the
Expo sources, which it reads as text — it is the only check that can see both
codebases at once), and `expo/__tests__/deleteAccount.test.tsx`.

### Reviewer demo sign-in (store readiness)

**Apple and Google reviewers must be handed credentials that work** (App Store
Review Guideline 2.1; Play asks for the same in the release notes), and Become
is passwordless — there is no password to hand over, and a reviewer cannot read
the inbox a magic link lands in. So there is exactly ONE narrow door:
`POST /api/auth/review-sign-in`, one designated demo account, a fixed code held
in `BECOME_RUNTIME_CONFIG`, typed on the NORMAL sign-in screen (the web form's
"App reviewer? Use a review code" disclosure, and the same control on
`expo/app/(auth)/login.tsx`, which is both store builds).

Config lives in the runtime payload's `review` section:

```json
"review": { "enabled": true, "email": "app-review@become.redbtn.io", "code": "<≥12 chars>" }
```

Six things about it are load-bearing:

- **`review.enabled` must be exactly `true`.** The section defaults to off, and
  a config with no email, no code, or a code shorter than
  `REVIEW_CODE_MIN_LENGTH` (12) is treated as off — `resolveReviewAccount`
  collapses all four into the same `null`, which the route answers as a 404.
- **It is closeable without a deploy.** The route reads the config with
  `getRuntimeConfig({ maxAgeMs: REVIEW_CONFIG_MAX_AGE_MS })` — a new option, and
  the ONLY caller that passes it. `getRuntimeConfig()` otherwise caches for the
  life of the process, which is right for a Mongo URI and wrong for a switch:
  without a max age, flipping `enabled` would need a restart, and on RedRun a
  restart is a deploy. A refresh that throws keeps the cached value, so an
  unreachable secret store cannot take the app down.
- **The config names an address, and config can be wrong — so the ROW decides.**
  `User.isReviewAccount` is set once, by the route, on the account it creates.
  `ensureReviewAccount` refuses an existing row without it and
  `seedReviewAccount` refuses to write to one. A `review.email` typed as a real
  member's address therefore fails closed instead of handing a stranger that
  member's weigh-ins, meals and journal. Beta and production share one
  database, so "a real account" always means a real person.
- **Wrong account and wrong code are the SAME refusal** — same 403, same
  sentence (`REVIEW_INVALID_MESSAGE`), differing only in a `reason` that stays
  server-side. The door must not double as an oracle for which address is the
  demo account. Both comparisons run in constant time (`constantTimeEquals`);
  `===` on a shared secret leaks its length and its prefix.
- **Rate limited on TWO keys.** `REVIEW_MAX_ATTEMPTS` (5) per
  `REVIEW_ATTEMPT_WINDOW_MS` (10 min), counted per email AND per client address
  (`models/ReviewSignInAttempt.ts`, keys stored as SHA-256, TTL-swept). Either
  key alone is bypassable — rotate addresses to miss an email limit, rotate
  addresses-typed to miss an IP limit. The limit is checked BEFORE either
  comparison, so a locked-out caller learns nothing, and it refuses the CORRECT
  code too. A successful sign-in clears both keys: a reviewer must not be locked
  out of their second device by one fumble.
- **The data is written, not borrowed, and re-anchored to now.**
  `lib/reviewSeed.ts` puts the demo account on `tier: 'plus'`
  (`grandfathered: true`, and deliberately NO fake `subscription` block),
  onboarded, consented (Terms + AI), with 12 days of meals and moods, 28 days of
  weigh-ins, nine completed sessions, a catalogue program in progress plus its
  schedule, and Mind chapter 2 with a Vision. A streak is a fact about
  CONSECUTIVE RECENT days, so a seed written once reads as zero months later —
  each sign-in rewrites it, at most once every `SEED_MAX_AGE_MS` (6h) so two
  devices in one review session see the same thing. Every write is filtered by
  the demo userId.

Tests: `webapp/tests/unit/auth/reviewSignIn.test.ts` (the rules, the three-surface
reachability, the seed shape — no database),
`webapp/tests/unit/auth/reviewSignInRoute.test.ts` (the real handler against the
real database: the grant, a real member refused, the wrong code, the fifth-guess
lockout, the switch off) and `expo/__tests__/reviewSignIn.test.tsx`.

`REVIEW_SIGN_IN_PATH` is duplicated in `expo/app/(auth)/login.tsx` because the
native app cannot import from `webapp/`; the webapp suite compares the two
strings, so a rename cannot 404 every store-build review sign-in in silence.

### The store name and subtitle (store readiness)

**A shipped app carries three names and they are allowed to differ.** The
listing name (App Store Connect → App Information → Name, Play Console → App
name, 30 characters, has to be free across the App Store), the home-screen
label (`expo/app.json` → `expo.name`, which is `Become` and stays `Become` —
it becomes `CFBundleDisplayName` and Android's `app_name` at `expo prebuild`),
and the PWA install name (`webapp/lib/appChannel.ts`). Jon asked which one this
card was about; only the first one changes, so the icon under a member's thumb
says `Become` either way, which is what he asked for.

The strings, their character counts and the reasoning live in
**`expo/STORE_LISTING.md`**: `Become: Fitness & Mindset` (25/30) as the name on
BOTH stores, `Workouts, meals, mind sessions` (30/30) as the iOS subtitle, and
`Coach-built training, food logged from a photo, and short mind sessions.`
(72/80) as the Play short description. The name and the subtitle are indexed
together by Apple, so no word is spent twice across them.

Two things that document has to carry because no amount of code can replace
them: **a ladder, not a single name** — App Store Connect is the only thing
that knows whether a name is free, there is no API to ask, so it lists six
candidates to try in order (starting with plain `Become`), every one ≤30 and
every one starting with `Become`; and **the reservation is a human step**,
gated on the App Store Connect record (card `6ab0281d`) and the Play Console
record (`6ab02822`), with the sign-off table at the bottom of the document
recording who reserved what, when. No agent here has store credentials.

Test: `expo/__tests__/storeNameAndSubtitle.test.ts` re-derives every count from
the strings, re-checks each against its store's limit, and fails if the two
store names drift apart, a ladder rung stops reading as Become, the
home-screen row stops matching `app.json`, or `RELEASE.md` stops pointing at
the document. Listing copy (description, keywords, screenshots) is card
`6ab0282c` and is not in there.

### The native navigation shell (NP-003)

`expo/app/` is three things and a redirect:

| Path | What it is |
|---|---|
| `app/index.tsx` | The launch decision: spinner → `/login`, `/onboarding` or Home |
| `app/(auth)/` | `login`, `verify`, `account/restore` — **no session required** |
| `app/(app)/` | AuthGuard → ConsentGate → OnboardingGuard, then the Stack |
| `app/onboarding.tsx` | Signed-in, but deliberately OUTSIDE `(app)` |

Four rules, each of them a bug that shipped:

- **A group is invisible in a URL.** `/login`, `/verify` and `/account/restore`
  are unchanged, which is what `app.json`'s associated domains and Android
  intent filters claim, and `/(tabs)/…` hrefs still resolve inside `(app)`.
- **Nothing above a route may replace it.** The cold-open gate in
  `app/_layout.tsx` used to `router.replace` its verdict on every launch, and a
  cold start on `/verify?token=…` lost the race: the token was spent and
  sign-in was on screen. The gate now only signs out after a failed unlock;
  the destination is decided by `app/index.tsx`, which exists only on a launch
  with no link. `app/+native-intent.tsx` is where a link may be rewritten
  (a pass-through until NP-034's web-path resolver).
- **Every folder under `(tabs)` needs its own `_layout.tsx`.** Without one,
  expo-router flattens the folder into the TAB navigator: the bar shipped with
  20 buttons, including `programming/[id]/workout/[idx]/live`, and `profile`
  matched no route at all so Settings was a tab. One Stack per tab
  (`components/navigation/TabStack.tsx`) makes each folder one screen and every
  detail a push, with the iOS back swipe.
- **Onboarding is gated on `onboardingCompleted === false`, strictly**
  (`expo/lib/auth/onboardingGate.ts`, mirroring
  `webapp/components/AuthGuard.tsx`). Legacy rows have no flag and must not be
  gated. And `/onboarding` cannot live inside `(app)`, or the gate would
  redirect to a route behind itself.

Tests: `expo/__tests__/navigation-shell.test.tsx` (the bar and the per-tab
stacks) and `expo/__tests__/launch-and-links.test.tsx` (launch destinations and
cold-start links) render the REAL layouts over the real `app/` directory via
`expo/test-support/appRoutes.tsx`, so a screen file added tomorrow is in the
render tomorrow. The array-shaped `TabLayout.test.tsx` they replace was green
throughout the 20-slot bar.

#### The tab bar is the web's tab bar (NP-013)

`webapp/components/BottomNav.tsx` is the source of truth for tab ORDER, LABELS
and ICONS, and native now matches it: **Workout, Mind, Home, Nutrition** —
lucide `ClipboardList`, `Brain`, `Home`, `UtensilsCrossed`, with Home in the
middle where the thumb is. Native used to ship its own set (Home, Programs,
Mind, Nutrition, Chat), so the two clients disagreed about what the app is
called in four places out of five.

Community is absent because the web hides it too
(`webapp/components/FeatureGuard.tsx` answers "Coming soon" to everyone but an
admin). The rule that travels: **tab order and names follow the web's
BottomNav, minus Community while it is hidden.**

Two things that look like mistakes and are not:

- **The `programming` folder is the Workout tab.** Only the label changed; the
  folder keeps its name because renaming it breaks every
  `/(tabs)/programming/…` href in the app, and the screen behind it stays
  today's programs list until NP-071 ports the web's workout home.
- **`chat` is still in the `(tabs)` tree**, as a hidden tab (`href: null`). It
  is NP-032 that removes those routes, behind
  `EXPO_PUBLIC_COMMUNITY_ENABLED`; there is deliberately no second flag in the
  tab bar.

#### The buttons that lead somewhere (NP-026)

A screen with no entry point is not a screen. Three of them shipped that way,
and two buttons shipped inert:

- **`onStartWorkout` and `onStartLive` are REQUIRED props.** Both defaulted to
  `?? (() => {})` inside the component and neither route passed one, so Start
  workout (`DashboardScreen`) and Start live workout (`WorkoutOverview`)
  rendered, pressed, animated and went nowhere — in files that compiled and
  under tests that were green. A required prop makes the next omission a `tsc`
  failure (TS2741), which is the only check that can see a route that forgot.
- **The dashboard opens the workout overview by DAY LABEL.** The web's Continue
  link is `…/workout?day=<label>`; the native routes address a workout by its
  index inside the phase, so `current-workout`'s `day` goes through
  `workoutIndexFromDayLabel` (`lib/schedule/scheduleSlots.ts` — the calendar's
  own mapping) and its 1-based `phase` becomes the 0-based `?phase=`. NP-078 is
  what teaches the native routes about day labels; until then the two screens
  share one mapping so they cannot disagree.
- **Search, Saved and the calendar are pushed from the programs header**, and
  the calendar from the dashboard as well — inside NP-003's per-tab stacks, so
  Back returns to the list and the tab bar never moves. The web carries search
  and saved on the Workout page itself and links the calendar from the week
  strip; native has them as three separate screens and nothing pushed any of
  them.
- **The gear, its `testID`, its `accessibilityLabel` and the settings push are
  unchanged on purpose**: `webapp/tests/unit/account/storeReadiness.test.tsx`
  string-matches them to prove Delete account is reachable in a store build.

Test: `expo/__tests__/training-entry-points.test.tsx` renders the REAL route
tree (`test-support/appRoutes.tsx`) and taps the tab bar, so "two taps from the
tab bar" is a render rather than a claim.

Until NP-083, NP-074 and NP-069 land, this wiring makes three native paths that
write wrong data reachable (swap renaming, enrolment without a start date or a
schedule, schedule settings that regenerate into the past). Beta shares
production's database (NP-008), so pointing a build at beta is no protection:
builds carrying this wiring are used only with named test accounts.

#### `_` is not a private prefix in expo-router, and the theme follows the system

Two store-readiness facts that landed with the tab bar:

- **expo-router ignores exactly `+api`, `+html` and `+native-intent`**
  (`getIgnoreList`, `expo-router/build/getRoutesCore.js`). A leading underscore
  is a Next.js habit that buys nothing, so `expo/app/_stories.tsx` — the
  component gallery — shipped as a LIVE route at `become://_stories`, and the
  two read-only admin lists under `expo/app/(app)/admin/` were behind a
  client-side role check, which is a blocked screen and not an absent one. All
  three are now wrapped in `devOnlyRoute()`
  (`expo/lib/dev/devOnlyRoute.tsx`): the screen in a development build, a
  `Redirect` to Home in anything else. NP-122 deletes the admin code and adds an
  admin-only link to the web. Tests: `expo/__tests__/dev-only-routes.test.tsx`
  opens all three URLs with `__DEV__` flipped both ways.
- **Light and dark both ship, and the system picks (NP-123).** The web follows
  `prefers-color-scheme` (`webapp/app/layout.tsx` toggles the `dark` class from
  the media query) and native now does the same:
  `followSystemColorScheme()` (`expo/lib/theme/colorScheme.ts`) runs at MODULE
  LOAD in `expo/app/_layout.tsx` — not in an effect, or there is one frame in
  the wrong theme on every cold start — and `expo/app.json` says
  `userInterfaceStyle: "automatic"`.

  **The rule that makes it hold: there are no colour literals.** NP-013 pinned
  dark for exactly one reason — 43 `#0a0a0a` literals sat in plain RN `style`
  objects (a SafeAreaView, a Stack's `contentStyle`, the tab bar, a lucide
  `color`, a modal backdrop) while the classes beside them followed the system,
  so a phone in light mode drew light-mode text (`--foreground: 24 24 27`,
  near-black) on those near-black surfaces. Every one of them is now a Tailwind
  class or a value from **`useThemeTokens()`** (`expo/lib/theme/useThemeTokens.ts`),
  which reads NativeWind's colour scheme — the same signal `bg-background`
  resolves against — so a class and a `style` on one screen cannot disagree and a
  live flip re-renders both. A hex colour in `expo/app`, `expo/components` or
  `expo/lib` is now a LINT ERROR (`no-restricted-syntax` in
  `expo/eslint.config.mjs`) and a test failure
  (`expo/__tests__/noHexColorLiterals.test.ts`).

  Three things the hook cannot do with a class, and where they live instead: the
  window background is `useThemedWindowBackground()` via `expo-system-ui`
  (`app.json`'s `backgroundColor` is applied before JS and can only be one
  colour, so it stays the dark one and is repainted while the splash is up); the
  status bar is `<StatusBar style={statusBarStyle} />`; the launch screen is two
  assets — `splash-icon.png` (white mark, `#0a0a0a`) and
  `splash-icon-light.png` (the same mark in zinc-900, `#fafafa`), both written by
  `expo/scripts/generate-app-assets.mjs`, because a white mark on a light splash
  is an empty launch screen. Token values are the web's zinc/red/amber/green
  pairs, and `expo/global.css` and `expo/lib/theme/tokens.ts` are compared by the
  test so they cannot drift. Test:
  `expo/__tests__/themeFollowsSystem.test.tsx` (it replaced `darkModePin.test.tsx`),
  including WCAG contrast for every text/surface pair in BOTH modes — the web
  shipped a dark-mode chart bug, so legibility is asserted rather than eyeballed.

#### The web's typeface, on the phone (NP-160)

The web has set **Geist** and **Geist Mono** since the first commit
(`webapp/app/layout.tsx` → `next/font/google`, fed to Tailwind's `--font-sans` /
`--font-mono` in `globals.css`). Native loaded no font at all, so every screen
drew in San Francisco or Roboto and the two clients read differently side by
side. Four facts, each of them a bug that would otherwise ship:

- **Eight files live in the repo**, not on a CDN: `expo/assets/fonts/` holds
  Geist and Geist Mono at 400/500/600/700 (Google Fonts' latin subset — the same
  files the web serves — under the SIL Open Font License, `OFL.txt` beside
  them). `expo-font` registers them from the bundle, so the app works offline
  and in Expo Go.
- **`fontFamily` names a FACE, not a family plus a weight.** A browser
  synthesises every weight from one variable file; React Native cannot — an
  unavailable `fontWeight` is ignored on iOS (a runtime-registered font is a
  family of one) and faked on Android. `expo/lib/theme/fonts.ts` maps
  family × weight → face, so `font-mono font-bold` resolves to exactly one file.
  CSS cannot express that pairing, which is why it is resolved in JS and applied
  INLINE — NativeWind sorts inline above className (`specificityCompare` in
  react-native-css-interop), so it outranks `tailwind.config.js`'s `font-sans` /
  `font-mono` instead of fighting them.
- **React Native has no cascade, so the app owns its Text.** A `<Text>` with no
  `fontFamily` is the system font whatever the Tailwind theme says. Every screen
  and component imports `Text` from `expo/components/Text.tsx`, and ESLint's
  `no-restricted-imports` fails the build on `import { Text } from
  "react-native"` under `app/` or `components/`. `components/Input.tsx` does the
  same by hand for the app's one `TextInput`.
- **The launch screen is held until the faces are registered.**
  `holdSplashForFonts()` runs at MODULE LOAD in `expo/app/_layout.tsx` (an
  effect is one frame too late — the same reason `followSystemColorScheme()` is
  there), the
  layout renders `null` until `useGeistFonts()` says ready, and the hook hides
  the splash. React Native does not re-render a `<Text>` when a font arrives, so
  a frame painted early keeps the system font for the life of that screen. A
  load FAILURE also counts as ready: the system font is ugly, a splash that
  never lifts is a dead app.

Test: `expo/__tests__/geistFont.test.tsx` parses the `.ttf` headers (weight and
name table, so a 404 saved as `.ttf` cannot pass), walks `app/` and
`components/` for a stray `react-native` Text import, drives the splash gate
through loading / loaded / failed, and reads `webapp/` so the web changing
typeface fails the native suite. `expo/__mocks__/expo-font.js` answers "loaded"
everywhere else, so no other suite has to await a font.

#### The accessibility baseline (NP-124)

The primitives carried roles and labels from the first component pass — 38
`accessibilityRole`s, 55 `accessibilityLabel`s — and **nobody had opened the app
with VoiceOver on or the text size at its largest**. Counting labels is not a
test: the settings gear was a 36-point target, the modal backdrop was a
full-screen "Close modal, button" in FRONT of every dialog, a button that started
loading lost its name (the spinner replaces the label, and a spinner has no
name), the streak message was read as a fragment unrelated to the streak, the
sheet's grab bar announced a gesture VoiceOver cannot make, and "Log weight" /
"Skip today" sat side by side at their intrinsic width — which at the largest
Dynamic Type size is wider than the phone. Full detail and the device checklist:
`expo/ACCESSIBILITY.md`.

Four rules, each of them one of those bugs:

- **Every interactive element has a role AND a label.** The label may be the
  words inside the control, but `expo/components/Button.tsx` computes it
  (`accessibleName`) because `loading` swaps the label for an
  `ActivityIndicator`. `Toggle`'s `accessibilityLabel` is a REQUIRED prop — a
  switch has no words of its own and the row label beside it is a different
  element, so a type error is the only check that catches the next omission (the
  same trick as `onStartWorkout`). A group that reads as one fact is ONE element
  (`accessible` plus a composed label: `streakAccessibilityLabel`,
  `todayWorkoutSummaryLabel`), and decoration is HIDDEN rather than described.
- **44 × 44 points, two ways** (`expo/lib/a11y/touchTarget.ts`):
  `minTouchTarget` grows the view where growing is invisible; `hitSlopToMinTarget`
  grows only the touchable area where the size is the design — the 48 × 28 switch
  track takes 8 points of vertical slop instead of becoming 44 tall. NativeWind
  padding is not a target: a className is never resolved in jest, and `p-2` around
  a 20-point icon is exactly how the gear came to be 36 points.
- **Dynamic Type is never capped, and what breaks is layout.** Nothing sets
  `allowFontScaling={false}` (the tab bar's labels are react-navigation's, which
  turns scaling off on iOS 13+ on purpose and uses the Large Content Viewer).
  **React Native's `flexShrink` is 0 where CSS's is 1**, so a `<Text>` in a flex
  ROW keeps its intrinsic width at any scale and runs off the end instead of
  wrapping — that is what "the label is cut off" always is. Text in a row gets
  `WRAPPABLE_TEXT`, rows of controls get `flex: 1` wrappers
  (`expo/lib/a11y/dynamicType.ts`).
- **Reduce Motion is honoured, and the rule travels.** React Native applies none
  of it: `Modal.animationType` animates, moti animates, every Reanimated
  `withTiming` runs. `useReducedMotion()` reads the setting and follows
  `reduceMotionChanged` live; `modalAnimation()` turns the fade and the slide into
  a cut. A file importing `moti` or `react-native-reanimated` must also reach for
  the hook, and the suite sweeps the sources for the first one that does not — a
  reduced-motion bug is invisible to everybody whose phone has the switch off,
  which is everybody who builds it.

Two iOS/Android facts that shape the code: `accessibilityLiveRegion` is a
TalkBack prop and does NOTHING on iOS, so every replaced-content state change
also posts `AccessibilityInfo.announceForAccessibility`
(`expo/lib/a11y/announce.ts`); and a modal is confined with
`accessibilityViewIsModal` and dismissed with `onAccessibilityEscape` (the
two-finger scrub), which is what replaces the backdrop-as-button.

Tests: `expo/__tests__/accessibility.test.tsx` RENDERS the v1 screens (sign-in in
both states, the consent seam, onboarding first and last step, Home with and
without the check-in modal, Settings with and without the delete confirmation)
and walks the tree the way a screen reader does (`expo/test-support/a11y.ts`),
including driving sign-in → onboarding → Home **using only queries by role and
accessible name**; `expo/__tests__/reducedMotion.test.tsx` drives the hook through
the system setting and both overlays with it. What they cannot do is lay text out
or speak: jest has no text engine, so "nothing is cut off" is enforced as the
absence of the constructions that cut text off (`allowFontScaling={false}`,
`numberOfLines`, `ellipsizeMode`, a fixed height around text, an unshrinkable
child of a row) plus a render at 3.12×. The reading ORDER and the swipe path are
hardware facts, and they are `ACCESSIBILITY.md`'s device checklist, which
`RELEASE.md` now gates a candidate build on. **The native plan page is not in the
walk because it does not exist** (NP-050/NP-053); the suite fails the day a route
with "plan" in its name appears, which is the reminder to add it.

### Photos: the camera, the picker, and an image that needs the session (NP-059)

Three modules (`expo-camera`, `expo-image-picker`, `expo-image-manipulator`) and
three files, and every photo surface that follows — meal and recipe photos
(NP-143/144), feedback screenshots (NP-162), the avatar (NP-163), food flags
(NP-174), the barcode scanner (NP-088) — is meant to reuse them rather than
reach for the modules directly.

- **`expo/lib/media/capture.ts`** takes a photo or picks one and returns a JPEG
  `uri` **and** a `data:image/jpeg;base64,…` URL, because multipart wants the
  first and the AI routes take only the second (`webapp/lib/blobToBase64.ts`).
  **The resize parameters are the WEB'S**: `PLATE_PHOTO_RESIZE` is 1024 / 0.6
  (the plate scan, the food report, the evidence picker) and
  `MEAL_PHOTO_RESIZE` is 1600 / 0.82 (`webapp/components/meals/MealForm.tsx`) —
  a vision call is billed against the member's allowance, so the same tap has
  to spend it on the same picture on both clients. `targetSize` reproduces
  `resizeImageToBlob`'s branch: cap `max(w, h)`, scale the other edge, never
  enlarge. A REFUSAL IS A RESULT, not a throw:
  `{ status: "permission-denied", canAskAgain, message }`, rendered by
  `components/media/PermissionDeniedNotice.tsx` with the way to Settings.
- **`expo/lib/media/upload.ts`** posts `{ uri, name, type }` — React Native's
  FormData streams the file off disk itself — through the shared client's `raw`
  call, so an upload carries the same Bearer token as every other request.
  Never set `Content-Type`: the multipart boundary belongs to the networking
  layer. `file` is the field for `/api/nutrition/{scans,flags}/image`, `image`
  for `/api/meals/{id}/image`.
- **`expo/components/media/AuthedImage.tsx`** is how a per-member image is
  shown. `<Image source={{ uri: "/api/blob/…" }}>` cannot work: the path has no
  origin and an `<Image>` sends no header, and the blob route answers **404**
  (not 403) to anyone who is not the owner. So `lib/media/authedBlob.ts`
  prefixes `WEBAPP_BASE_URL`, fetches with the Bearer token and hands over a
  `data:` URL. Two rules live there: the token only ever goes to the Become
  origin (anything else is `refused`, unsent), and **a member's image is never
  cached where another account on the device could read it** — memory only,
  capped, keyed by the token that fetched it, and emptied by `AuthProvider` on
  sign-out.

iOS asks with the sentence in `app.json`, and `lib/config/permissions.ts` is
still the one place that rule lives. Both plugins are given
`microphonePermission: false`, which makes them DELETE
`NSMicrophoneUsageDescription` instead of writing Expo's own placeholder for a
feature that records no audio; the rule understands that opt-out and requires it
to be unanimous and to agree with `ios.infoPlist`. Android declares `CAMERA` and
not `RECORD_AUDIO`.

Tests: `expo/__tests__/mediaCapture.test.ts` (the web's numbers, read out of the
web's own source; the default path through the real module calls; every
refusal), `mediaUpload.test.ts`, `authedImage.test.tsx` (the 404, and that a
second session never reads the first one's bytes) and
`permissionDeniedNotice.test.tsx`.

### CI runs four packages, not one

`.github/workflows/ci.yml` has four jobs, because the repo is four packages
with four lockfiles:

| Job | Package | Runs |
|---|---|---|
| `verify` | `webapp/` | typecheck, unit tests (real Mongo service), production build |
| `expo` | `expo/` | `tsc --noEmit`, `eslint .`, `jest --ci`, `expo install --check`, `expo export --platform ios` |
| `shared-api-client` | `shared/api-client/` | `npm test`, `tsc --noEmit` |
| `shared-core` | `shared/core/` | `npm run build`, `npm test`, `npm run typecheck` |

`expo`, `shared-api-client` and `shared-core` run only when `expo/`, `shared/` or `ci.yml`
itself changed, and they are gated by the `changes` job's `if:` rather than a
workflow-level `paths:` filter **on purpose**: a filtered-out workflow never
reports, and a REQUIRED check that never reports blocks the merge forever. A job
skipped by `if:` reports as skipped, which branch protection accepts. Neither
native job writes an `.npmrc`: `expo/`, `shared/api-client/` and `shared/core/` have no
`@redbtn/*` dependency, so the public registry is enough —
`webapp/tests/unit/ci/nativeJobs.test.ts` fails if one ever lands there, and it
lives in the webapp suite because that is the job that always runs, so deleting
the native jobs cannot go unnoticed.

**The `expo` job's last step is the only one that BUILDS the app.**
`npx expo export --platform ios` exists because tsc reaches
`@become/api-client` through `tsconfig.json` `paths` and Jest through
`moduleNameMapper`, and **Metro reads neither**: both were green for weeks while
the bundler could not resolve the shared client at all and no store build of any
kind could be produced. Metro's only route to it is the `file:` link in
`expo/package.json` plus `watchFolders` / `nodeModulesPaths` / `blockList` in
`expo/metro.config.js` — the three of them are explained in `expo/README.md`
("The shared API client") and asserted by `expo/__tests__/metroConfig.test.ts`.
`shared/api-client` stays a plain sibling package: the webapp keeps importing it
through its own tsconfig path exactly as before.

#### The shared pure logic package: @become/core (NP-017)

`shared/core/` (`@become/core`) contains pure business logic, calculations, and domain constants shared between `webapp/` and `expo/` without React or Node-only dependencies. It compiles to dual ESM/CJS and `.d.ts`. Seeded modules include `bodyUnits`, `goals/pace`, `goals/status`, `nutrition/tdee`, `entitlements` (tier model, limits, gate copy, 403 parser), `legal`, `planCopy` (`PLAN_PRICING`, `ANNUAL_SAVING_LINE`), and pure account deletion logic.
- Both `webapp/` and `expo/` import from `@become/core`.
- `webapp/` consumes `@become/core` as a real published package from `https://registry.redbtn.io/` (resolved via `@become:registry` in `.npmrc`), with `lib/` files re-exporting from `@become/core` for backwards compatibility. Never use `../shared` or tsconfig paths in `webapp/`.
- In `expo/`, `@become/core` is linked as a `file:../shared/core` dependency in `expo/package.json` and resolved cleanly by Metro bundler.
- Any PR changing `shared/core` MUST bump its version in `shared/core/package.json`.
- **`src/training/` is COPIES of `webapp/lib/**`, and they are never edited there (NP-058).** The training, streak and dashboard-tile modules (`workoutUtils`, `workout/*`, `quickSession/{naming,log}`, `streaks/{tile,pillars}`, `dashboard/goalTile`, `dashboardLayout/{types,defaults}`, `videoTrim`, `videoFraming`) sit under the same relative paths they have in `webapp/lib`, so a re-copy is a file-for-file overwrite. `expo/` imports them from `@become/core`; the webapp still imports its OWN module, because webapp code may never import `../shared/*`. `webapp/tests/unit/nativeParity/trainingModules.test.ts` (in `verify`, which always runs) drives both over one fixture table and fails the moment an answer differs — including when a new web export has no fixture. A behaviour change lands on the WEB first and is then re-copied; the procedure is in `expo/README.md` ("Re-copying a training module after a web change"). When the webapp switches to the published package, the copies and that test go away together.
- Until redsync's app-repo fixes land, publishing a new `@become/core` version is a manual step: publish from clean main with publisher credentials to `https://registry.redbtn.io/`, verify `npm view @become/core versions`, and update `webapp/package.json` with `npm install --package-lock-only`.

#### The copied Mind domain and its drift tests (NP-062)

The Mind session path, deterministic composer, move builders, XP/chapter maths
and speech matcher live in `webapp/lib/mind*`, `webapp/lib/mindXP.ts`,
`webapp/lib/mindContent.ts` and `webapp/lib/ai/sanitize.ts`. `@become/core`
carries a COPY of all 22 of those modules (`shared/core/src/mind*`,
`shared/core/src/ai/sanitize.ts`) so the native app can run the same behaviour.

- **The web file is the source of truth.** Composer and XP changes land on the
  web first. `webapp/` does NOT import them from `@become/core` yet (RedRun
  builds `webapp/` alone); it keeps its own module until the package is
  published and the webapp switches over.
- **Write the copy with the script, never by hand:** `node scripts/vendor-mind.mjs`
  (`--check` just reports). The only edit it makes is rewriting the webapp's
  `@/` import aliases. `GuidedStep` — the one type the copies needed from a
  component — travels with them as `shared/core/src/mind/guidedStep.ts`.
- **Three suites hold it together.** `webapp/tests/unit/mindDrift.test.ts` fails
  when a copy is not its web source verbatim; `webapp/tests/unit/mindParity.test.ts`
  fails when the copy and the web disagree behaviourally across 360 contexts
  (seeds × chapters × states × path positions) or when the committed fixtures no
  longer match the web; `shared/core/tests/mind.test.ts` and
  `expo/__tests__/mind.test.ts` hold `@become/core` to those same fixtures.
- **The fixtures are generated, not written:**
  `cd webapp && npx tsx scripts/gen-mind-fixtures.ts` writes
  `shared/core/tests/fixtures/mindParity.json` from the WEB modules. Change the
  composer or the XP maths on the web and you must re-run the vendor script AND
  the generator in the same commit, or `verify` goes red.
- `expo/tsconfig.json` typechecks `shared/core/src` with `noUncheckedIndexedAccess`,
  so the web sources carry type-only non-null assertions on provably in-range
  index reads. They erase at compile time and change no behaviour; keep them
  when you edit those files or the `expo` job fails.

#### The Mind session player, natively (NP-098)

`expo/components/mind/session/` plays a composed plan the way the web does: a
full-screen modal with intro → the moves, one at a time, with back / exit → the
payoff. `SessionPlayer.tsx` is the only file that sequences; the scenes are dumb
and fulfil **the web's own `SceneProps`**, re-exported as `MindSceneProps` in
`scenes/types.ts` — so there is one definition of what a scene is handed
(`webapp/lib/mind/moves.ts`, vendored by NP-062) and `move`, `protocol`,
`onDone`, `onState` and `preview` mean the same thing on both clients.

Four rules travel with it, each of them web behaviour a native port silently
loses:

- **The check-in re-opens the OPENING only.** The plan was composed before it was
  played (the AI plan is cached for hours), so it was built for the state they
  felt LAST time. `realignOpening` swaps move 2 — the regulate beat — and the
  path body, with every word the composer personalised into it, survives. No
  `sessionContext` prop, no realignment: the plan plays exactly as composed.
- **The check-in IS the first answer** (`"How I checked in today"`), recorded
  before anything else, and **answers keep the latest value per question**, so
  re-answering after a Back overwrites instead of duplicating.
- **A `locked_in` check-in plays `altPositive`** instead of the breath, and the
  SWAP is what the player reports — a locked-in session is never recorded as
  having breathed.
- **Breath timing is the protocol's, and the protocol is the web's.** Every
  label, `durationMs` and round count comes from `BREATH_PROTOCOLS` /
  `breathForState`; `'auto'` is resolved by the player, never by the scene.
  Native adds one thing a browser cannot: **a light haptic per phase change**
  (`expo-haptics`, through `lib/feedback/haptics.ts`, which swallows every
  failure — a simulator has no engine and a missing buzz may not take a session
  down). The in-phase clock is tagged with the phase instance it is counting,
  because the stepper's timeout and the clock's tick come due on the same
  millisecond and the outgoing phase's last tick was landing on the incoming one.

**Any kind that is not ported yet renders as the web's hold-to-affirm**
(`scenes/HoldToAffirmScene.tsx`, the identity beat's press-and-hold ring). That
is not a placeholder for its own sake: a plan is a CHAIN, and a beat with no
scene strands the member on it, so every plan recorded on the web plays through
to the end. NP-103 (content scenes), NP-099 (speech) and NP-100 (mirror) each
replace their kind by touching `SessionPlayer`'s dispatch alone.

**The payoff here is the shortest honest close, and the player performs NO
write.** XP, the two counters, the journal write and the AI reflection are
NP-101; `onComplete` is the seam it hangs off and already carries the effective
kinds, the answers and the live state.

One platform fact shapes the shell: **a visible React Native `Modal` consumes the
Android back press itself and delivers it as `onRequestClose`**, so there is no
`BackHandler` subscription (a listener underneath fires as well and the session
jumps back two beats). Back steps through the session, and only asks to leave
when there is nowhere left to step — leaving is always confirmed, never silent.

Tests: `expo/__tests__/mindSessionPlayer.test.tsx` plays a plan **composed by the
web's own composer** from a fixed context and seed, and takes its realignment
expectations from `realignOpening` rather than from a copy of its answer;
`expo/__tests__/mindBreathScene.test.tsx` drives every phase of every protocol in
fake time and reads the phases, counts and round totals out of the web tables.

#### The contract test: what the native app is actually sent (NP-016)

`webapp/tests/unit/contract/` calls the REAL route handlers against the
loopback test database with signed tokens and parses every response with the
schema `shared/api-client` exports, imported **by relative path**. It exists
because nothing failed when the web changed a response: about 680 webapp
commits have landed since 2026-05-31 against 4 in `expo/` and `shared/`, and
`shared/api-client/tests/schemas.test.ts` parses hand-written fixtures, which
agree with the schema by construction and say nothing about what a route
returns.

Four things about it:

- **It lives in `verify`, the job that always runs**, because that is where web
  changes are. A failing contract test blocks the web PR, and the fix is to
  update the shared schema IN THAT PR — never to loosen it to `z.unknown()`.
- **"It parses" is not the test.** Every response schema is `.passthrough()` so
  a shipped store build survives a server that grew a field — and that same
  tolerance is what lets a RENAMED field sail through `schema.parse()` as an
  unknown extra while the field the app reads is gone. `assertContract` also
  fails on any key the response carries that the schema does not declare, at
  every depth, and on any key the native app reads that the response no longer
  carries.
- **Tests may import `shared/api-client`; app code may not.** `webapp/Dockerfile`
  builds with the build context set to `webapp/` (`COPY . .`), so `../shared`
  is not in the image and an import from a route would typecheck on a dev box
  and fail the production build. That is why `webapp/lib/sharedApiTypes.ts` is
  still a hand copy — of the auth shapes only; `zod` is now DECLARED in
  `webapp/package.json` for it instead of being borrowed from a hoisted
  transitive copy, and `tests/unit/contract/sharedApiTypes.test.ts` compares it
  with `shared/api-client` key for key, so the two cannot disagree in silence.
- **The route list is a manifest, and it is checked.**
  `np015Routes.test.ts` declares the 24 routes NP-015's schemas describe and
  fails if one of them was never called, so a manifest entry cannot pass for
  coverage. A domain ticket (NP-018 … NP-024, NP-037, NP-202) adds its own file
  with its own manifest; the recipe is in `tests/unit/contract/_contract.ts`.
  `np019Programs.test.ts` is the programs domain: 22 routes, its OWN fixture
  members (`@np019.contract.test`) rather than the shared np015 pair, because
  the runner executes test files in parallel and two files sharing a row race.
  `np021Schedule.test.ts` is the schedule domain: four routes, plus a second
  gate that every one of the eight PATCH actions was actually sent — one
  manifest entry for `PATCH /api/schedule` would otherwise pass for coverage of
  a single action. `np018Workouts.test.ts` is the workouts domain: 15 routes,
  plus a second gate that BOTH halves of the `POST /api/workouts` union
  (program | quick) were actually sent, and a third that
  `webapp/lib/sharedApiTypes.ts` carries no workouts shape at all. Run it with
  `CONTRACT_DUMP=1` and it prints every body — that is where the fixtures in
  `shared/api-client/tests/workoutsSchemas.test.ts` come from. They are recorded
  from the beta HANDLERS against the loopback test database and never from the
  live beta site: beta shares production's MongoDB, so a recording taken there
  would be a member's real data.
  `np024Nutrition.test.ts` is the food-log domain: twenty
  routes, its own member (`@np024.contract.test`), and `tz=0` on every read so a
  "local day" is the UTC day.

The nutrition contract (NP-024) lives in
`shared/api-client/src/schemas/nutrition.ts` and carries four rules, stated at
the top of that file and asserted by `np024Nutrition.test.ts` against the real
handlers:

- **Nutrition is PER SERVING of the default variant, never per 100 g.**
  `webapp/lib/foodMath.ts` scales a variant's stored block by
  `quantity / servingSize`, with `gramsPerServing` / `mlPerServing` as the
  cross-family bridge and the only honest weight a count-native serving (`each`,
  `slice`, `scoop`, `serving`) has. An OpenFoodFacts import looks per-100-g only
  because its `servingSize` IS 100; a bar whose serving is "1 each (60 g)" is
  not, and anything assuming /100 logs a hundredth of a bar.
- **Food `source` is `usda` | `openfoodfacts` | `manual`.** There is no `off` —
  that string is only the `off-<code>` id PREFIX of a live search hit.
- **A Recipe's per-serving macros live in `totalsPerServing`**
  (`webapp/models/Recipe.ts`). The shared schema used to say `nutrition`, which
  no handler has ever sent, so the native recipe screen showed 0 kcal for every
  recipe ever published. `RecipeNutritionSchema` survives as a deprecated ALIAS
  of the totals shape; the KEY is gone.
- **The canonical day is `GET /api/meal-logs?date=&tz=` → `{ logs, dailyTotals }`.**
  The legacy `GET /api/nutrition/log` day is kept because it is still the only
  source of `water`, `quickAdds` and `goals`, and because its `dailyTotals`
  INCLUDE quick adds (the canonical day's do not) — which is what the web
  dashboard reads. Its `meals[].foods[]` is a compat projection that cannot
  express an untimed log, a custom tag, or more than one entry per meal.

`MealLogResponseSchema`, `MealLogFoodSchema`, `MealLogMealSchema`,
`FoodNutritionSchema`, `FlexNutritionSchema`, `FoodSearchItemSchema` and
`FoodDetailFoodSchema` are DEPRECATED aliases of the new shapes — the same
objects, so importing an old name cannot hand a caller a stale contract — and
they stay until the screens move. `shared/api-client/tests/nutritionFixtures.ts`
holds one recorded body per route for the client's own suite; it proves nothing
about the server on its own, which is what the harness is for.

The programs contract carries three rules, stated at the top of
`shared/api-client/src/schemas/programs.ts` and asserted by that file:
**`phase` numbers are 1-based on the wire** (an array index leaking out logs a
session against the wrong phase), **programs are addressed by `program_id`**
(the slug, never the Mongo `_id`), and **`activePrograms[].status` is one of
`active | in-progress | paused | completed`** — there is no `abandoned`,
because abandoning REMOVES the enrolment. The hydrated exercise
(`ProgramExerciseSchema`) is typed once and used by both the program-detail and
current-workout responses; `groupType` is an enum whose wire spelling is
`giant_set`, while `trackingType` stays a plain string so a catalog that grows
a new tracking type cannot make a shipped store build drop a whole workout.

The schedule contract (NP-021) carries four rules, stated at the top of
`shared/api-client/src/schemas/schedule.ts`: **a slot `date` is a day MARKER at
00:00Z**, read with `slotDateKey` and never through a timezone offset (the
`completedAt` beside it is an INSTANT and does take one); **`GET /api/schedule`
answers `{ schedules: [ … ] }`** — plural and nested, one document per enrolled
program, never a flat slot array; **a slot names its session with `phase`
(1-based) and `dayLabel`**, not with indices; and **every write carries a numeric
`tz`**, which `apiFetch` merges into the body from the device clock. The eight
PATCH actions (`skip`, `unskip`, `uncomplete`, `reschedule`, `swap`, `shift`,
`pause`, `resume`) are ONE discriminated union on `action`, so `reschedule`
without a `newDate` stops compiling instead of coming back as a 400 from a
device, and they answer with TWO shapes: the five slot-level actions return the
program's slots, the three program-level ones return counters and no slots.
`swap` is typed and called by nobody — the server has always accepted it and no
screen sends it. The speculative `ScheduleSlotSchema` / `ScheduleResponseSchema`
(a `{ schedule: [ … ] }` envelope with `phaseIndex`/`workoutIndex`) described a
response no handler has ever sent and are gone.

The workouts contract (NP-018) lives in
`shared/api-client/src/schemas/workouts.ts` and is asserted by
`tests/unit/contract/np018Workouts.test.ts` (15 routes). **The save body is ONE
discriminated union on `kind`** — a program day (`programId` + 1-based `phase` +
`day` LABEL, and `kind` absent, which is what the web sends) or a quick session
(`kind: 'quick'` + `sessionId`) — so a body with half of each stops compiling
instead of coming back as a 400 from a device. Five rules travel with it:
**timed work is saved in `duration`/`distance`, never in `reps`/`weight`** (the
live view types cardio into the same two boxes as reps and weight, so the client
moves the values into the right FIELDS on the way out); **a skipped set is saved
as completed with reps 0 and weight 0**, and PR detection ignores reps 0, which
is what keeps a skip out of the records while still recording it; **`phase` is
1-based**, as in the programs contract; **`performedAt` is sent only on the
completing save**, so an autosave can never disturb the log's date; and **`tz` in
a body is a NUMBER** (minutes west of UTC, NP-009) — `POST /api/workouts`
PERSISTS a reported offset as the member's zone, so a fabricated `tz: 0` fires
their morning push at ~3am local. Every measurement on a STORED log comes back
`number | null` because `models/UserProgress.ts` defaults them; a draft
exercise's `sets` is a COUNT and its `reps`/`duration`/`rest` are PRESCRIPTION
STRINGS. The speculative `WorkoutLogSchema` / `WorkoutsListResponseSchema` /
`SaveWorkoutResponseSchema` trio (a `{ workouts: [ … ] }` envelope keyed by
`phaseIndex`/`workoutIndex`) described a response no handler has ever sent and
are gone.

The Mind + Becoming contract (NP-037) lives in
`shared/api-client/src/schemas/mind.ts` and `becoming.ts` and is asserted by
`tests/unit/contract/np037Mind.test.ts` (28 routes). Five rules travel with it:
**`POST /api/mind/session` takes `{ tz, moves: [{ kind }] }` and `PUT` takes
`{ seed, plan, tz }`**, and the day the completion is stamped with comes from
`tz` and nothing else — the web sends `tzOffset` on the POST, which
`readTzOffsetFromBody` ignores, so the web's own completions carry the UTC day
until NP-031 lands; **both of those methods answer a locked member with the
canonical 403 gate body** (`MindGatePayloadSchema`, `feature: 'mind-sessions'`,
`requiresTier: 'plus'`) because gating only the payoff walks somebody through a
whole session for nothing; **a `dateKey` is a LOCAL day and an `*At` number is
an epoch-ms instant** — `lastBreathAt` is a number on the session read and an
ISO string on the progress read, and they are not interchangeable;
**`mainSessionCount` is chapter progress, not a session count** (the paywall
reads `sessionsUsed`, i.e. `completedMainSessions`); and **`locked` and
`mainSessionAvailable` are orthogonal** — the plan wall never lifts on its own,
the 20h cooldown always does. `MindSessionPlan` (`webapp/lib/mind/moves.ts`) is
typed whole, with `kind` as a plain string so a composer that grows a beat
cannot make a shipped build drop a session. Six routes are deliberately
UNTYPED, listed in `MIND_ROUTES_WITHOUT_SCHEMAS` and enforced by that test file:
`/api/mind/content/daily`, `/api/mind/progress/xp`,
`/api/mind/progress/levelup`, `/api/journal`, `/api/meditation`, `/api/sleep` —
none has a live web caller, so nothing would be holding the web to their shape.

### Information security program (go-live item 17)

**`SECURITY_PROGRAM.md` at the repo root is the written information security
program** New York's SHIELD Act (GBL § 899-bb(2)(b)) requires of a business
holding a New York resident's private information. It names the responsible
person (**George Anthony**, Security Coordinator; Jon Don as business/data
owner), inventories every system member data lives on, carries the risk
register, the administrative/technical/physical safeguards clause by clause, the
breach-notification playbook for § 899-aa, and a numbered list of the gaps that
are not closed yet.

Four rules about it:

- **One copy, in git.** No PDF, no second copy in a drive folder. Approval is
  recorded by editing the `Approval status` line and the sign-off table in a
  commit — the commit is the signature.
- **It is the INTERNAL side of the same facts `/privacy` and `/health-data`
  state publicly.** A processor added to one must be added to the other, and
  nothing in the program may contradict what a member has been told.
- **Touch the infrastructure, re-read section 4.** A new data store, a new
  provider, a change to auth, hosting or the secret store is a review trigger
  (section 13), not a note for next year. The same applies to closing one of the
  numbered gaps: close it in the table, with a date.
- `tests/unit/legal/securityProgram.test.ts` fails the build if the program
  loses a statutory sub-clause, the named owner, a system from the inventory, its
  dates, or ever carries something credential-shaped — the "never write a
  credential into a file" rule, enforced.

Items marked `[CONFIRM AT SIGN-OFF: Cn]` are open questions only a person with a
provider console, a contract or physical access can answer; Appendix A lists all
of them. **They are not claims.** Do not cite a marked line as settled fact.

### Billing (Stripe)

Every value is **optional**, and the app is fully functional with none of them
set: `/api/billing/checkout` and `/api/billing/portal` answer
`503 billing_not_configured`, `/api/billing/status` answers `200` with
`configured: false`, and `UpgradeSheet` renders its coming-soon note instead of
a CTA. That is the state Become ships in.

| redsecrets `billing.*` | local env (dev only) | notes |
|---|---|---|
| `stripeSecretKey` | `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` |
| `stripeWebhookSecret` | `STRIPE_WEBHOOK_SECRET` | `whsec_…`, one per endpoint |
| `stripePricePlusMonthly` | `STRIPE_PRICE_PLUS_MONTHLY` | `price_…` |
| `stripePricePlusAnnual` | `STRIPE_PRICE_PLUS_ANNUAL` | `price_…` |
| `stripeMode` | `STRIPE_MODE` | `test`\|`live`; **the key prefix wins** |

**Setting these as RedRun env vars does nothing.** `localEnv()` in
`lib/runtimeConfig.ts` returns `undefined` whenever `NODE_ENV === 'production'`
(which `next start` sets), so production reads `billing.*` from the
`BECOME_RUNTIME_CONFIG` secret in redsecrets (`redshared`) or not at all. A
deploy that sets RedRun env vars and expects checkout to switch on stays
silently unconfigured.

Every field resolves through `optional()`, **never `required()`**. One
`required()` in that block turns "billing isn't set up yet" into
`getRuntimeConfig()` throwing, which 401s every authenticated route while
`AuthGuard` still renders the page — the app looks fine and every list is empty.
`tests/unit/billing/billingConfig.test.ts` exists to catch exactly that.

#### Where Stripe returns a buyer (and why the app gets different pages)

`lib/billing/urls.ts` builds the three return URLs. The ORIGIN comes from an
allow-list checked against `Origin`, then `Referer`, then the forwarded/host
headers, falling back to `NEXT_PUBLIC_APP_URL` — never a reflected one, because
these strings are redirect targets handed to Stripe. The PATH now depends on an
optional `returnTo` in the body of `POST /api/billing/checkout` and
`POST /api/billing/portal`:

| `returnTo` | success | cancel | portal |
|---|---|---|---|
| absent / `'web'` (unchanged) | `/dashboard/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}` | `/dashboard/plan?checkout=cancelled` | `/dashboard/plan?portal=return` |
| `'app'` | `/billing/return?session_id={CHECKOUT_SESSION_ID}` | `/billing/cancelled` | `/billing/portal-return` |

An unknown value is `400 invalid_return_to`, not a silent fall back: a typo'd
`'App'` would strand a native buyer on a sign-in screen and say nothing.
`returnTo` is also part of the checkout idempotency key, because Stripe replays
the FIRST session for a repeated key and ignores the new params.

**Why the app needs public pages.** A native request carries no `Origin` and no
`Referer`, so the Host decides and Stripe drops the buyer into **Safari** — a
browser that has never held that member's session (`auth_token` is a cookie the
app does not share). `middleware.ts` guards `/dashboard/*`, so the plan page sent
them to `/login` seconds after their card was charged. The three pages under
`app/billing/` render signed out, state what happened, show **no account data**
and **activate nothing** — the app reads
`GET /api/billing/status?session_id=` for itself, signed in (NP-054).

The "Return to Become" button is `become://?billing=…` and deliberately not a
link to one of our own hosts: **iOS keeps a tap on a same-domain link inside
Safari**, so a universal link there would only load another web page. It targets
the app's ROOT with the outcome as params because `expo/app/` has no billing
route yet and an unmatched deep link opens the app on a not-found screen. A
second, quieter link offers `/dashboard/plan` for a member without the app.
`{CHECKOUT_SESSION_ID}` is still concatenated, never encoded. Tests:
`tests/unit/billing/billingAppReturn.test.ts` and `billingReturnPages.test.tsx`.

#### The mode fence (read before touching `lib/billing/`)

Production and beta are two workspaces on **one MongoDB**. If prod runs live and
beta runs test, both webhooks write the same `user.subscription`. Three
mechanisms keep them apart and none of them is optional:

- `reduceStripeEvent` drops any event whose `livemode` disagrees with the
  configured mode, before anything can reach a user document.
- Customer ids are **mode-specific fields** (`stripeCustomerId` for live,
  `stripeTestCustomerId` for test) — a member can legitimately hold both.
- `canApplyMode()`: a **test-mode event never overwrites live state**. Real
  money wins; the reverse is allowed.

The visible consequence is deliberate: a live subscriber who also test-subscribes
on beta sees beta's changes rejected as `mode_downgrade_blocked`. That reads as
"beta is broken" and is not. Do not fix it by dropping the guard.

#### Stripe API shapes that moved (both fail silently)

Verified against the installed SDK, not from memory:

- `Subscription.current_period_end` **no longer exists** — it is
  `subscription.items.data[i].current_period_end`.
- `Invoice.subscription` **no longer exists** — it is
  `invoice.parent.subscription_details.subscription`.

Read the old field and you store `undefined`. Because a `canceled` sub keeps Plus
only while `now < currentPeriodEnd`, an undefined period end downgrades someone
the moment they cancel — after they have paid for the month.
`lib/billing/subscriptionState.ts` is the only place either shape is read, and
both are pinned by fixtures.

Also: **never pass `apiVersion`** to the constructor. `StripeConfig` types it as
the literal `LatestApiVersion`, so a hardcoded date string breaks `tsc` on the
next SDK bump. The SDK's pinned version is correct by construction.

#### The webhook

`POST /api/billing/webhook`, unauthenticated by design — the signature IS the
auth, and `middleware.ts` only matches `/dashboard/:path*` so nothing intercepts
it. Order is load-bearing:

1. **`await request.text()`, never `request.json()`.** Re-serializing changes the
   bytes the HMAC covers and every delivery 400s. A webhook that "just stopped
   verifying" is almost always this.
2. Verify → reduce → **then** claim. Claiming before verification would let an
   unsigned POST burn a real event id and suppress the genuine delivery.
3. `models/StripeEvent.ts` + its unique index on `eventId` is the idempotency
   mechanism: the insert IS the claim and E11000 IS "already seen". On a handler
   throw the claim is **released** and the route 500s so Stripe's retry can
   re-claim — leaving the row behind makes every retry a silent no-op and the
   event is lost forever.
4. An unhandled type answers **200**. A 4xx makes Stripe retry an event we will
   never act on.

`applyBillingOutcome` writes `subscription.*` **and** the derived `tier` in one
`$set`, with `deriveTier` **injected** — `lib/billing/mongoDeps.ts` holds the one
import of `lib/subscription.ts` in the whole billing layer, so if the tier model
moves that is the single line to change. It also drops out-of-order events
(Stripe delivers unordered) and never clears `grandfathered`.

**Ordering compares Stripe's clock to Stripe's clock, never to ours.**
`isStaleEvent` reads the incoming `event.created` against
`subscription.lastEventCreated` — the `created` of the last event applied. It
must never be compared against `subscription.updatedAt`, which is OUR wall clock
at write time: delivery plus processing latency is always positive, so every
event created at or before the previous write instant reads as stale, and Stripe
emits these in bursts inside one or two seconds. Only the FIRST event of a burst
would ever be applied. `invoice.payment_failed` and `customer.subscription.updated
→ past_due` arrive together, so whichever landed second was dropped and the
member kept Plus through the whole dunning period plus the 3-day grace. Equal
timestamps are deliberately NOT stale: `created` is second-granularity, so order
inside one second is unknowable and every event in the burst carries real state.
Rows written before `lastEventCreated` existed have none, which reads as
"nothing to be older than" and applies — correct for the migration.

It runs **regardless of `ENTITLEMENTS_ENFORCED`**: the kill-switch governs
whether tier is enforced, not whether money is real.

Endpoints to register in the Stripe dashboard, one webhook secret each:
`https://become.redbtn.io/api/billing/webhook` (live) and
`https://become-beta.redbtn.io/api/billing/webhook` (test). The **billing portal
also needs a configuration saved in the dashboard** or
`billingPortal.sessions.create` fails — mapped to `503
billing_portal_not_configured` so it does not read as a code bug.

#### The resweep — the writer that is a clock, not an event

Every other writer of `tier` is a webhook handler, and **two of `deriveTier`'s
branches change their answer with TIME and emit no event when they do**: a
`canceled` subscription whose paid period simply ends (Stripe's last word was
`customer.subscription.deleted`) and an `active`/`trialing` one past
`SUBSCRIPTION_GRACE_MS`, which is the permanently-missed webhook. Until
something re-derives those rows, a cancelled member keeps Plus after the period
they paid for — forever, unpaid.

`lib/billing/tierResweep.ts` is that writer, and it is ONE engine with two
doors: `app/api/cron/resweep-tiers` (scheduled) and
`scripts/resweep-subscription-tiers.mjs` (by hand, dry-run by default). Neither
door restates a rule — the selector and the call to the real `deriveTier` live
in the engine, so the unattended sweep and the 2am manual one cannot disagree
about what a lapsed subscription means.

**The schedule is `.github/workflows/resweep-subscription-tiers.yml`, and it is
the only one.** Every 6 hours, `POST https://become.redbtn.io/api/cron/resweep-tiers`
with `x-cron-secret`, from the repo secret `BECOME_CRON_SECRET` (the same value
as redsecrets `admin.cronSecret`, which the notify cron uses). Four facts about
it that are not obvious:

- **Production only, on purpose.** Beta and production are two workspaces over
  one database and the sweep reads STORED subscription state, so a test-mode
  cancellation made on beta is expired by the production run. A beta schedule
  would be a second runner over the same rows. If a RedRun workspace schedule is
  ever added for this, DELETE the workflow in the same change.
- **GitHub runs `schedule:` only from the default branch**, so the job starts
  when the workflow reaches `main`, not `beta` — and a copy on a feature branch
  is inert. GitHub also disables schedules in a repo with 60 days of no
  activity.
- **Every 6 hours, not daily.** Scheduled runs are delayed under load and
  dropped at peak; a once-daily job that skips a run is already outside "loses
  Plus within a day of the period ending". Extra runs are free — see the next
  point.
- **A run that changes nothing writes nothing.** No user write (a row whose
  stored tier already equals the derived one is never touched) and no record
  row: `models/TierResweepRun.ts` is a CHANGE log, not a heartbeat, because
  otherwise it would grow forever to say that nothing happened.

Which means "did it run?" and "what did it change?" are answered in different
places, and both are free:

- **Did it run** — the workflow's run history, where each run writes a summary
  table of the response (and a red X if the endpoint did not answer 200), plus
  the `[resweep] …` line the route logs on the RedRun container.
- **What it changed** — **Admin → Subscription sweep** on `/dashboard/admin`
  (`GET /api/admin/billing/resweep`): the recent runs that moved somebody, by
  user id, plus how many expired rows are waiting right now through the sweep's
  own selector. Empty is the healthy state and the card says so.

Ids, never emails: this output gets pasted into chat.

Tests: `tests/unit/billing/tierResweep.test.ts` (the sweep, against a fake
collection that throws on an unexpected write) and
`tests/unit/billing/resweepSchedule.test.ts` (one schedule, often enough,
production only, secret checked before the sweep, no record on a no-op).

## The exercise catalog: a repo table that WRITES ITSELF to production

**A data migration that needs a human to run it does not exist.** This is the
lesson of the "dumbbell only program" card, and it cost a whole round trip.

The card was: the dumbbell exercises a dumbbell-only program prescribes were not
in the admin portal, because the importer had attached the coach's wording to
the nearest barbell/machine/bodyweight row AS AN ALIAS rather than minting a
row. Round one shipped the reviewed decision (`webapp/lib/dumbbellCatalog.ts`),
a pure planner (`lib/dumbbellCatalogPlan.ts`), the repo's snapshot of the
catalog (`data/exercises.json`, `data/programs.json`), a passing test suite —
and `scripts/dumbbell-catalog.ts --prod --apply` for somebody to run. Nobody
ran it. The admin portal reads MongoDB, so the coach's reply was simply
correct: *"You didn't change anything. The exercises still read with a DB. The
exercises still don't exist in the admin portal."*

`data/*.json` IS NOT THE DATABASE. It is a snapshot the tests read. Editing it
changes what CI checks and nothing a member or an admin can see.

So the catalog now has a WRITER, on the same pattern as the tier resweep and
the deletion purge:

- `lib/dumbbellCatalogSync.ts` — reads the live `exercises` and `programs`
  collections, plans with the same pure functions the test uses, writes only
  the difference, then RE-PLANS and reports whether a second run would find
  anything. Convergent and idempotent: a run with nothing to do writes nothing
  at all, which is what makes it safe on a schedule.
- `app/api/cron/sync-exercise-catalog` — POST applies, GET is a dry run by
  construction, `?dryRun=1` on either. Auth is `x-cron-secret`
  (redsecrets `admin.cronSecret`), like every other cron route.
- `.github/workflows/sync-exercise-catalog.yml` — **push to `main`** (beta is
  promoted to main, so merging IS applying) plus a **daily schedule** as the
  backstop, plus `workflow_dispatch` for a dry run. Repo secret
  `BECOME_CRON_SECRET`, the same one the other two schedules use, so there is
  no new secret to provision. Production host only: beta and production are two
  workspaces over ONE database.
- `scripts/dumbbell-catalog.ts` still exists, and its `--prod` half now calls
  `syncDumbbellCatalog` rather than restating it, so a laptop dry run and the
  scheduled production run cannot disagree. `--fixture` rewrites `data/`.

Two rules that follow, and they generalise past this card:

1. **A catalog change is not shipped until something in CI or a workflow
   applies it.** If you add a row to the table, the workflow puts it in
   production on the promotion; if you invent a new KIND of change, it needs a
   planner, an applier and a line in the report, or it silently never happens.
2. **Member history is never migrated by it.** A split's host row is a real
   exercise six other programs still prescribe, and a logged set does not
   record which program it came from — so moving somebody's
   `romanian-deadlift` PR onto `dumbbell-romanian-deadlift` would be wrong for
   everyone training under a barbell. Sets already logged stay where they are;
   sets logged after the split land on the new row.

`tests/unit/dumbbellCatalog.test.ts` pins all of it: the outcome (every
exercise the two dumbbell-only programs name has its OWN row, findable by the
coach's wording, with no video so it sits in the portal's "No Video" upload
queue), the table (a value the schema would reject, a repoint that escapes the
two programs, an alias left on the host that would make the new name resolve to
nothing), the plan being settled against `data/`, and the wiring — the route,
the sync, and the fact that exactly one workflow calls it.

### Public (Next.js)
```
NEXT_PUBLIC_APP_NAME      # "Become"
NEXT_PUBLIC_APP_TAGLINE   # Tagline text
NEXT_PUBLIC_APP_URL       # Base URL for magic links
NEXT_PUBLIC_PROFILE_IMAGE # Coach profile picture
NEXT_PUBLIC_LOGO          # App logo
```

## Home-screen widgets

Jon asked for widgets on the phone lock screen and Home Screen: a streak one, a
nutrition one with macros, a mindset one for the daily session, and a Becoming
one for progress.

**A widget is an OS surface, and the web app cannot draw one.** iOS widgets are
a WidgetKit app extension and Android's are App Widgets; a PWA installed to the
home screen gets an icon, not a widget, on either platform. So the widget
surface itself can only ship from `expo/`, and `expo/` has not been built for a
store yet (no Apple/Play app record wired up, and no OTA to shortcut it — see
`expo/RELEASE.md`, which is a local `expo prebuild` + Xcode/Gradle build because
no Expo-hosted service is used), which is the real blocker on a member ever
seeing one. Nothing in `webapp/` can change that.

What `webapp/` owns is the part every widget on every platform reads:

### `GET /api/widgets/summary?tz=`

One authenticated request returning all five widgets — `streak`, `nutrition`,
`mind`, `becoming`, `training` — because a home screen refreshes its widgets
together and five endpoints would be five auth round-trips and five copies of
the same `UserProgress` read, per member, on a background timer.

Two rules hold it together:

- **The renderer has no business logic.** `lib/widgets/feed.ts` is pure and
  ships `headline` / `headlineUnit` / `caption` as finished strings, plus
  `progress` and `rings[].pct` as 0..1 fractions. A widget extension cannot
  reach the database at paint time and must not be deciding what "at risk"
  means or how to pluralise "day" — a renderer that decides is a renderer that
  disagrees with the app. Every wording and threshold is pinned in
  `tests/unit/widgets/feed.test.ts`, including that no branch can emit an empty
  headline or caption (a blank line on a home screen reads as a broken app and
  raises no error).
- **It stays cheap and writes nothing.** `lib/widgets/load.ts` reads today's
  local day and this week only. `computeJourney` (52 weeks) and
  `computeGoalProgress` (which `ensureGoals`-upserts) were each a one-line reuse
  and both are far too heavy to sit behind an OS refresh that runs forever for
  every member who installs a widget. A 60s Redis entry
  (`widgetFeedCacheKey`) collapses the five-widgets-at-once burst.

`tz` is **optional here**, unlike every in-app read: a widget extension is not a
browser and may have no cheap offset to report. When it is absent the member's
stored IANA `timezone` decides the day, and only then the stored
`timezoneOffset` — which is a snapshot taken when they last opened the app, so
for a member who has gone quiet across a daylight-saving change it is an hour
wrong in exactly the direction that moves the day boundary. One resolved offset
feeds the day key, the meal-log window and the week boundary, so they cannot
disagree with each other.

The usual two date species both appear in `load.ts`, one line apart: a
`Schedule` slot date is a day MARKER read with `slotDateKey`, and
`workoutLogs.date` is an INSTANT put through the offset. See the day-marker
section and `tests/unit/dayMarkerConvention.test.ts`.

### The widgets token: `POST /api/widgets/token`

**A widget extension does not get the member's session.** It is a different
process with a different lifetime; whatever it holds sits on the device for
months and is read by code the member never opened. Handing it the 30-day JWT —
the credential that can log a workout, move a goal, start a checkout or delete
the account — so it can draw a streak number is a grant wildly out of
proportion to the job.

So `POST /api/widgets/token` (full session required, writes nothing, hit at each
app open) mints a token with `scope: 'widgets'`. `verifyAuth` is **default-deny
for scoped tokens** (`lib/auth.ts`), so that token is refused by every route in
the app except the one that names `WIDGET_SCOPES` — which is
`GET /api/widgets/summary` and nothing else. In particular `/api/auth/me` refuses
it, which matters more than it looks: that route's sliding refresh mints a fresh
30-day SESSION from whatever it accepts. **A widgets token reads the feed and
nothing else.** `tests/unit/auth/token-scope.test.ts` fails if any other route
file opts in.

It cannot mint another one either: `POST /api/widgets/token` passes no scope
opt-in, so a widgets token presented there is refused like anything else.

**The version is the revocation, because a JWT has none.** `ai-tools` tokens are
safe to leave stateless — they live 15 minutes. This one lives 180 days, because
an OS refresh budget is measured in hours and a widget that re-authenticates
every quarter of an hour shows a stale number all day. So it carries
`widgetTokenVersion`, the counter stored on the User at mint time, and the
summary route compares it against the stored value on every read — **before the
60s Redis entry is consulted**, or a revoked token could still read a warm feed.
Bumping the counter (`$inc`, so absent → 1) kills every token minted before it,
with one write and no revocation list:

- the member signs out in the app → `POST /api/auth/logout`, which for this
  reason now takes the token from the Authorization header OR the `auth_token`
  cookie (native sends one, the web sends the other) and is fail-soft: signing
  out may never fail because a write did;
- the member requests deletion → `DELETE /api/me/account`, in the same
  `updateOne` as the deletion plan, for the same reason that route drops push
  registrations at request time rather than at purge time. Minting is refused
  while a deletion is pending, or the next app open would hand the token back.

A scoped token can never bump anything (`signOutRevocationTarget` returns null
for it): revocation is a WRITE, and the read-only credential does not get one.
The counter has **no schema default** — absent and 0 have to be the same thing
for `$inc` to be safe. `lib/widgets/token.ts` carries the argument in full and
`tests/unit/widgets/token.test.ts` pins it; the version check takes an injectable
loader, so the whole decision is exercisable with no database.

What `expo/` owns today is one line of it: a deliberate sign-out POSTs
`/api/auth/logout` with the token it is giving up (`lib/auth/AuthProvider.tsx`).
An involuntary one (`unauthorized`, `expired`) deliberately does not — the server
has already stopped accepting that token, so the call would revoke nothing. The
widget extension itself is still unbuilt, and its side of the contract is: ask
for a fresh token at each open, store nothing longer, and read only the summary.

### What the web app CAN put on a phone

Three surfaces, and between them they are the whole of a PWA's presence outside
its own window. All three read the same feed, so none of them can disagree with
another or with the app.

**1. Manifest shortcuts.** `app/manifest.json/route.ts` carries `shortcuts` —
long-press the installed icon to jump to Workout / Nutrition / Mind / Becoming.
Chromium-based Android honours it; **iOS ignores it entirely**. Each `url` must
be a real page and inside `scope`; a shortcut to a 404 is invisible until
someone taps it, so the test checks them against the app directory.

**2. The app-icon badge** (`lib/widgets/badge.ts`, `components/AppBadgeSync.tsx`,
and a hand-mirrored copy in `public/sw.js`). A live number ON the home-screen
icon: how many of the day's three commitments are still open.

- `WidgetFeed.badgeCount` is the number, so the icon and the widgets are the
  same data. `badgeCountFor` counts **`training`, `nutrition`, `mind`** only.
  `streak` is excluded because it is a CONSEQUENCE of those three and would
  double-count the same day; `becoming` because it is a weekly arc and sits in
  `todo` from Monday onward, which would pin the badge to at-least-1 on days
  the member owes nothing. `none` (rest day, Mind cooldown) is not a task and
  never raises a badge the member has no way to clear.
- **Zero CLEARS the badge; it never calls `setAppBadge(0)`**, which the spec
  draws as a dot — a finished day that still looks unread.
- Platform reality decides where this matters: **iOS/iPadOS 16.4+** supports it
  for Home Screen web apps once notification permission is granted, and iOS is
  the platform that ignores shortcuts — so this is Become's whole home-screen
  presence there. **Android Chromium does not implement the Badging API at
  all**; Android badges an installed PWA's icon by itself when a notification
  is unread, which is what the daily glance does for it. Every call
  feature-detects and swallows `NotAllowedError`: a badge is decoration and may
  never break a page.
- Refreshed on app open and on the tab becoming visible, never on a timer, and
  by `public/sw.js` when a push carries `badgeCount` — which is what keeps it
  right on a phone that has not opened Become since yesterday. `logout()`
  clears it, for the same reason it wipes the cached dashboard.

**3. The daily glance** (`lib/widgets/glance.ts`, sent from section 0.5 of
`app/api/cron/notify`). The lock screen. A web app cannot draw a lock-screen
widget, but it can put one card there, so this renders the feed as a
notification: streak, today's session, calories left, Mind session waiting.

- It composes from `WidgetFeed`'s finished strings and reads no model. A glance
  that re-derived "at risk" or re-formatted a calorie count would drift from
  the widget beside it.
- **It is the one notification in the app that is OFF by default**, and the one
  place `notificationPrefs.<key>` must be read as `=== true` rather than
  `!== false`. Everything else in that cron fires because something is wrong or
  owed; this is a standing daily card landing in a morning that already has the
  workout (7-11) and Mind (8-11) nudges in it. Its window is **6-9 local** and
  its sweep runs FIRST, so it reads as the day's summary rather than a fourth
  reminder.
- It carries `badgeCount` on the push — the only push that does. A nudge about
  one missing pillar says nothing about the other two, so every other push
  leaves the badge alone.
- One per member per LOCAL day, gated on `lastPushSentAt.dailyGlance`, and the
  whole sweep is wrapped: it is the heaviest section here (one `loadWidgetFeed`
  per qualifying member) and must not be able to cost anyone a nudge.

What is still native-only: an actual WIDGET, of any size. Nothing above changes
that — but `expo/` now draws four of them on **Android** (NP-198): streak,
nutrition, Mind and Becoming, as App Widgets through
`react-native-android-widget`, reading this feed with a widgets token minted at
each app open and cached for a day at a time so a refresh with no network still
paints. Signing out drops the token on the device and pushes the sign-in prompt
onto all four tiles, alongside the `widgetTokenVersion` bump that stops the ones
that have left it; taps carry `become://…` through the app's one path resolver.
See `expo/ANDROID_QUIRKS.md` § App Widgets and `expo/lib/widgets/`.

iOS's WidgetKit extension (NP-181/NP-182) is still unbuilt and shares this feed,
this token and those states when it lands. **Neither has been seen on a phone:
`expo/` still has no distribution**, which remains the real blocker on a member
ever seeing one.

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
| `SECURITY_PROGRAM.md` | The written information security program (SHIELD Act): who owns security, where member data lives, what is safeguarded and what is not yet |
| `webapp/app/dashboard/workout/[programId]/workout/live/page.tsx` | Live workout tracking (most complex UI) |

## What's Missing / Incomplete

- No test framework or tests
- Chat and nutrition sections exist as pages but may be stubs
- Redis URL is configured in .env but unused in code
- No CI pipeline (RedRun builds on merge to `main`; no tests gate the deploy)
- No rate limiting on API routes
- No centralized error handling or logging
