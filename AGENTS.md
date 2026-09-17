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
and no amount, and `uiSurfaces.test.tsx` pins that branch for what it must NOT
contain.

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
surface itself can only ship from `expo/`, and `expo/` has no distribution yet
(`eas.json` still holds `REPLACE_WITH_APPLE_ID` / no Play service-account key),
which is the real blocker on a member ever seeing one. Nothing in `webapp/` can
change that.

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

What is still native-only: an actual WIDGET, of any size, on either OS. Nothing
above changes that, and `expo/` still has no distribution.

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
