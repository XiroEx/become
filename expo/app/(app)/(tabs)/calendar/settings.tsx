import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScheduleApiResponseSchema, slotDateKey } from "@become/api-client";
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
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useFetch("/api/schedule", ScheduleApiResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  const doc = data?.schedules?.[0] ?? null;
  // `settings` is typed by the shared schema now (it was `z.unknown()`, which
  // is why this used to cast). `startDate` is a 00:00Z DAY MARKER, so its day
  // is the date part — never a timezone conversion. `autoAdvance` is the form's
  // own state: webapp/models/Schedule.ts persists trainingDays and startDate
  // and nothing else, so the server never sends it.
  const settings = doc?.settings;
  const initial: ScheduleSettings = {
    trainingDays: settings?.trainingDays?.length
      ? settings.trainingDays
      : [1, 3, 5],
    startDate: settings?.startDate
      ? slotDateKey(settings.startDate)
      : today,
    autoAdvance: true,
  };

  const mutations = useScheduleMutations({
    getToken: () => token ?? undefined,
  });

  const onSubmit = async (next: ScheduleSettings) => {
    if (doc?.programId) {
      await mutations.updateSettings({
        programId: doc.programId,
        trainingDays: next.trainingDays,
        startDate: next.startDate,
      });
    }
    router.back();
  };

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
          {/* Keyed on the loaded settings so the form re-seeds once data lands. */}
          <ScheduleSettingsForm
            key={`${initial.trainingDays.join("-")}-${initial.startDate}`}
            initial={initial}
            onSubmit={onSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
