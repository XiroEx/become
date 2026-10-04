import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { X } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { ExerciseSuggestion } from "@become/api-client";

export interface ExerciseHintProps {
  /** The suggestion for THIS exercise — the caller picks it by slug. */
  hint: Pick<ExerciseSuggestion, "id" | "title" | "body">;
  /** Exercise slug, used only to namespace the test ids. */
  exerciseSlug: string;
  /** Fires with the hint id; the caller removes it and POSTs the dismissal. */
  onDismiss?: (id: string) => void;
  testID?: string;
}

/**
 * The web's in-workout nudge
 * (`webapp/.../workout/live/LiveWorkoutClient.tsx`, the contextual-nudge
 * block): an amber card under the exercise header carrying the suggestion's
 * title + body, with a dismiss that silences it on the account. Rendered
 * beside the Last/PR lines the NP-222 slice adds — a reference, never
 * prefill, and null when there is no hint for this exercise.
 */
export function ExerciseHint({
  hint,
  exerciseSlug,
  onDismiss,
  testID,
}: ExerciseHintProps) {
  const { colors, tint } = useThemeTokens();
  const tid = testID ?? `exercise-hint-${exerciseSlug}`;
  return (
    <View
      testID={tid}
      accessibilityRole="summary"
      accessibilityLabel={`${hint.title}. ${hint.body}`}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: tint("accent", 0.35),
        backgroundColor: tint("accent", 0.1),
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text
        testID={`${tid}-icon`}
        accessibilityElementsHidden
        className="text-sm mt-0.5"
      >
        ⚡
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          testID={`${tid}-title`}
          className="text-accent text-xs font-bold uppercase tracking-wide"
        >
          {hint.title}
        </Text>
        <Text
          testID={`${tid}-body`}
          className="text-accent text-xs leading-snug mt-0.5 opacity-80"
        >
          {hint.body}
        </Text>
      </View>
      <Pressable
        testID={`${tid}-dismiss`}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${hint.title}`}
        onPress={() => onDismiss?.(hint.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ padding: 4 }}
      >
        <X size={14} color={colors["muted-foreground"]} />
      </Pressable>
    </View>
  );
}

/**
 * Key a suggestion list by exercise slug — the web's fetch-then-map shape
 * (`LiveWorkoutClient.tsx` / `WorkoutFormClient.tsx`): first suggestion per
 * slug wins, entries without a `sourceData.exerciseSlug` are dropped.
 */
export function exerciseHintsBySlug(
  suggestions: readonly ExerciseSuggestion[] | null | undefined,
): Record<string, ExerciseSuggestion> {
  const map: Record<string, ExerciseSuggestion> = {};
  for (const s of suggestions ?? []) {
    const raw = s.sourceData?.["exerciseSlug"];
    const slug = String(raw ?? "").toLowerCase();
    if (!slug || map[slug]) continue;
    map[slug] = s;
  }
  return map;
}
