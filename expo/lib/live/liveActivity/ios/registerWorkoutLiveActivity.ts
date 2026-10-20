/**
 * THE ONE LIVE ACTIVITY REGISTRATION (NP-188) — `createLiveActivity` must
 * run once, at app start, so the layout exists before any live workout
 * tries to `start()` it. Mirrors `lib/widgets/ios/widgets.ts` on purpose:
 * same side-effect-import shape, imported from `index.js` on iOS only.
 *
 * `expo-widgets`'s native module exists only in a dev / store build — never
 * `import` this file from a test or platform-neutral code.
 */
import { createLiveActivity } from "expo-widgets";
import { WorkoutLiveActivityLayout } from "@/lib/live/liveActivity/ios/WorkoutLiveActivityLayout";
import { WORKOUT_LIVE_ACTIVITY_NAME } from "@/lib/live/liveActivity/workoutLiveActivity";

createLiveActivity(WORKOUT_LIVE_ACTIVITY_NAME, WorkoutLiveActivityLayout);
