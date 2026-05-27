import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScheduleSettingsForm } from "@/components/schedule/ScheduleSettingsForm";

export default function CalendarSettingsRoute() {
  const router = useRouter();
  // Placeholder initial settings — real hydrate via /api/schedule/settings
  // lands in a follow-up.
  const today = new Date().toISOString().slice(0, 10);

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
          <ScheduleSettingsForm
            initial={{
              trainingDays: [1, 3, 5],
              startDate: today,
              autoAdvance: true,
            }}
            onSubmit={async () => {
              router.back();
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
