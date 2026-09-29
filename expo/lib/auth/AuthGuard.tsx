import { useEffect, type ReactNode } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface AuthGuardProps {
  isAuthed: boolean;
  loading: boolean;
  onUnauthed: () => void;
  children: ReactNode;
  fallback?: ReactNode;
  testID?: string;
}

/**
 * Wraps protected screens. While auth is loading, renders a spinner. If the
 * user is unauthenticated, fires `onUnauthed` (typically `router.replace('/login')`)
 * and renders the fallback (or nothing). Otherwise renders children.
 */
export function AuthGuard({
  isAuthed,
  loading,
  onUnauthed,
  children,
  fallback,
  testID,
}: AuthGuardProps) {
  const { colors } = useThemeTokens();
  useEffect(() => {
    if (!loading && !isAuthed) {
      onUnauthed();
    }
  }, [loading, isAuthed, onUnauthed]);

  if (loading) {
    return (
      <View
        testID={testID ? `${testID}-loading` : "authguard-loading"}
        // The whole screen is a spinner, so it is ONE thing to a screen reader
        // and it says what it is: an unlabelled ActivityIndicator is silence,
        // and this is the screen between tapping the magic link and Home.
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        accessibilityLiveRegion="polite"
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text className="text-muted-foreground mt-2">Loading…</Text>
      </View>
    );
  }

  if (!isAuthed) {
    return (
      <View testID={testID ? `${testID}-fallback` : "authguard-fallback"}>
        {fallback ?? null}
      </View>
    );
  }

  return <>{children}</>;
}
