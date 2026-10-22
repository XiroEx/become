import { useEffect, useState } from "react";
import { useKeepAwake } from "expo-keep-awake";
import {
  loadWorkoutLiveActivityFactory,
  type WorkoutLiveActivityFactory,
} from "@/lib/live/liveActivity/workoutLiveActivity";
import {
  loadWorkoutNotificationNative,
  type WorkoutNotificationNative,
} from "@/lib/live/liveActivity/workoutNotification";

/** DI for tests. `undefined` loads the real module; `null` means "none". */
export interface LiveNativeSurfaceOverrides {
  workoutLiveActivityFactory?: WorkoutLiveActivityFactory | null;
  workoutNotificationNative?: WorkoutNotificationNative | null;
}

export interface LiveNativeSurfaces {
  workoutLiveActivityFactory: WorkoutLiveActivityFactory | null;
  workoutNotificationNative: WorkoutNotificationNative | null;
}

/**
 * EVERYTHING A LIVE ROUTE OWES THE OS, IN ONE PLACE.
 *
 * There are two Live routes — a program day (`[id]/workout/[idx]/live`) and a
 * quick session (`quick/live`) — and both render `LiveWorkoutClient`. The
 * native surfaces were wired into the program route only, so a quick session
 * never kept the screen awake, never started the Lock Screen Live Activity
 * (iOS) and never posted the ongoing notification (Android): the hooks inside
 * `LiveWorkoutClient` were handed a null factory forever and did nothing,
 * silently. Found on a real iPhone, 2026-10-22. Every Live route calls this
 * hook and passes both values on, so a third route cannot forget one.
 *
 * The modules are loaded HERE, once per mount, in an effect — never inside
 * `LiveWorkoutClient`, which dozens of unrelated tests render with no DI (the
 * Live Activity layout pulls in `@expo/ui/swift-ui`, which raced one of them).
 * Each value is null until its effect resolves, and forever null where the
 * surface does not exist (Android for the Live Activity, iOS for the ongoing
 * notification, Expo Go, Jest) — which the consuming hooks read as "skip".
 */
export function useLiveNativeSurfaces(
  overrides: LiveNativeSurfaceOverrides = {},
): LiveNativeSurfaces {
  // The screen must not dim mid-set (NP-082). Released on unmount.
  useKeepAwake("live-workout");

  const factoryOverride = overrides.workoutLiveActivityFactory;
  const [workoutLiveActivityFactory, setWorkoutLiveActivityFactory] =
    useState<WorkoutLiveActivityFactory | null>(factoryOverride ?? null);
  useEffect(() => {
    if (factoryOverride !== undefined) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- loading a
       native module is exactly the "something outside React" case the rule
       carves out; it cannot be derived during render. */
    setWorkoutLiveActivityFactory(loadWorkoutLiveActivityFactory());
  }, [factoryOverride]);

  const nativeOverride = overrides.workoutNotificationNative;
  const [workoutNotificationNative, setWorkoutNotificationNative] =
    useState<WorkoutNotificationNative | null>(nativeOverride ?? null);
  useEffect(() => {
    if (nativeOverride !== undefined) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- same as above. */
    setWorkoutNotificationNative(loadWorkoutNotificationNative());
  }, [nativeOverride]);

  return {
    workoutLiveActivityFactory: factoryOverride ?? workoutLiveActivityFactory,
    workoutNotificationNative: nativeOverride ?? workoutNotificationNative,
  };
}
