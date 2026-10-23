import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Tailwind's `bg-gradient-to-*` directions as `expo-linear-gradient` points —
 * the mapping `BecomingDoor` uses for `to-br` (top-left → bottom-right), kept
 * in one place so a call site names the web's class and not two coordinates.
 */
export type WebGradientDirection = "t" | "b" | "l" | "r" | "tl" | "tr" | "bl" | "br";

const POINTS: Record<
  WebGradientDirection,
  { start: { x: number; y: number }; end: { x: number; y: number } }
> = {
  t: { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } },
  b: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  l: { start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
  r: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  tl: { start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
  tr: { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
  bl: { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
  br: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
};

export function gradientPoints(direction: WebGradientDirection) {
  return POINTS[direction];
}

export interface WebGradientProps {
  /** Two or more stops, from the theme tokens (`colors`, `tint`, `rgbOf`) — never a literal. */
  colors: readonly string[];
  /** The web's `bg-gradient-to-<direction>`. Defaults to `br`, the door's. */
  direction?: WebGradientDirection;
  /**
   * Paint edge to edge BEHIND its siblings and ignore touches, so a call site
   * adds the layer as its first child and changes nothing else. The parent
   * has to clip it (`overflow: "hidden"` + its own radius), like the web's
   * `overflow-hidden` rounded box. Without `fill` it is an ordinary box that
   * takes children and a style, for a badge or button that IS the gradient.
   */
  fill?: boolean;
  /** Clips the gradient itself, for a `fill` layer whose parent cannot. */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

export function WebGradient({
  colors,
  direction = "br",
  fill = false,
  borderRadius,
  style,
  children,
  testID,
}: WebGradientProps) {
  const { start, end } = gradientPoints(direction);
  return (
    <LinearGradient
      testID={testID}
      colors={[...colors] as [string, string, ...string[]]}
      start={start}
      end={end}
      pointerEvents={fill ? "none" : undefined}
      style={[
        fill ? StyleSheet.absoluteFill : null,
        borderRadius != null ? { borderRadius } : null,
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

export default WebGradient;
