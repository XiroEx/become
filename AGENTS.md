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
DELETE is EITHER id** (`lib/nutrition/foodOwnership.ts`), not `createdBy` alone.
An inventory cap is only humane because deleting frees a slot, so a row billed
to one member and deletable only by another is a lockout with no self-service
way out — and rows shaped exactly like that exist, from the window in which
`authoredBy` was writable from the PATCH body. Whoever the slot is charged to
can always delete the row and get the slot back.

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
