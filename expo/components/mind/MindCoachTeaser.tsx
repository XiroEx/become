import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { CoachChat } from "@/components/ai/CoachChat";

/**
 * The Mind coach entry point (NP-155). Native port of
 * `webapp/components/mind/MindCoachTeaser.tsx`: opens the shared CoachChat
 * against `POST /api/ai/consultant` (domain `mindset`) — the same route,
 * same fallback, same refusal rules as the web.
 */
export function MindCoachTeaser({ testID = "mind-coach-teaser" }: { testID?: string }) {
  const { colors } = useThemeTokens();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Talk to your coach"
        onPress={() => setOpen(true)}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.muted,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Sparkles size={18} color={colors["primary-foreground"]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text className="text-foreground text-sm font-semibold">Talk to your coach</Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              Work through the resistance, the doubt, the next move.
            </Text>
          </View>
          <ChevronRight size={18} color={colors["muted-foreground"]} />
        </View>
      </Pressable>

      <CoachChat
        testID="mind-coach-chat"
        visible={open}
        onClose={() => setOpen(false)}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        runLabel="Coach is replying"
        title="Your mindset coach"
        subtitle="Here for the hard part"
        greeting="I'm here. What's loudest right now — the resistance, the doubt, something you're avoiding? Say it plainly and we'll work it."
        placeholder="Type what you're working through…"
        suggestions={[
          "I keep starting and quitting",
          "I don't feel like showing up today",
          "I'm scared I'll fail again",
        ]}
      />
    </>
  );
}

export default MindCoachTeaser;
