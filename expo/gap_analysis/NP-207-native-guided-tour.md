# NP-207 — Short Native Coach-Mark Tour Through Main Hubs With Decline Option

- **Ticket:** NP-207
- **Board Ref:** [NP-207](https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12652379586ae015ca57)
- **Wave:** 4
- **Store v1:** no
- **Size:** M
- **Priority:** P3
- **Story / Cluster:** Native onboarding, the guided tour and the post-onboarding trial
- **Origin:** Decision card NP-164 ("Decide the guided tour on native once the web's decline-the-tutorial change ships")
- **Stakeholder Decision (Jon Don, 2026-10-08):**
  > "I think we do need a tour, but someone should have the choice to decline. there should be one simple tour that bring you throught each main hub of our app. just the basics. but if someone doesnt want to do a turtorial they should be able to . the point is to not be annoying"

## Summary & Objectives

Build a lightweight, non-intrusive native coach-mark tour that introduces the main hubs of the BECOME app to new members. The tour must provide an upfront choice to decline ("nah I'm good"), allow dismissal at any step, use its own dedicated progress key, and never interfere with the web app's tour state.

## Core Invariants & Rules That Travel

1. **Independent Progress Key:**
   - The native tour tracks progress under its own isolated key: `native-onboarding` (or `native:tutorial-progress`).
   - Web uses `become-onboarding` (keyed per account in `/api/tutorial-progress` and offline in localStorage).
   - The two keys remain completely decoupled.

2. **Native Never Writes Web Tour Progress:**
   - Under no circumstances does the native app write, mutate, or dismiss `become-onboarding`.
   - A member completing, declining, or skipping the native tour must not have their web onboarding tour state altered.

3. **No Native Screen Waits on Tour State:**
   - Unlike the web app (where `DashboardClient` holds the daily check-in modal and program nudge behind `tourWasSettled`), no native screen or flow waits on tour state.
   - The native daily check-in (`/api/checkin`) and program nudge (`/api/program-nudge`) display when due regardless of tour progress.

4. **Decline and Non-Annoyance:**
   - The tour presents an explicit option to decline upfront ("nah I'm good" / "Skip").
   - Members can dismiss or close the tour at any step.
   - Once dismissed or completed, the tour never re-prompts unless explicitly requested by the member (e.g. from Settings/Help).

## Hubs Covered

The tour covers the main hubs of the native app ("just the basics"):
1. **Dashboard** (`expo/app/(app)/(tabs)/dashboard/index.tsx`):
   - Daily focus, check-in, active workout, and habit streaks.
2. **Training / Programming** (`expo/app/(app)/(tabs)/programming/index.tsx`):
   - Enrolled programs, workout sessions, exercise library, and builder.
3. **Nutrition** (`expo/app/(app)/(tabs)/nutrition/index.tsx`):
   - Meal logging, daily macro targets, meal plans, and food search.
4. **Mind** (`expo/app/(app)/(tabs)/mind/index.tsx`):
   - Mindset sessions, reflections, breathwork, and mental conditioning.
5. **Profile & Settings** (`expo/app/(app)/(tabs)/profile/index.tsx`):
   - Account settings, preferences, body units, and connected health.

## Acceptance Criteria

- [ ] (id: e015ca60) Upfront prompt offers "Walk me through" vs "Nah, I'm good" (or Skip)
- [ ] (id: e015ca61) Tour highlights each main hub (Dashboard, Training, Nutrition, Mind, Profile) with concise coach copy
- [ ] (id: e015ca62) Progress is persisted under `native-onboarding` and never writes `become-onboarding`
- [ ] (id: e015ca63) No native screen or modal delays its rendering or waits for tour completion
