import React, { Component, type ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";

export interface TileErrorBoundaryProps {
  children: ReactNode;
  label?: string;
  testID?: string;
}

export interface TileErrorBoundaryState {
  hasError: boolean;
  error?: unknown;
}

export class TileErrorBoundary extends Component<
  TileErrorBoundaryProps,
  TileErrorBoundaryState
> {
  override state: TileErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): TileErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: unknown, errorInfo: unknown) {
    // Non-fatal: log for diagnostics but do not let one tile crash the dashboard
    console.error("Tile render error:", this.props.label ?? "", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      const label = this.props.label;
      const testId = this.props.testID ?? (label ? `tile-error-${label}` : "tile-error");
      return (
        <View
          testID={testId}
          accessibilityRole="alert"
          accessibilityLabel={label ? `${label} unavailable` : "Tile unavailable"}
          className="bg-card rounded-2xl p-4 border border-border justify-center items-center h-full w-full min-h-[96px]"
        >
          <Text className="text-muted-foreground text-xs text-center font-medium">
            {label ? `${label} unavailable` : "Tile unavailable"}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default TileErrorBoundary;
