import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "@/components/Text";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import { TierGate } from "@/components/entitlements/TierGate";
import StateShiftDashboard from "@/components/mind/StateShiftDashboard";
import SelfImageDashboard from "@/components/mind/SelfImageDashboard";
import MissionDashboard from "@/components/mind/MissionDashboard";
import DisciplineDashboard from "@/components/mind/DisciplineDashboard";
import AntiSabotageDashboard from "@/components/mind/AntiSabotageDashboard";
import SocialDashboard from "@/components/mind/SocialDashboard";
import VisionDashboard from "@/components/mind/VisionDashboard";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

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
          <ScrollView
            className="flex-1 p-4"
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {section === "state-shift" && <StateShiftDashboard />}
            {section === "self-image" && <SelfImageDashboard />}
            {section === "mission" && <MissionDashboard />}
            {section === "discipline" && <DisciplineDashboard />}
            {section === "anti-sabotage" && <AntiSabotageDashboard />}
            {section === "social" && <SocialDashboard />}
            {/* Vision is the one tool that is a plan feature rather than a
                chapter unlock. One wrap covers the whole surface — every action
                inside it would otherwise 403. */}
            {section === "vision" && (
              <TierGate
                feature="vision"
                description="Paint the future you across five domains, then check your alignment daily."
              >
                <VisionDashboard />
              </TierGate>
            )}
            {![
              "state-shift",
              "self-image",
              "mission",
              "discipline",
              "anti-sabotage",
              "social",
              "vision",
            ].includes(section) && (
              <View className="items-center justify-center p-8">
                <Text className="text-center text-sm text-muted-foreground">
                  {label} is coming soon.
                </Text>
              </View>
            )}
          </ScrollView>
        </ToolIntroGate>
      </View>
    </SafeAreaView>
  );
}
