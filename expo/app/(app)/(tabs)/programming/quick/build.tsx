import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Dumbbell } from "lucide-react-native";
import { Text } from "@/components/Text";
import { SessionBuilder } from "@/components/workout/SessionBuilder";
import { takeImportedSessionDraft } from "@/lib/quickSession/importHandoff";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/**
 * BUILD A SESSION BY HAND (NP-137) — the native Sessions-tab builder screen.
 *
 * The web's `SessionBuilder` lives in the hub's Sessions tab
 * (`webapp/components/SessionBuilder.tsx`); natively the builder is its own
 * route (`/(tabs)/programming/quick/build`, reached from the Sessions hub's
 * Build button) rendering the same component the overview will later reuse.
 * Starting, logging (past date) or planning (future date) hands off to the
 * quick-session overview / live routes through the stash, exactly as the web
 * hands off through its stash.
 *
 * Reached pre-filled from the Sessions hub's Import (NP-243): the handoff
 * (`@/lib/quickSession/importHandoff.ts`) is taken exactly once, on mount —
 * a lazy `useState` initializer rather than an effect, so a draft is never
 * read twice and a cold re-entry (deep link, reload) never replays a stale
 * one.
 */
export default function SessionBuildRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const [initialDraft] = useState(() => takeImportedSessionDraft() ?? undefined);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="session-build-route"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}
        >
          <Pressable
            testID="session-build-back"
            accessibilityRole="button"
            accessibilityLabel="Back to sessions"
            onPress={() => router.back()}
            style={{ padding: 8, ...minTouchTarget }}
          >
            <ChevronLeft color={colors.foreground} size={22} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Dumbbell color={colors.primary} size={20} strokeWidth={2} />
            <Text className="text-foreground text-2xl font-bold">Build a session</Text>
          </View>
        </View>

        <SessionBuilder testID="session-builder" initialDraft={initialDraft} />
      </ScrollView>
    </SafeAreaView>
  );
}
