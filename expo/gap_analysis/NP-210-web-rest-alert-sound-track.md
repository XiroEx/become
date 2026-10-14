# NP-210 — Web: Sound-and-Vibration Rest Alert on Live, and Bring Track Its Own Rest Timer

- **Ticket:** NP-210
- **Board Ref:** [NP-210](https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12572379586ae015c730) (filed against NP-028's decision card pending its own board card)
- **Wave:** 0
- **Store v1:** yes
- **Size:** M
- **Priority:** P1
- **Story / Cluster:** Training parity audit: browse, programs, enrolment and the live workout
- **Origin:** Decision card NP-028 ("Decide four training rules for v1: PR meaning, kg labels, the rest alert, Track and Live"), second reply
- **Stakeholder decision (Jon Don, 2026-10-13, second reply):**
  > "Yeah there should be the locked screen rest timer asking giving both sound and silent vibrations when the timer is done. For both live and track if someone out their timer on for tracked."

## Summary & Objective

Today the webapp's Live rest timer vibrates only when it reaches zero (`webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx:1012-1027`, the `navigator.vibrate` call); it has no sound. The Track view (`webapp/app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx`) has no rest timer at all today — `rest`/`groupRest` are only ever displayed as text, never counted down.

Jon decided the rest alert gives **both** sound and vibration when the timer ends (not a sound-or-silent choice), and that this applies **in Live and in Track alike** — a member who turns a rest timer on while using Track should get the same alert Live gives.

This is the web change that must land before the native port starts, per NP-028's "a change the web must make first is carded on the web before the native port starts." NP-082 (native rest timer that survives the lock screen) and NP-087 (native Track view) depend on this ticket's outcome, not the other way around.

## Scope

1. **Sound on Live's existing timer:** `LiveWorkoutClient.tsx`'s rest-completion effect plays an audible alert in addition to the existing `navigator.vibrate` call, so the web gives both signals, matching the decision.
2. **A rest timer for Track:** `WorkoutFormClient.tsx` gets a countdown rest timer of its own (reusing Live's rest-duration logic, e.g. `getSmartRestDefault`/`getRestDuration`, rather than inventing a second rule) that a member can start after a set, firing the same sound-and-vibration alert at zero.
3. **Native copies this rule once it ships:** `expo/lib/live/useRestTimer.ts` / `expo/lib/live/restAlert.ts` (NP-082) and native Track (NP-087) add an audible component to the existing haptic-only alert, and Track gets the same rest timer Live has — after this web change lands, not before.

## Rules That Travel (both apps must agree)

1. The rest alert gives both sound and vibration when the timer ends — never vibration alone, never sound alone.
2. The same alert fires whether the member is in Track or in Live.
3. Native (NP-082, NP-087) copies the web's sound-and-vibration rule and Track timer exactly once this ships — it does not invent its own alert.

## Acceptance Criteria

- [ ] (id: np210-sound) The web's Live rest timer plays an audible alert in addition to its existing vibration when the countdown reaches zero
- [ ] (id: np210-track-timer) The Track view has a rest timer (reusing Live's rest-duration rule) that a member can start after a set, with the same sound-and-vibration alert at zero
- [ ] (id: np210-web-first) This lands on the web before NP-082/NP-087 port the same rule natively

## Native port — landed (card 6acec793eabd988f96d40a34)

The web half shipped as `e243ddb8` on `main` (PR #1962). The native half
followed on `beta` under board card **6acec793eabd988f96d40a34** ("Native: rest
alert gives sound AND vibration at zero, and Track gets its own rest timer"),
which is filed in the matrix against the NP-082 row — note that **NP-082's own
board card (6abb125d2379586ae015c879) is the lock-screen / keep-awake /
back-guard work and is in Review**, so the native rest-alert port carries the
card id above rather than a ticket number of its own. What landed:

1. `expo/lib/live/restEndAlert.ts` — `fireRestEndAlert()`, the native twin of
   the web's `fireRestAlert()`: vibration AND sound, every time, with the two
   channels independent so neither can swallow the other. Wired into
   `useRestTimer`'s zero, which BOTH views share, so Live and Track fire the
   same alert. A member-initiated Skip stays silent, as the web's `skipRest`
   does.
2. `expo/lib/feedback/restSound.ts` + `expo/assets/sounds/rest-end.wav` — the
   sound, via expo-audio, generated from the web's own 880 Hz two-beep numbers
   by `expo/scripts/generate-rest-alert-sound.mjs`. The phone's silent switch
   (iOS) and ringer mode (Android) stay in charge: `playsInSilentMode: false`,
   so a silenced phone gets the vibration alone — "both sound and silent
   vibrations".
3. `expo/lib/live/restDuration.ts` — the rest-duration rule, ported function
   for function from `webapp/lib/workout/restDuration.ts` and consumed by both
   views (Live through `restAfterStep`, Track through `restGroupContext`). It
   replaced the copy inside `expo/components/live/LiveWorkoutClient.tsx`, the
   flat `DEFAULT_REST_SEC = 90` fallback and a duplicate parse helper in
   `expo/lib/quickSession/useQuickLiveWorkout.ts`.
4. iOS's locked-phone banner was silent (`scheduleNotificationAsync` plays no
   sound unless the content asks); it now schedules with `sound: true`.
   Android's `rest-timer` channel already declared sound and vibration.
