# Become — Project Audit (2026-03-04)

## Overall Health: ~70%

Core workout tracking flow works. Auth, enrollment, scheduling, and exercise logging are solid. Security gaps, stub pages, missing infrastructure, and data model issues identified below.

---

## CRITICAL — Fixed in This Commit

### 1. EMAIL_PASS Committed to Git
Gmail app password was in tracked `webapp/.env`. Now `.env` is gitignored, replaced with `.env.example` containing placeholders. **User must rotate the Gmail app password** since it's in git history.

### 2. Unprotected API Routes (Now Fixed)
- `POST /api/programs` — no auth (anyone could create programs)
- `PUT/DELETE /api/programs/[programId]` — no auth (anyone could modify/delete)
- `POST /api/exercise-videos` — no auth (anyone could upload videos)

All now require `verifyAuth()`.

### 3. DEBUG Flag in Dashboard
`showCheckInModal` was hardcoded to `true`. Now starts `false`, triggers based on actual mood/weight check-in status.

### 4. No Server-Side Route Protection
Added `middleware.ts` — validates `auth_token` cookie via `jose` for all `/dashboard/*` routes. Invalid/expired tokens redirect to `/login`.

### 5. Missing Database Indexes
Added indexes on `UserProgress` for `activePrograms.programId` and `workoutLogs.programId + date`. Note: `userId` already has an implicit index via `unique: true`.

---

## HIGH PRIORITY — Next Up

### 6. Stub/Placeholder Pages
3 of 5 bottom nav sections are empty:

| Page | Status |
|------|--------|
| `/dashboard/progress` | "Coming soon" text only |
| `/dashboard/chat` | "Placeholder for messaging interface" |
| `/dashboard/mind` | 4 empty placeholder cards |
| `/dashboard/nutrition` | UI works but **no server persistence** — data lost on refresh |

### 7. No CI/CD
No GitHub Actions. No automated build/lint/type-check on PRs. Should add at minimum: `npm run lint && npx tsc --noEmit && npm run build`.

### 8. No Error Monitoring
Zero React error boundaries. No Sentry or logging service. API errors only `console.error`. Production errors are invisible.

### 9. No Rate Limiting
All API routes unprotected from abuse. Magic link send endpoint especially vulnerable.

### 10. Dual Program Tracking
`UserProgress` has both `activePrograms[]` (new) and `currentProgram` (legacy). Routes check both with fragile fallback. `currentProgram` is never populated. Should remove legacy field.

### 11. ExerciseVideo Model is Redundant
Stores `exerciseName` (string) instead of `exerciseSlug`. Duplicates data already in Exercise model (`videoUrl`/`thumbnailUrl`). Should consolidate.

---

## MEDIUM PRIORITY

### 12. Data Model Gaps
- `ExerciseLog` stores `name` (string) but no `exerciseSlug` — can't link logs to exercise definitions for analytics
- `SetLog` doesn't capture `tempo`, `rpe`, `percentOf1RM` even though programs prescribe them
- No unique constraint on weight entries per day
- Progress route (`/api/progress`) mixes real and mock data with hardcoded program name

### 13. Workout Route Race Conditions
`POST /api/workouts` does multiple sequential `updateOne()` calls without transactions. Concurrent requests could corrupt progress.

### 14. Missing UX Patterns
- No empty states (no programs, no history, etc.)
- No loading skeletons on several pages
- No back buttons on subpages
- No workout summary screen after completing a workout
- No error boundaries

### 15. Deployment Config Gaps
- `apphosting.yaml` missing email secrets
- `minInstances: 0` causes cold starts
- No security headers (CSP, X-Frame-Options)
- No health check endpoint
- Large placeholder videos (18MB) committed to git

---

## LOW PRIORITY / NICE-TO-HAVE

### 16. Code Quality
- No test framework or tests
- `console.error` throughout (no centralized error handling)
- Inconsistent naming: `program_id` (snake_case) vs `programId` (camelCase)
- Some routes use `verifyAuth()`, others use manual `verifyToken()` pattern

### 17. PWA Improvements
- Service worker only caches 8 static assets
- No offline fallback page
- No push notifications
- No cache busting on app updates

### 18. Performance
- No React Query/SWR (manual fetch + state everywhere)
- Multiple API calls on mount without deduplication
- Exercise hydration cache is module-level with no automatic invalidation

---

## Feature Suggestions

### Already Scaffolded
| Feature | Current State | Effort |
|---------|--------------|--------|
| Progress Dashboard | Stub page, data exists in UserProgress | Medium |
| Chat/Messaging | Stub page, bottom nav link | Large |
| Mind/Mindset | Placeholder cards | Medium-Large |
| Nutrition Persistence | UI done, needs model + API | Medium |

### New Features
| Feature | Value | Effort |
|---------|-------|--------|
| Exercise history ("Last time: 185x8") | High | Small |
| Personal records (1RM tracking) | High | Small-Medium |
| Workout summary screen | High | Small |
| Progressive overload suggestions | High | Medium |
| Set-to-set weight carry-over | Medium | Small |
| Coach notes per exercise | Medium | Small |
| Workout templates (freestyle) | Medium | Medium |
| Export data (CSV/PDF) | Medium | Small |
| Photo progress tracking | Medium | Medium |
| Offline workout logging | Medium | Medium |
| Push notifications | Medium | Medium |

### Quality of Life
- Dark mode toggle (currently system-preference only)
- Haptic feedback on iOS (set complete, timer end)
- Workout timer pause/resume
- Search exercises in program creation
- Drag to reorder exercises in workouts
