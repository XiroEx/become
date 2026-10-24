import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Play } from "lucide-react-native";
import { z } from "zod";
import { Text } from "@/components/Text";
import { WebGradient } from "@/components/WebGradient";
import { PingDot } from "@/components/motion/PingDot";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "@/lib/motion/reanimated";
import {
  apiFetch,
  WorkoutInProgressResponseSchema,
  type WorkoutInProgressResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { workoutIndexFromDayLabel } from "@/lib/schedule/scheduleSlots";
import {
  createLiveWorkoutCache,
  liveCacheKey,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import { ConfirmModal } from "@/components/workout/ConfirmModal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";
import { subscribeProgramUpdates } from "@/lib/programs/programEvents";
import { useScreenFocus } from "@/lib/navigation/useScreenFocus";
import { quickSessionOverviewHref } from "@/lib/quickSession/store";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  RESUME_ENTER_SCALE,
  RESUME_ENTER_SPRING,
  RESUME_ENTER_Y,
  RESUME_SHINE_DELAY_MS,
  RESUME_SHINE_MS,
} from "@/lib/motion/motion";
import { useLoopActive } from "@/lib/motion/useLoopActive";
import { usePressScale } from "@/lib/motion/usePressScale";

export interface ResumeWorkoutPillProps {
  className?: string;
  cacheStore?: KeyValueStore;
  initialData?: WorkoutInProgressResponse | null;
  testID?: string;
  onDiscard?: () => void;
}

export function ResumeWorkoutPill({
  className = "",
  cacheStore,
  initialData,
  testID = "resume-workout-pill",
  onDiscard,
}: ResumeWorkoutPillProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [data, setData] = useState<WorkoutInProgressResponse | null>(
    initialData ?? null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cache = useMemo(() => createLiveWorkoutCache(cacheStore), [cacheStore]);

  const fetchInProgress = useCallback(async () => {
    if (!token) return;
    try {
      const tz = new Date().getTimezoneOffset();
      const res = await apiFetch(
        `/api/workouts/in-progress?tz=${tz}`,
        WorkoutInProgressResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      if (mountedRef.current) {
        setData(res);
      }
    } catch {
      // Non-fatal: silent fallback if route fails or offline
    }
  }, [token]);

  useEffect(() => {
    if (initialData !== undefined) return;
    // Sync with external system: fetch in-progress workout on mount or auth change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInProgress();
  }, [initialData, fetchInProgress]);

  useEffect(() => {
    if (initialData !== undefined) return;
    return subscribeProgramUpdates(() => {
      void fetchInProgress();
    });
  }, [initialData, fetchInProgress]);

  useScreenFocus(
    useCallback(() => {
      if (initialData === undefined) {
        void fetchInProgress();
      }
    }, [initialData, fetchInProgress]),
  );

  const workout = data?.workout;
  const planned = data?.planned;
  const hasEntry = Boolean(workout || planned);

  const reduced = useReducedMotion();
  const loopActive = useLoopActive(hasEntry);
  const pressScale = usePressScale();

  // Web entrance (`ResumeWorkoutButton.tsx`):
  // `initial={{ opacity: 0, y: -8, scale: 0.96 }}`
  // `animate={{ opacity: 1, y: 0, scale: 1 }}`
  // `transition={{ type: 'spring', stiffness: 320, damping: 22 }}`
  const enterT = useSharedValue(1);
  const pillWidth = useSharedValue(340);
  const shineProgress = useSharedValue(0);

  useEffect(() => {
    if (!hasEntry || reduced) {
      enterT.set(1);
      return;
    }
    enterT.set(0);
    enterT.set(withSpring(1, RESUME_ENTER_SPRING));
  }, [hasEntry, reduced, enterT]);

  useEffect(() => {
    if (!loopActive || reduced) {
      cancelAnimation(shineProgress);
      shineProgress.set(0);
      return;
    }
    shineProgress.set(0);
    shineProgress.set(
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: RESUME_SHINE_MS,
            easing: Easing.inOut(Easing.ease),
          }),
          withDelay(RESUME_SHINE_DELAY_MS, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(shineProgress);
      shineProgress.set(0);
    };
  }, [loopActive, reduced, shineProgress]);

  const enterStyle = useAnimatedStyle(() => {
    const p = enterT.value;
    return {
      opacity: Math.max(0, Math.min(1, p)),
      transform: [
        { translateY: RESUME_ENTER_Y * (1 - p) },
        { scale: RESUME_ENTER_SCALE + (1 - RESUME_ENTER_SCALE) * p },
      ],
    };
  });

  const shineStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (-1 + 3 * shineProgress.value) * pillWidth.value },
    ],
  }));

  if (!workout && !planned) {
    return null;
  }

  const isPlanned = !workout && !!planned;
  const shineColors = [
    rgbOf(becomingStageTokens.ink, 0),
    rgbOf(becomingStageTokens.ink, 0.3),
    rgbOf(becomingStageTokens.ink, 0),
  ] as const;
  const label = isPlanned
    ? planned.title || "Quick session"
    : workout?.kind === "quick"
      ? workout.title || "Quick session"
      : workout?.day || "Workout";

  const handlePress = () => {
    if (workout) {
      if (workout.kind === "program" && workout.programId) {
        const phaseIndex =
          workout.phase != null ? Math.max(0, workout.phase - 1) : 0;
        const workoutIndex = workoutIndexFromDayLabel(workout.day ?? undefined);
        const dayParam = workout.day
          ? `&day=${encodeURIComponent(workout.day)}`
          : "";
        const scheduledDate = (workout as { scheduledDate?: string }).scheduledDate;
        const sdParam = scheduledDate
          ? `&sd=${encodeURIComponent(scheduledDate)}`
          : "";
        router.push(
          `/(tabs)/programming/${encodeURIComponent(workout.programId)}/workout/${workoutIndex}/live?phase=${phaseIndex}${dayParam}${sdParam}`,
        );
      } else if (workout.sessionId) {
        router.push(
          quickSessionOverviewHref(workout.sessionId, {
            saved: true,
            started: true,
          }) as never,
        );
      }
    } else if (planned?.sessionId) {
      router.push(
        quickSessionOverviewHref(planned.sessionId, {
          saved: true,
        }) as never,
      );
    }
  };

  const handleLongPress = () => {
    setConfirmOpen(true);
  };

  const handleConfirmDiscard = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      if (workout) {
        if (workout.kind === "quick" && workout.sessionId) {
          await apiFetch(
            `/api/workouts/session?id=${encodeURIComponent(workout.sessionId)}`,
            z.unknown(),
            {
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
              method: "DELETE",
            },
          );
        } else if (workout.kind === "program" && workout.programId && workout.day) {
          const tz = new Date().getTimezoneOffset();
          await apiFetch(
            `/api/workouts?programId=${encodeURIComponent(workout.programId)}&day=${encodeURIComponent(workout.day)}&tz=${tz}`,
            z.unknown(),
            {
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
              method: "DELETE",
            },
          );
          const phaseIndex =
            workout.phase != null ? Math.max(0, workout.phase - 1) : 0;
          const workoutIndex = workoutIndexFromDayLabel(workout.day);
          const cacheKey = liveCacheKey(workout.programId, workoutIndex, phaseIndex);
          await cache.clear(cacheKey);
        }
      } else if (planned?.sessionId) {
        await apiFetch(
          `/api/workouts/session?id=${encodeURIComponent(planned.sessionId)}`,
          z.unknown(),
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            method: "DELETE",
          },
        );
      }
      setData({ workout: null, planned: null });
      onDiscard?.();
    } catch {
      // Re-fetch to reconcile with server
      await fetchInProgress();
    } finally {
      if (mountedRef.current) {
        setDeleting(false);
        setConfirmOpen(false);
      }
    }
  };

  return (
    <Animated.View
      className={`relative ${className}`}
      style={[reduced ? undefined : enterStyle, pressScale.style]}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={
          isPlanned
            ? `Start ${label}. Long press to delete this workout.`
            : `Get back into ${label}. Long press to delete this workout.`
        }
        accessibilityHint="Long press to discard workout"
        onPress={handlePress}
        onPressIn={pressScale.onPressIn}
        onPressOut={pressScale.onPressOut}
        onLongPress={handleLongPress}
        delayLongPress={500}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) pillWidth.set(w);
        }}
        className="overflow-hidden rounded-2xl p-4 bg-emerald-600 active:opacity-90 shadow-md"
      >
        {loopActive && !reduced ? (
          <Animated.View
            testID="resume-workout-shine"
            pointerEvents="none"
            importantForAccessibility="no"
            style={[StyleSheet.absoluteFill, shineStyle]}
          >
            <WebGradient colors={shineColors} direction="r" fill />
          </Animated.View>
        ) : null}

        <View className="flex-row items-center gap-3">
          {/* Active dot: pinging ring when mid-workout, static when planned */}
          {!isPlanned ? (
            <PingDot
              testID="resume-live-pulse-dot"
              color={colors["brand-foreground"]}
              size={12}
              active
            />
          ) : (
            <View className="h-3 w-3 rounded-full bg-white items-center justify-center" />
          )}

          <View className="flex-1 min-w-0">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-white/80">
              {isPlanned ? "Today · " : "Active · "}
              {label}
            </Text>
            <Text className="text-base font-bold text-white truncate">
              {isPlanned ? "Start Workout" : "Get back into the workout"}
            </Text>
          </View>

          <View className="h-10 w-10 rounded-full bg-white/20 items-center justify-center">
            <Play size={18} color={colors["primary-foreground"]} fill={colors["primary-foreground"]} />
          </View>
        </View>
      </Pressable>

      {/* Accessible discard trigger */}
      <Pressable
        testID="resume-discard-trigger"
        accessibilityRole="button"
        accessibilityLabel="Discard workout"
        onPress={handleLongPress}
        style={{ position: "absolute", top: 0, right: 0, width: 44, height: 44 }}
      />

      <ConfirmModal
        open={confirmOpen}
        title="Delete this workout?"
        body={
          isPlanned
            ? "This removes today's planned workout completely — on the dashboard, in the workout section, and on the calendar. This can't be undone."
            : "This removes the in-progress workout completely — on the dashboard, in the workout section, and on the calendar. This can't be undone."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete workout"}
        cancelLabel="Keep it"
        destructive
        onConfirm={handleConfirmDiscard}
        onCancel={() => setConfirmOpen(false)}
        testID="resume-confirm-modal"
      />
    </Animated.View>
  );
}
