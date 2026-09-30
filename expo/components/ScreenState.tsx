import type { ReactNode } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { classifyApiError } from "@become/api-client";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WifiOff, AlertCircle } from "lucide-react-native";

export type ScreenStateKind = "loading" | "empty" | "offline" | "server" | "error";

export interface ScreenStateProps {
  /** Explicit state override: 'loading' | 'empty' | 'offline' | 'server' | 'error'. */
  state?: ScreenStateKind;
  /** Whether data is loading. If true and !hasData, renders loading state. */
  loading?: boolean;
  /** An error (from useFetch, apiFetch, or try/catch), classified via classifyApiError. */
  error?: unknown;
  /** Callback for Retry button in offline / server error states. */
  onRetry?: () => void | Promise<void>;
  /** Whether the screen has data to show. If true, children are shown (with an offline note if offline). */
  hasData?: boolean;
  /** Whether the screen is in empty state (when not loading and no error). */
  empty?: boolean;
  /** Custom empty state title and message. */
  emptyTitle?: string;
  emptyMessage?: string;
  /** Custom offline message / title override. */
  offlineTitle?: string;
  offlineMessage?: string;
  /** Custom server error message / title override. */
  serverErrorTitle?: string;
  serverErrorMessage?: string;
  /** Custom note to display above children when hasData is true but device is offline. */
  offlineNote?: string;
  /** Children to render when ready or when showing cached data. */
  children?: ReactNode;
  /** testID prefix, defaults to 'screen-state'. */
  testID?: string;
}

export function resolveScreenStateKind(
  props: Pick<ScreenStateProps, "state" | "loading" | "error" | "empty" | "hasData">,
): ScreenStateKind | "content" {
  if (props.state) return props.state;
  if (props.loading && !props.hasData) return "loading";
  if (props.error && !props.hasData) {
    const classification = classifyApiError(props.error);
    if (classification.kind === "offline") return "offline";
    if (classification.kind === "server") return "server";
    return "error";
  }
  if (props.empty && !props.hasData && !props.loading && !props.error) {
    return "empty";
  }
  return "content";
}

export function ScreenState({
  state: explicitState,
  loading = false,
  error,
  onRetry,
  hasData = false,
  empty = false,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  offlineTitle = "No connection",
  offlineMessage = "Check your connection and try again.",
  serverErrorTitle = "Server error",
  serverErrorMessage,
  offlineNote = "You're offline. Showing last-saved data.",
  children,
  testID = "screen-state",
}: ScreenStateProps) {
  const { colors, tint } = useThemeTokens();
  const resolved = resolveScreenStateKind({
    state: explicitState,
    loading,
    error,
    empty,
    hasData,
  });

  const classification = error ? classifyApiError(error) : null;
  const isOffline = classification?.kind === "offline";

  if (resolved === "loading") {
    return (
      <View
        testID={testID}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <View testID={`${testID}-loading`} style={{ alignItems: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-muted-foreground text-sm font-medium">Loading…</Text>
        </View>
      </View>
    );
  }

  if (resolved === "offline") {
    return (
      <View
        testID={testID}
        accessibilityRole="alert"
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <View
          testID={`${testID}-offline`}
          style={{ alignItems: "center", gap: 16, maxWidth: 320 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: tint("muted", 0.5),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WifiOff size={28} color={colors.foreground} />
          </View>
          <Text
            accessibilityRole="header"
            testID={`${testID}-offline-title`}
            className="text-foreground text-xl font-bold text-center"
          >
            {offlineTitle}
          </Text>
          <Text
            testID={`${testID}-offline-message`}
            className="text-muted-foreground text-sm text-center leading-relaxed"
          >
            {offlineMessage}
          </Text>
          {onRetry ? (
            <Button
              testID={`${testID}-retry`}
              variant="primary"
              size="md"
              onPress={onRetry}
              accessibilityLabel="Retry"
            >
              Try again
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  if (resolved === "server" || resolved === "error") {
    const defaultMsg =
      classification?.message || "Something went wrong on our end. Please try again.";
    const title = resolved === "server" ? serverErrorTitle : "Something went wrong";
    const msg = serverErrorMessage ?? defaultMsg;

    return (
      <View
        testID={testID}
        accessibilityRole="alert"
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <View
          testID={resolved === "server" ? `${testID}-server` : `${testID}-error`}
          style={{ alignItems: "center", gap: 16, maxWidth: 320 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: tint("destructive", 0.18),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircle size={28} color={colors.destructive} />
          </View>
          <Text
            accessibilityRole="header"
            testID={`${testID}-error-title`}
            className="text-foreground text-xl font-bold text-center"
          >
            {title}
          </Text>
          <Text
            testID={`${testID}-error-message`}
            className="text-muted-foreground text-sm text-center leading-relaxed"
          >
            {msg}
          </Text>
          {onRetry ? (
            <Button
              testID={`${testID}-retry`}
              variant="primary"
              size="md"
              onPress={onRetry}
              accessibilityLabel="Retry"
            >
              Retry
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  if (resolved === "empty") {
    return (
      <View
        testID={testID}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <View testID={`${testID}-empty`} style={{ alignItems: "center", gap: 12, maxWidth: 320 }}>
          <Text
            accessibilityRole="header"
            className="text-foreground text-lg font-semibold text-center"
          >
            {emptyTitle}
          </Text>
          {emptyMessage ? (
            <Text className="text-muted-foreground text-sm text-center leading-relaxed">
              {emptyMessage}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {hasData && isOffline ? (
        <View
          testID={`${testID}-offline-note`}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: tint("muted", 0.6),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <WifiOff size={16} color={colors.foreground} />
          <Text className="text-foreground text-xs font-medium flex-1">
            {offlineNote}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}
