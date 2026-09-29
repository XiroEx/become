import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScheduleApiResponseSchema } from "@become/api-client";
import { ScheduleSettingsForm } from "@/components/schedule/ScheduleSettingsForm";
import type { ScheduleSettings } from "@/lib/schedule/scheduleSettings";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useScheduleMutations } from "@/lib/schedule/useScheduleMutations";

export default function CalendarSettingsRoute() {
  const router = useRouter();
  const { token } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useFetch("/api/schedule", ScheduleApiResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  const doc = data?.schedules?.[0] ?? null;
  const settings = (doc?.settings ?? {}) as {
    trainingDays?: number[];
    startDate?: string;
    autoAdvance?: boolean;
  };
  const initial: ScheduleSettings = {
    trainingDays: settings.trainingDays ?? [1, 3, 5],
    startDate: settings.startDate?.slice(0, 10) ?? today,
    autoAdvance: settings.autoAdvance ?? true,
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
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
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
