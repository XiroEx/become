import type { ReactNode } from "react";
import { View, Text } from "react-native";

export interface AdminGateProps {
  role: string | null | undefined;
  children: ReactNode;
  fallback?: ReactNode;
  testID?: string;
}

/**
 * Renders children only when the current user has admin role. Otherwise
 * renders a fallback (or an inline "admin only" message). Used to gate
 * native admin surfaces — note that the read-only data is still fetched
 * server-side under an admin token, so this is a UX guardrail, not a
 * security boundary.
 */
export function AdminGate({
  role,
  children,
  fallback,
  testID = "admin-gate",
}: AdminGateProps) {
  if (role !== "admin") {
    return (
      <View testID={`${testID}-blocked`} style={{ padding: 24 }}>
        {fallback ?? (
          <Text className="text-muted-foreground text-center">
            Admin only.
          </Text>
        )}
      </View>
    );
  }
  return <View testID={`${testID}-allowed`}>{children}</View>;
}
