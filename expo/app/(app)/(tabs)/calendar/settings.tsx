import { useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScheduleApiResponseSchema } from "@become/api-client";
import { Card } from "@/components/Card";
import { ScheduleSettingsForm } from "@/components/schedule/ScheduleSettingsForm";
import type { ScheduleSettings } from "@/lib/schedule/scheduleSettings";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useScheduleMutations } from "@/lib/schedule/useScheduleMutations";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function CalendarSettingsRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const [savingProgramId, setSavingProgramId] = useState<string | null>(null);

  const { data, loading } = useFetch("/api/schedule", ScheduleApiResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  const schedules = data?.schedules ?? [];

  const mutations = useScheduleMutations({
    getToken: () => token ?? undefined,
  });

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="calendar-settings-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="calendar-settings-route-kav"
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text className="text-foreground text-2xl font-bold">
            Schedule settings
          </Text>

          {loading && schedules.length === 0 ? (
            <Text className="text-muted-foreground" testID="calendar-settings-loading">
              Loading schedule settings...
            </Text>
          ) : null}

          {!loading && schedules.length === 0 ? (
            <Text
              className="text-muted-foreground text-center mt-8"
              testID="calendar-settings-empty"
            >
              No schedules to manage.
            </Text>
          ) : null}

          {schedules.map((schedule, index) => {
            const settings = schedule.settings;
            const initial: ScheduleSettings = {
              trainingDays: settings?.trainingDays?.length
                ? settings.trainingDays
                : [1, 3, 5],
            };
            const completedCount =
              schedule.scheduledWorkouts?.filter((w) => w.status === "completed")
                .length ?? 0;
            const totalCount = schedule.scheduledWorkouts?.length ?? 0;
            const subtitle =
              totalCount > 0
                ? `${completedCount}/${totalCount} workouts completed`
                : undefined;
            const formTestId =
              schedules.length === 1
                ? "schedule-settings"
                : `schedule-settings-${schedule.programId}`;

            return (
              <Card
                key={schedule.programId || `schedule-${index}`}
                testID={`schedule-card-${schedule.programId || index}`}
                title={schedule.programName || schedule.programId}
                subtitle={subtitle}
              >
                <ScheduleSettingsForm
                  key={`${schedule.programId}-${initial.trainingDays.join("-")}`}
                  initial={initial}
                  testID={formTestId}
                  saving={savingProgramId === schedule.programId}
                  onSubmit={async (next: ScheduleSettings) => {
                    if (schedule.programId) {
                      setSavingProgramId(schedule.programId);
                      try {
                        await mutations.updateSettings({
                          programId: schedule.programId,
                          trainingDays: next.trainingDays,
                        });
                      } finally {
                        setSavingProgramId(null);
                      }
                    }
                    router.back();
                  }}
                />
              </Card>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
