/**
 * Confirm-before-leaving guard for the live workout (NP-082).
 *
 * Leaving with unsaved sets loses the workout, so both platform back paths
 * ask first: Android hardware back through the shared `useAndroidBackHandler`
 * hook, and the iOS swipe-back / header back through the navigator's
 * `beforeRemove` event (with `gestureEnabled: false` while there is unsaved
 * work).
 *
 * The navigator object is injected so Jest can drive the guard without a
 * navigator above the route (expo-router's `useNavigation` throws outside
 * one). In the app the route passes nothing and the real navigator is used.
 */

import { useEffect } from "react";
import { Alert, BackHandler } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useAndroidBackHandler } from "@/lib/android/backHandler";

export interface BackGuardNavigator {
  setOptions: (options: { gestureEnabled?: boolean }) => void;
  addListener: (
    event: "beforeRemove",
    handler: (e: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => void,
  ) => () => void;
  dispatch: (action: unknown) => void;
}

export interface UseLiveBackGuardInput {
  /** True while leaving would lose work (workout loaded, not finished). */
  enabled: boolean;
  /** Navigator override for tests (defaults to expo-router's). */
  navigation?: BackGuardNavigator | null;
}

export function confirmLeaveAlert(onLeave: () => void): void {
  Alert.alert("Leave workout?", "You have unsaved sets. Leave without saving?", [
    { text: "Stay", style: "cancel" },
    { text: "Leave", style: "destructive", onPress: onLeave },
  ]);
}

/**
 * Wire both back guards. `navigation` defaults to expo-router's hook, which
 * throws when no navigator is mounted (Jest) — the try/catch keeps the
 * Android guard (which the tests exercise) working there.
 */
export function useLiveBackGuard({
  enabled,
  navigation: navigationOverride,
}: UseLiveBackGuardInput): void {
  const router = useRouter();
  let hookNavigation: BackGuardNavigator | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    hookNavigation = useNavigation() as unknown as BackGuardNavigator;
  } catch {
    hookNavigation = null;
  }
  const navigation = navigationOverride !== undefined ? navigationOverride : hookNavigation;

  useAndroidBackHandler({
    enabled,
    onBack: () => {
      confirmLeaveAlert(() => router.back());
      return true;
    },
    backHandler: BackHandler,
  });

  useEffect(() => {
    if (!enabled || !navigation) return;
    navigation.setOptions({ gestureEnabled: false });
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      confirmLeaveAlert(() => navigation.dispatch(e.data.action));
    });
    return () => {
      navigation.setOptions({ gestureEnabled: true });
      unsubscribe();
    };
  }, [enabled, navigation]);
}
