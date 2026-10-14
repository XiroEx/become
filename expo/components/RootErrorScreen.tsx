import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ErrorBoundaryProps } from "expo-router";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export type RootErrorScreenProps = ErrorBoundaryProps;

/**
 * THE ROOT RECOVERY SCREEN — what a member sees when a render throw below the
 * root would otherwise take out the whole tree (card "A render error anywhere
 * in the native app has nothing to catch it: the root layout exports no
 * ErrorBoundary").
 *
 * Rendered by the `ErrorBoundary` export in `app/_layout.tsx`, which Expo
 * Router (57.0.24 — `ErrorBoundaryProps` in its shipped types, caught by its
 * `Try` boundary) calls with the throw and a `retry()` that re-renders the
 * route. `ApiErrorHandlerProvider` is NOT this: it answers API refusals (403
 * plan gates, AI consent), it never sees a React render throw.
 *
 * Themed like the rest of the app — every colour from `useThemeTokens()`,
 * every glyph through the app's `Text` (the Geist stack) — so this is never
 * the one screen that draws San Francisco on a white background. Fonts may
 * not be registered when this draws; that is fine, and this screen never
 * returns null for it: an unregistered Geist face falls back to the system
 * font on both platforms, which is ugly for a frame and not a dead app.
 *
 * Deliberately side-effect-free: no network call, no logging service.
 */
export function RootErrorScreen({ error, retry }: RootErrorScreenProps) {
  const { colors } = useThemeTokens();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="root-error-screen"
      accessibilityRole="alert"
      accessibilityLabel={`Something went wrong. ${error.message}`}
      style={{
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      className="flex-1 items-center justify-center px-6"
    >
      <Text className="text-foreground text-xl font-semibold text-center">
        Something went wrong
      </Text>
      <Text className="text-muted-foreground text-sm text-center mt-2">
        The app hit a problem it couldn&apos;t get past. Your data is safe —
        try again.
      </Text>
      <Text
        testID="root-error-message"
        className="text-muted-foreground text-xs text-center mt-4"
      >
        {error.message}
      </Text>
      <View className="mt-6 w-full max-w-[320px]">
        <Button
          testID="root-error-retry"
          accessibilityLabel="Try again"
          onPress={() => {
            void retry();
          }}
        >
          Try again
        </Button>
      </View>
    </View>
  );
}

export default RootErrorScreen;
