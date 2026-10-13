import { useState } from "react";
import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { CoachChat } from "@/components/ai/CoachChat";

export interface NutritionConsultantTeaserProps {
  /** Calories and protein left today, for a tailored first suggestion. */
  remaining?: { calories: number; protein: number };
  testID?: string;
}

/**
 * The nutrition consultant entry point (NP-155). Native port of
 * `webapp/components/nutrition/NutritionAITeaser.tsx`: opens the shared
 * CoachChat against `POST /api/ai/nutrition/consultant` — same route, same
 * fallback, same refusal rules as the web. When there is real daily budget
 * left, the FIRST suggested prompt quotes it (calories + protein), letter
 * for letter the web's formula: `goal - consumed`, floored at 0 and rounded.
 */
export function NutritionConsultantTeaser({
  remaining,
  testID = "nutrition-consultant-teaser",
}: NutritionConsultantTeaserProps) {
  const { colors, tint } = useThemeTokens();
  const [open, setOpen] = useState(false);

  // Mirrors `NutritionAITeaser.tsx`: lead with a tailored nudge only once
  // there is a meaningful amount of budget left today.
  const hasRemaining = !!remaining && (remaining.calories > 50 || remaining.protein > 5);
  const macrosPrompt = hasRemaining
    ? `What should I eat to hit my remaining ${Math.max(0, Math.round(remaining!.calories))} cal and ${Math.max(0, Math.round(remaining!.protein))}g protein today?`
    : null;
  const suggestions = [
    ...(macrosPrompt ? [macrosPrompt] : []),
    "Plan my dinner around 40g protein",
    "Is my day on track?",
    "Quick high-protein snacks",
  ];

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Your nutrition consultant"
        onPress={() => setOpen(true)}
        style={{ borderRadius: 16, overflow: "hidden" }}
      >
        <LinearGradient
          colors={[tint("mind-emerald", 0.08), tint("teal", 0.08)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: tint("mind-emerald", 0.25),
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <LinearGradient
              colors={[colors["mind-emerald"], colors.teal]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Sparkles size={20} color={colors["primary-foreground"]} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-sm font-semibold">
                Your nutrition consultant
              </Text>
              <Text testID={`${testID}-subtitle`} className="text-muted-foreground text-xs" numberOfLines={1}>
                {hasRemaining
                  ? `Hit your last ${Math.max(0, Math.round(remaining!.calories))} cal — tap for a suggestion.`
                  : "Meal plans, macro help, and real answers for your goals."}
              </Text>
            </View>
            <ChevronRight size={20} color={colors["muted-foreground"]} />
          </View>
        </LinearGradient>
      </Pressable>

      <CoachChat
        testID="nutrition-consultant-chat"
        visible={open}
        onClose={() => setOpen(false)}
        // Teal, not the brand red every other coach uses — matches the
        // web's `accentFrom="from-emerald-500" accentTo="to-teal-500"` on
        // this one sheet (NP-262).
        accentColor={colors.teal}
        endpoint="/api/ai/nutrition/consultant"
        domain="nutrition"
        persistKey="nutrition-consultant"
        runLabel="Consultant is replying"
        title="Your nutrition consultant"
        subtitle="Grounded in your goals and logs"
        greeting="Hey — I'm here to help you eat in a way that actually works for you. What are you trying to figure out? Macro targets, what to eat before a workout, how to hit your protein without losing your mind — ask anything."
        placeholder="Ask about your nutrition…"
        suggestions={suggestions}
      />
    </>
  );
}

export default NutritionConsultantTeaser;
