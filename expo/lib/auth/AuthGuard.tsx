import { useEffect, type ReactNode } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { resolveToken } from "@/lib/theme/tokens";

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
  useEffect(() => {
    if (!loading && !isAuthed) {
      onUnauthed();
    }
  }, [loading, isAuthed, onUnauthed]);

  if (loading) {
    return (
      <View
        testID={testID ? `${testID}-loading` : "authguard-loading"}
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator
          size="large"
          color={resolveToken("primary", "dark")}
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
