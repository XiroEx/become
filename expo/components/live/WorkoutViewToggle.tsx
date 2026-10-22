import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/** The two ways to see one workout. */
export type WorkoutView = "track" | "live";

/**
 * `solid` (default) is the Track header's pill: `colors.muted` behind,
 * `colors.primary` behind the active segment — unchanged from before NP-365.
 * `translucent` is the Live top bar's floating pill — the web's
 * `bg-white/10 rounded-full p-0.5` with an active `bg-white text-black`
 * segment — drawn with a theme tint and the foreground/background pair
 * rather than the web's literal white/black, so a light phone still reads
 * the Live top bar in light mode (NP-288's rule).
 */
export type WorkoutViewToggleVariant = "solid" | "translucent";

export interface WorkoutViewToggleProps {
  active: WorkoutView;
  onChange: (view: WorkoutView) => void;
  testID?: string;
  variant?: WorkoutViewToggleVariant;
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
  variant = "solid",
}: WorkoutViewToggleProps) {
  const { colors, tint } = useThemeTokens();
  const translucent = variant === "translucent";

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
            paddingHorizontal: 12,
            paddingVertical: 4,
            backgroundColor: selected
              ? translucent
                ? colors.foreground
                : colors.primary
              : "transparent",
          },
        ]}
      >
        <Text
          className={`text-xs font-semibold ${
            selected
              ? translucent
                ? "text-background"
                : "text-primary-foreground"
              : translucent
                ? // The web's inactive segment is dim on the floating pill
                  // (`text-white/60`); the solid Track header keeps the
                  // muted token.
                  "text-foreground/60"
                : "text-muted-foreground"
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
        alignSelf: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        backgroundColor: translucent ? tint("foreground", 0.1) : colors.muted,
      }}
    >
      {segment("track", "Track")}
      {segment("live", "Live")}
    </View>
  );
}
