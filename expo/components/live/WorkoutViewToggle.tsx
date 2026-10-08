import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/** The two ways to see one workout. */
export type WorkoutView = "track" | "live";

export interface WorkoutViewToggleProps {
  active: WorkoutView;
  onChange: (view: WorkoutView) => void;
  testID?: string;
}

/**
 * Segmented Track | Live control, the native twin of
 * `webapp/components/workout/WorkoutViewToggle.tsx`.
 *
 * The web's two views are two PAGES, so its toggle is a `router.replace` and
 * the shared progress travels through the server plus the remembered position.
 * Natively they are two renderings of one screen over one grid, so the toggle
 * is a state change: nothing to reload, nothing to lose, and the set you were
 * standing on is the set the other view opens on.
 */
export function WorkoutViewToggle({
  active,
  onChange,
  testID = "workout-view-toggle",
}: WorkoutViewToggleProps) {
  const { colors } = useThemeTokens();

  const segment = (view: WorkoutView, label: string) => {
    const selected = active === view;
    return (
      <Pressable
        testID={`${testID}-${view}`}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label} view`}
        onPress={() => {
          if (!selected) onChange(view);
        }}
        style={[
          minTouchTarget,
          {
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 4,
            backgroundColor: selected ? colors.foreground : "transparent",
          },
        ]}
      >
        <Text
          className={`text-xs font-semibold ${
            selected ? "text-background" : "text-muted-foreground"
          }`}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel="Workout view"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        backgroundColor: colors.muted,
      }}
    >
      {segment("track", "Track")}
      {segment("live", "Live")}
    </View>
  );
}
