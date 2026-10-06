import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramDetailResponseSchema,
  ActiveProgramsApiResponseSchema,
  ScheduleApiResponseSchema,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { ScheduleSetup } from "@/components/programs/ScheduleSetup";
import { createSchedule } from "@/lib/programs/enrollment";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function ScheduleSetupRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();
  const { colors } = useThemeTokens();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const programFetch = useFetch(
    id ? `/api/programs/${encodeURIComponent(id)}` : null,
    ProgramDetailResponseSchema,
    fetchOpts,
  );

  const activeFetch = useFetch(
    "/api/programs/active",
    ActiveProgramsApiResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const tz = new Date().getTimezoneOffset();
  const scheduleFetch = useFetch(
    id
      ? `/api/schedule?programId=${encodeURIComponent(id)}&view=all&tz=${tz}`
      : null,
    ScheduleApiResponseSchema,
    { ...fetchOpts, skip: !token },
  );

  const program = programFetch.data;
  const existingSchedule = useMemo(() => {
    return (
      scheduleFetch.data?.schedules?.find((s) => s.programId === id) ?? null
    );
  }, [scheduleFetch.data?.schedules, id]);

  const enrolledStartDate = useMemo(() => {
    const match = activeFetch.data?.activePrograms?.find(
      (p) => p.programId === id,
    );
    if (!match?.startDate) return undefined;
    return typeof match.startDate === "string"
      ? match.startDate.split("T")[0]
      : undefined;
  }, [activeFetch.data?.activePrograms, id]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = useCallback(
    async (settings: { trainingDays: number[]; startDate: string }) => {
      setSubmitting(true);
      setError(null);
      try {
        await createSchedule(fetchOpts, {
          programId: id,
          trainingDays: settings.trainingDays,
          startDate: settings.startDate,
        });
        // Return to program detail after setup
        router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create schedule",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [fetchOpts, id, router],
  );

  const onSkip = useCallback(() => {
    router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`);
  }, [router, id]);

  // NP-285: view mode's "View Full Calendar" and "Edit Training Days" CTAs —
  // the Calendar tab and its settings screen, same destinations as the web's
  // `/dashboard/calendar` and `/dashboard/calendar/settings` links.
  const onViewCalendar = useCallback(() => {
    router.push("/(tabs)/calendar");
  }, [router]);

  const onEditTrainingDays = useCallback(() => {
    router.push("/(tabs)/calendar/settings");
  }, [router]);

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing program id</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="schedule-setup-route"
    >
      <ScheduleSetup
        key={`${id}-${program?.training_days_per_week ?? "loading"}-${existingSchedule ? "view" : "create"}`}
        programId={id}
        programName={program?.name ?? "Program"}
        trainingDaysPerWeek={program?.training_days_per_week ?? 4}
        durationWeeks={program?.duration_weeks ?? 4}
        initialStartDate={enrolledStartDate}
        existingSchedule={existingSchedule}
        onConfirm={onConfirm}
        onSkip={onSkip}
        onViewCalendar={onViewCalendar}
        onEditTrainingDays={onEditTrainingDays}
        submitting={submitting}
        error={error}
        loading={programFetch.loading || activeFetch.loading || scheduleFetch.loading}
      />
    </SafeAreaView>
  );
}
