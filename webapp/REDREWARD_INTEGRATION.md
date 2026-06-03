# Become × @redbtn/redreward — Integration Plan

_For the Become agent. Written 2026-06-03. The package is built, published, and
stable — this is the Become-side wiring._

`@redbtn/redreward@0.1.0-alpha` is **live on `registry.redbtn.io`** — the
framework-agnostic collectibles/rewards engine (catalog + per-user inventory +
declarative achievement→reward engine + equipped loadout). Become is the first
consumer. The package owns the generic machinery; **Become supplies its own catalog
and achievement rules and renders its own UI**.

- Package spec (source of truth for the API): `~/code/@redbtn/redreward-spec.md`
- Review/rationale: `~/code/@redbtn/redreward-spec-review.md`
- Keep to the §6 method names / §3 types — they're stable; ping the redReward side before assuming a change.

---

## 0. Grounding (Become's actual structure — verified)

- **App root:** `~/code/become/webapp/` (Next 15, `app/` router).
- **Auth / userId:** routes call `verifyAuth(request)` from `@/lib/auth` → `authResult.userId`
  (string). redReward keys reward state on **that exact `userId` string**. Become keeps its
  own user store + auth (redAuth); redReward only stores reward state.
- **API convention:** `app/api/<resource>/route.ts`, `await dbConnect()` from `@/lib/mongodb`,
  guard with `verifyAuth`. Mirror this for the rewards routes.
- **Existing reward code:** `lib/reward/icons.tsx` — `PRESET_ICONS` (10 lucide presets:
  flame, strength, bolt, heart, summit, sunrise, focus, spark, leaf, champion) + `gradient`
  classes + `defaultIconForGoal(goal)`. **These store live lucide components + tailwind
  strings — NOT serializable.** (See §3 migration.)
- **Current single-icon system:** `User.profileIcon` (string) + `User.avatarUrl`. redReward's
  equipped `icon` slot supersedes `profileIcon`; keep `avatarUrl` (custom uploads) separate.
- **Signal models (for achievements):**
  - `MindProgress`: `chapter` (1–5), `xp` (number), `chapterHistory[]`.
  - `UserProgress`: `streakDays` (number), `streakFreezes`, `totalWorkouts`, `workoutLogs[]`.
  - Mind-session counts: `MindSession` collection (count per user).
- **Cosmetic surfaces:** `app/dashboard/profile`, `app/dashboard/settings`.

---

## 1. Decisions (made — don't re-litigate)

1. **Dedicated reward DB.** Point redReward at its OWN database (a `BECOME_REWARD_MONGODB_URI`
   env, or a `redreward` DB on the same cluster). **Do NOT share Become's app DB** — the
   redReward collections (`collectibles`, `userrewards`, `achievements`, `rewardledger`) are
   reward-specific and won't collide, but a dedicated DB is the clean blast-radius choice and
   sidesteps the redAuth `users`-clobber scar entirely.
2. **`app: 'become'`** — stamped on every redReward doc.
3. **Install the alpha explicitly:** `npm i @redbtn/redreward@alpha` (the `latest` tag also
   points at the alpha for now since it's the only version; pin `@alpha` so a future stable
   `0.1.0` doesn't silently swap in).
4. **Catalog + achievements in a SHARED module** imported by both the webapp and any worker
   path that calls `evaluate()` — required if you ever evaluate from more than one process
   (function criteria are process-local; DSL is the only cross-process-safe form).
5. **`evaluate()` and all mutations are SERVER-ONLY.** The client hooks call Become's own API
   routes (behind `verifyAuth`), never the package directly.

---

## 2. Phased plan

### Phase B0 — singleton + connection
- `npm i @redbtn/redreward@alpha`.
- Add `BECOME_REWARD_MONGODB_URI` to env (and to the Become RedRun workspace's
  `appConfig.env` — **per-key**, never a whole-env replace).
- `lib/reward/redreward.ts`: a memoized `getRedReward()` that calls
  `createRedReward({ app:'become', mongoUri: process.env.BECOME_REWARD_MONGODB_URI!, catalog,
  achievements })` once (module-level singleton, like `lib/redauth.ts`'s `getRedAuth()`).
  Import `catalog` from `lib/reward/catalog.ts` and `achievements` from
  `lib/reward/achievements.ts` (Phases B1/B2).

### Phase B1 — catalog (`lib/reward/catalog.ts`)
Migrate `icons.tsx` presets to **serializable descriptors** and add the other types.
- **Icons** (10 presets) → `source:'default'`, `type:'icon'`, asset descriptor:
  ```ts
  { id:'icon.flame', type:'icon', name:'Flame', rarity:'common', source:'default',
    asset:{ kind:'lucide', icon:'Flame', gradient:'from-orange-500 to-red-500' } }
  ```
  Keep `icons.tsx` as the **render-side resolver only**: an `iconByName` map
  (`{ Flame, Dumbbell, … }`) that turns `asset.icon` → the lucide component at render. The
  catalog (DB-seedable) holds only the descriptor; the component map stays in the client.
- **Frames** (`type:'frame'`): bronze/silver/gold/obsidian, rarity-tinted, `source:'achievement'`.
- **Titles** (`type:'title'`): `Consistent`, `Disciplined`, `Relentless`, `Architect`,
  `source:'achievement'`, asset `{ text:'Consistent' }`.
- **Badges** (`type:'badge'`): first-workout, 50-workouts, 100-mind-sessions, vision-completed,
  `source:'achievement'`.
- Run `syncCatalog()` once on deploy (or a seed script) to upsert into the reward DB.

### Phase B2 — achievements (`lib/reward/achievements.ts`)
DSL criteria over a Become **stats object** (full snapshot, see §3). Examples:
```ts
{ id:'streak.7',  name:'Consistent',  criteria:{ stat:'streakDays', gte:7 },  rewards:['title.consistent','frame.bronze'] }
{ id:'streak.30', name:'Relentless',  criteria:{ stat:'streakDays', gte:30 }, rewards:['title.relentless','frame.silver'] }
{ id:'chapter.3', name:'Disciplined', criteria:{ stat:'chapter',    gte:3 },  rewards:['title.disciplined'] }
{ id:'chapter.5', name:'Architect',   criteria:{ stat:'chapter',    gte:5 },  rewards:['title.architect','frame.obsidian'] }
{ id:'workout.1', name:'First Rep',   criteria:{ stat:'totalWorkouts', gte:1 },   rewards:['badge.first-workout'] }
{ id:'workout.50',name:'Committed',   criteria:{ stat:'totalWorkouts', gte:50 },  rewards:['badge.50-workouts','frame.gold'] }
{ id:'mind.100',  name:'Centered',    criteria:{ stat:'mindSessions',  gte:100 }, rewards:['badge.100-mind'] }
```
Keep them DSL (not function criteria) so they're seedable + cross-process safe.

### Phase B3 — API routes (`app/api/rewards/...`) — all behind `verifyAuth`
Mirror the `app/api/profile/route.ts` shape (`verifyAuth` → `userId`, `dbConnect`, `getRedReward()`):
- `GET  /api/rewards`              → `getUserRewards(userId)`
- `GET  /api/rewards/profile-card` → `getProfileCard(userId)`
- `POST /api/rewards/equip`        → `equip(userId, slot, id|null)` (body `{slot,id}`)
- `POST /api/rewards/badges`       → `setBadges(userId, ids)` (body `{ids}`)
- (internal) the event hooks call `evaluate(userId, stats)` server-side — NOT a public route.
These are the fetchers the client hooks bind to. `evaluate`/`grant` never get a public route.

### Phase B4 — wire `evaluate()` into events
After each key event, build the **full current stats snapshot** and call `evaluate(userId, stats)`:
- workout logged (`POST /api/workouts` save path) — after `UserProgress` updates.
- mind session completed.
- streak tick (daily streak update).
- chapter level-up (`MindProgress.chapter` change).
Stats builder (one helper, `lib/reward/stats.ts`):
```ts
async function buildStats(userId): Promise<StatsObject> {
  const up = await UserProgress.findOne({ userId }).lean();
  const mp = await MindProgress.findOne({ userId }).lean();
  const mindSessions = await MindSession.countDocuments({ userId });
  return {
    streakDays: up?.streakDays ?? 0,
    totalWorkouts: up?.totalWorkouts ?? 0,
    workoutsLogged: up?.workoutLogs?.length ?? 0,
    chapter: mp?.chapter ?? 1,
    xp: mp?.xp ?? 0,
    mindSessions,
  };
}
```
**Pass the full snapshot, not deltas.** Take `evaluate().newlyEarned` and feed it to the client
unlock queue (via the response, or a "pending unlocks" fetch) for the level-up/unlock cinematic.

### Phase B5 — client (profile + customizer)
- Profile page (`app/dashboard/profile`): render from `getProfileCard()` via `useRewards`
  (`@redbtn/redreward/client`). Resolve icon descriptors → lucide components with the
  `iconByName` map from `icons.tsx`. Use `<RarityRing>`/`<BadgeShelf>` if convenient, or roll
  Become's own — they're optional.
- Cosmetics customizer (settings or profile): `equip()` / `setBadges()` via the API routes.
- `useUnlockQueue()`: push `newlyEarned` from event responses; pop one at a time to drive
  Become's existing level-up/unlock cinematic.
- Onboarding default: `defaultIconForGoal(goal)` → auto-`equip` the icon slot on first profile
  load (the 10 icons are `source:'default'` so every user already owns them).

### Phase B6 — migrate existing users
- `getUserRewards()` auto-grants all `source:'default'` collectibles on first read, and
  `reconcileDefaults:true` (default) keeps existing users current as you add defaults.
- One-time backfill: for users with a `User.profileIcon`, `equip(userId,'icon',
  'icon.'+profileIcon)` so their current icon carries over. Then `profileIcon` is legacy
  (read equipped icon from redReward going forward).

---

## 3. The Become stats contract (canonical field names)
`evaluate(userId, stats)` where `stats` =
`{ streakDays, totalWorkouts, workoutsLogged, chapter, xp, mindSessions }` (all numbers).
Achievements reference these exact keys. Add keys as you add signals — missing stat → that
criterion is just `false` (forward unlocks stay locked until the stat exists), never an error.

## 4. Gotchas (learned)
- **Dedicated reward DB** — don't share Become's app DB.
- **Full stats snapshot, not deltas** — `evaluate` is idempotent; safe to call on every event.
- **Server-only** mutations — client hooks → Become API routes (behind `verifyAuth`) → package.
- **Asset descriptors must be JSON** — never seed live components/classes; resolve at render.
- **Pin `@redbtn/redreward@alpha`** — explicit, so the stable `0.1.0` doesn't auto-swap.
- **Per-key env writes** on the RedRun workspace (`appConfig.env.BECOME_REWARD_MONGODB_URI`),
  never a whole-env replace.

## 5. Coordination
The redReward API (§6 methods, §3 types) is stable. If Become needs a shape change, ping the
redReward side rather than forking. Known post-alpha tweaks queued on the redReward side for
`0.1.0` stable (don't depend on them yet): `evaluate` ledger double-insert under a true race;
`setBadges` input dedup.
