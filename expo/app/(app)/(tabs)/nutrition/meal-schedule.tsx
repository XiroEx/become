import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Pressable,
} from "react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { ChevronLeft } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { MealScheduleEditor } from "@/components/nutrition/MealScheduleEditor";

export default function MealScheduleRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="meal-schedule-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="meal-schedule-route-kav"
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to nutrition"
              testID="meal-schedule-back-button"
              onPress={() => router.back()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ChevronLeft size={20} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-2xl font-bold">
                Meal Schedule
              </Text>
              <Text className="text-muted-foreground text-sm">
                When each meal usually happens
              </Text>
            </View>
          </View>

          {/* Explainer Card */}
          <Card testID="meal-schedule-explainer-card">
            <Text className="text-foreground text-xs leading-relaxed">
              These times only set <Text className="font-semibold">defaults</Text>. They pick which tag is selected when you open food search, and they place a planned meal in the right spot on your day. You can always log any tag at any time.
            </Text>
            <Text className="text-muted-foreground text-xs leading-relaxed mt-2">
              Leave a meal blank if it does not have a set time. If your shift moves, “Before Work” is better left open than pinned to an hour that is usually wrong.
            </Text>
            <Text className="text-muted-foreground text-xs leading-relaxed mt-2">
              The <Text className="font-semibold">order</Text> below is your day’s shape. Anything you log without a time lands in this sequence rather than at a clock position.
            </Text>
          </Card>

          {/* Editor Form */}
          <MealScheduleEditor onBack={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
