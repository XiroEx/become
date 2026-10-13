import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "@/components/Text";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import { TierGate } from "@/components/entitlements/TierGate";
import StateShiftDashboard from "@/components/mind/StateShiftDashboard";
import SelfImageDashboard from "@/components/mind/SelfImageDashboard";
import MissionDashboard from "@/components/mind/MissionDashboard";
import VisionDashboard from "@/components/mind/VisionDashboard";
import DisciplineDashboard from "@/components/mind/DisciplineDashboard";
import AntiSabotageDashboard from "@/components/mind/AntiSabotageDashboard";
import SocialDashboard from "@/components/mind/SocialDashboard";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useScrollFocusedFieldIntoView } from "@/lib/keyboard/useScrollFocusedFieldIntoView";

export const SECTION_LABELS: Record<string, string> = {
  "state-shift": "State Shift",
  "self-image": "Self-Image",
  mission: "Mission",
  discipline: "Discipline",
  "anti-sabotage": "Anti-Sabotage",
  social: "Social",
  vision: "Vision",
};

export default function MindSectionRoute() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = params.section ?? "state-shift";
  const label = SECTION_LABELS[section] ?? section;

  // NP-319: Vision's edit form (the Environment field, among others) is a
  // plain screen, not a sheet — real keyboard avoidance alone still leaves a
  // focused field unreachable on Android, which has no built-in "scroll the
  // focused TextInput into view" the way iOS does.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, setActiveField } = useScrollFocusedFieldIntoView(scrollRef);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/mind" as any);
    }
  };

  return (
    <SafeAreaView
      testID="mind-section-screen"
      className="flex-1 bg-background"
      edges={["top"]}
    >
      {/* Header */}
      <View
        testID="mind-section-header"
        className="flex-row items-center gap-3 border-b border-border px-4 py-3"
      >
        <Pressable
          testID="mind-section-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          className="h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">{label}</Text>
      </View>

      {/* Body with Intro Gate */}
      <View testID="mind-section-body" className="flex-1">
        <ToolIntroGate system={section} onExit={handleBack}>
          {/* NP-319: real Android keyboard avoidance — "undefined" did
              nothing. "height" is computed from the keyboard-show event, not
              a window resize, which Android 15's edge-to-edge no longer
              triggers for this screen. */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={scrollRef}
              onScroll={onScroll}
              scrollEventThrottle={16}
              className="flex-1 p-4"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {section === "state-shift" && <StateShiftDashboard />}
              {section === "self-image" && <SelfImageDashboard />}
              {section === "mission" && <MissionDashboard />}
              {section === "discipline" && <DisciplineDashboard />}
              {section === "anti-sabotage" && <AntiSabotageDashboard />}
              {section === "social" && <SocialDashboard />}
              {section === "vision" && (
                <TierGate feature="vision">
                  <VisionDashboard setActiveField={setActiveField} />
                </TierGate>
              )}
              {!["state-shift", "self-image", "mission", "discipline", "anti-sabotage", "social", "vision"].includes(section) && (
                <View className="items-center justify-center p-8">
                  <Text className="text-center text-sm text-muted-foreground">
                    {label} is coming soon.
                  </Text>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </ToolIntroGate>
      </View>
    </SafeAreaView>
  );
}
