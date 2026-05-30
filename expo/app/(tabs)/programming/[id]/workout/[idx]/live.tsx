import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramDetailResponseSchema,
  WorkoutSaveResponseSchema,
  ExerciseAlternativesResponseSchema,
  type WorkoutSaveRequest,
  type WorkoutSaveResponse,
  type NewPR,
  type AlternativeCandidate,
} from "@become/api-client";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
  type LiveGrid,
} from "@/components/live/LiveWorkoutClient";
import { ExerciseSwapModal } from "@/components/live/ExerciseSwapModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";
import { toWorkoutOverview } from "@/lib/programs/programDetail";
import { buildWorkoutSaveRequest } from "@/lib/live/workoutSave";
import {
  createLiveWorkoutCache,
  liveCacheKey,
  type KeyValueStore,
  type LiveWorkoutSnapshot,
} from "@/lib/live/liveWorkoutCache";

export interface LiveWorkoutRouteProps {
  /** DI for tests — defaults to the SecureStore-backed cache. */
  cacheStore?: KeyValueStore;
}

/**
 * Live workout route. Loads the program, slices the workout at (phase, idx),
 * and drives the per-set logging state machine in LiveWorkoutClient. In-flight
 * sets are mirrored to a SecureStore cache so exit/re-enter restores them.
 */
export default function LiveWorkoutRoute({
  cacheStore,
}: LiveWorkoutRouteProps = {}) {
  const params = useLocalSearchParams<{
    id?: string;
    idx?: string;
    phase?: string;
  }>();
  const id = typeof params.id === "string" ? params.id : "";
  const idx = Number(params.idx ?? -1);
  const phaseIndex = Number(params.phase ?? 0);
  const { token } = useAuth();

  const valid = !!id && Number.isFinite(idx) && idx >= 0;
  const resolvedPhase =
    Number.isFinite(phaseIndex) && phaseIndex >= 0 ? phaseIndex : 0;

  const { data } = useFetch(
    valid ? `/api/programs/${encodeURIComponent(id)}` : null,
    ProgramDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const cache = useMemo(() => createLiveWorkoutCache(cacheStore), [cacheStore]);
  const cacheKey = liveCacheKey(id, idx, resolvedPhase);

  // Restore any in-flight sets persisted on a prior visit.
  const [restoredGrid, setRestoredGrid] = useState<LiveGrid | null>(null);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!valid || restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    void cache.load(cacheKey).then((snap) => {
      if (!cancelled && snap) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRestoredGrid(snap as LiveGrid);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [valid, cache, cacheKey]);

  const onGridChange = useCallback(
    (grid: LiveGrid) => {
      void cache.save(cacheKey, grid as LiveWorkoutSnapshot);
    },
    [cache, cacheKey],
  );

  const rawWorkout = data?.phases?.[resolvedPhase]?.workouts?.[idx] ?? null;
  const dayLabel = rawWorkout?.day ?? `Day ${idx + 1}`;

  // Local swap overrides (slug → replacement name) applied to the rendered VM.
  const [swaps, setSwaps] = useState<Record<string, string>>({});

  const workout: LiveWorkoutViewModel | null = useMemo(() => {
    if (!data) return null;
    const overview = toWorkoutOverview(data, resolvedPhase, idx);
    if (!overview) return null;
    return {
      programId: id,
      workoutTitle: overview.title,
      exercises: (rawWorkout?.exercises ?? []).map((ex, i) => {
        const slug = ex.exerciseSlug ?? `exercise-${i}`;
        const raw = ex as {
          groupId?: string;
          groupType?: string;
          groupLabel?: string;
          trackingType?: string;
        };
        return {
          slug,
          name: swaps[slug] ?? ex.name ?? ex.exerciseSlug ?? "Exercise",
          sets: ex.sets ?? 1,
          repsLabel: ex.reps,
          notes: ex.details,
          ...(raw.trackingType ? { trackingType: raw.trackingType } : {}),
          ...(raw.groupId ? { groupId: raw.groupId } : {}),
          ...(raw.groupLabel || raw.groupType
            ? { groupLabel: raw.groupLabel ?? raw.groupType }
            : {}),
        };
      }),
    };
  }, [data, resolvedPhase, idx, id, rawWorkout, swaps]);

  // Swap picker: GET /api/exercises/alternatives?slug=… on request.
  const [swapSlug, setSwapSlug] = useState<string | null>(null);
  const alternatives = useFetch(
    swapSlug
      ? `/api/exercises/alternatives?slug=${encodeURIComponent(swapSlug)}`
      : null,
    ExerciseAlternativesResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );
  const swapSourceName =
    workout?.exercises.find((e) => e.slug === swapSlug)?.name;
  const onRequestSwap = useCallback((slug: string) => setSwapSlug(slug), []);
  const onSelectAlternative = useCallback(
    (candidate: AlternativeCandidate) => {
      if (swapSlug) {
        setSwaps((prev) => ({ ...prev, [swapSlug]: candidate.name }));
      }
      setSwapSlug(null);
    },
    [swapSlug],
  );

  // Completion save → POST /api/workouts; server runs PR detection and returns
  // any newly-achieved PRs, which we surface in a banner. Cache is cleared on
  // a successful save so a stale in-flight snapshot doesn't resurface.
  const saveMutation = useMutation<WorkoutSaveRequest, WorkoutSaveResponse>(
    "/api/workouts",
    WorkoutSaveResponseSchema,
    {
      method: "POST",
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );
  const [finishing, setFinishing] = useState(false);
  const [prs, setPrs] = useState<NewPR[]>([]);

  const onFinish = useCallback(
    (grid: LiveGrid) => {
      if (!workout) return;
      const request = buildWorkoutSaveRequest({
        programId: id,
        phase: resolvedPhase + 1, // server expects a 1-based phase number
        day: dayLabel,
        exercises: workout.exercises,
        grid,
        completed: true,
      });
      setFinishing(true);
      void saveMutation
        .mutate(request)
        .then((res) => {
          setPrs(res.newPRsAchieved ?? []);
          void cache.clear(cacheKey);
        })
        .catch(() => {
          // Keep the cache so the user can retry without losing logged sets.
        })
        .finally(() => setFinishing(false));
    },
    [workout, id, resolvedPhase, dayLabel, saveMutation, cache, cacheKey],
  );

  if (!valid) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Invalid workout</Text>
        </View>
      </SafeAreaView>
    );
  }

  const vm: LiveWorkoutViewModel = workout ?? {
    programId: id,
    workoutTitle: "Loading…",
    exercises: [],
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0a" }}>
      {prs.length > 0 ? (
        <View
          testID="live-pr-banner"
          style={{ padding: 12, backgroundColor: "#1c2b14" }}
        >
          <Text className="text-primary font-semibold">
            🎉 New PR{prs.length === 1 ? "" : "s"}!
          </Text>
          {prs.map((pr) => (
            <Text
              key={pr.exerciseSlug}
              testID={`live-pr-${pr.exerciseSlug}`}
              className="text-foreground text-sm"
            >
              {pr.exerciseName}: {pr.dimensions.join(", ")}
            </Text>
          ))}
        </View>
      ) : null}
      <LiveWorkoutClient
        workout={vm}
        restoredGrid={restoredGrid}
        onGridChange={onGridChange}
        onFinish={onFinish}
        finishing={finishing}
        onRequestSwap={onRequestSwap}
      />
      <ExerciseSwapModal
        visible={swapSlug !== null}
        sourceName={swapSourceName}
        alternatives={alternatives.data?.alternatives ?? []}
        loading={alternatives.loading}
        onSelect={onSelectAlternative}
        onClose={() => setSwapSlug(null)}
      />
    </View>
  );
}
