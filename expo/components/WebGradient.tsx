import { useCallback, useState, type ReactNode } from "react";
import {
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Tailwind's `bg-gradient-to-*` directions as `expo-linear-gradient` points —
 * the mapping `BecomingDoor` uses for `to-br` (top-left → bottom-right), kept
 * in one place so a call site names the web's class and not two coordinates.
 */
export type WebGradientDirection = "t" | "b" | "l" | "r" | "tl" | "tr" | "bl" | "br";

export interface GradientBox {
  width: number;
  height: number;
}

type Point = { x: number; y: number };

const AXIS: Record<"t" | "b" | "l" | "r", { start: Point; end: Point }> = {
  t: { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } },
  b: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  l: { start: { x: 1, y: 0 }, end: { x: 0, y: 0 } },
  r: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

/**
 * CSS `to bottom right` is NOT the box's diagonal. The gradient line is
 * angled so its isolines run along the OTHER diagonal: the top-right and
 * bottom-left corners both sit at exactly 50% of the ramp, whatever the
 * aspect ratio. `expo-linear-gradient` takes start/end in unit coordinates of
 * the box but draws in pixels (iOS `drawLinearGradient(start·size,
 * end·size)`, Android `LinearGradient(startX·w, …)`), so its isolines are
 * perpendicular to the start→end vector: `(0,0)→(1,1)` on a wide box paints
 * the top-right corner at `w²/(w²+h²)` (91% on a 350×110 card) instead of 50%.
 *
 * Shifting the points along the anti-diagonal by
 *
 *     k = (w² − h²) / (2·(w² + h²))
 *
 * puts TL at 0, BR at 1 and TR = BL = ½ exactly. The points may fall outside
 * 0..1; that is fine, both platforms clamp past the ends. A square box gives
 * `k = 0`, i.e. the plain corner points, so badges and avatars are unchanged.
 */
function cornerPoints(
  direction: "br" | "bl" | "tl" | "tr",
  box: GradientBox | null,
): { start: Point; end: Point } {
  const k =
    box && box.width > 0 && box.height > 0
      ? (box.width ** 2 - box.height ** 2) / (2 * (box.width ** 2 + box.height ** 2))
      : 0;
  // `0 - k`, never `-k`: for a square box `-0` would be a different number
  // from the `0` the corner points use.
  const nk = 0 - k;
  switch (direction) {
    case "br":
      return { start: { x: k, y: nk }, end: { x: 1 - k, y: 1 + k } };
    case "tl":
      return { start: { x: 1 - k, y: 1 + k }, end: { x: k, y: nk } };
    case "tr":
      return { start: { x: k, y: 1 + k }, end: { x: 1 - k, y: nk } };
    case "bl":
      return { start: { x: 1 - k, y: nk }, end: { x: k, y: 1 + k } };
  }
}

/**
 * Start/end for a direction. Pass the measured `box` for a corner direction on
 * a non-square box; without one (before the first layout, or a square box) the
 * corner points are the plain `(0,0)→(1,1)` family.
 */
export function gradientPoints(
  direction: WebGradientDirection,
  box: GradientBox | null = null,
): { start: Point; end: Point } {
  if (direction === "t" || direction === "b" || direction === "l" || direction === "r") {
    return AXIS[direction];
  }
  return cornerPoints(direction, box);
}

const isCorner = (d: WebGradientDirection) =>
  d === "br" || d === "bl" || d === "tl" || d === "tr";

export interface WebGradientProps
  extends Omit<ViewProps, "children" | "style" | "onLayout"> {
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
  ...rest
}: WebGradientProps) {
  // Only a corner direction depends on the box, so only it measures — an
  // axis gradient (`to-r`, `to-t`) never re-renders for a layout pass.
  const corner = isCorner(direction);
  const [box, setBox] = useState<GradientBox | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

  const { start, end } = gradientPoints(direction, corner ? box : null);
  return (
    <LinearGradient
      {...rest}
      testID={testID}
      colors={[...colors] as [string, string, ...string[]]}
      start={start}
      end={end}
      onLayout={corner ? onLayout : undefined}
      pointerEvents={fill ? "none" : rest.pointerEvents}
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
