// `WebGradient` is the one place a Tailwind `bg-gradient-to-*` class becomes
// `expo-linear-gradient` points. Tests assert on the PROPS the gradient is
// handed (the mock renders a View), not on pixels.

import * as React from "react";
import { StyleSheet, Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import {
  WebGradient,
  gradientPoints,
  type WebGradientDirection,
} from "@/components/WebGradient";

describe("WebGradient", () => {
  it("maps the web's directions to start/end points", () => {
    const table: [WebGradientDirection, object, object][] = [
      ["r", { x: 0, y: 0 }, { x: 1, y: 0 }],
      ["b", { x: 0, y: 0 }, { x: 0, y: 1 }],
      ["t", { x: 0, y: 1 }, { x: 0, y: 0 }],
      ["l", { x: 1, y: 0 }, { x: 0, y: 0 }],
      ["br", { x: 0, y: 0 }, { x: 1, y: 1 }],
      ["tl", { x: 1, y: 1 }, { x: 0, y: 0 }],
    ];
    for (const [dir, start, end] of table) {
      expect(gradientPoints(dir)).toEqual({ start, end });
    }
  });

  it("defaults to `to-br`, the Becoming door's direction", () => {
    const { getByTestId } = render(
      <WebGradient testID="g" colors={["rgb(1 2 3)", "rgb(4 5 6)"]} />,
    );
    const g = getByTestId("g");
    expect(g.props.colors).toEqual(["rgb(1 2 3)", "rgb(4 5 6)"]);
    expect(g.props.start).toEqual({ x: 0, y: 0 });
    expect(g.props.end).toEqual({ x: 1, y: 1 });
  });

  it("`fill` is an absolute, touch-transparent layer", () => {
    const { getByTestId } = render(
      <WebGradient testID="g" fill direction="r" colors={["a", "b"]} />,
    );
    const g = getByTestId("g");
    expect(g.props.pointerEvents).toBe("none");
    expect(StyleSheet.flatten(g.props.style)).toEqual(
      expect.objectContaining({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }),
    );
  });

  it("without `fill` it is a box that takes children and a style", () => {
    const { getByTestId, getByText } = render(
      <WebGradient testID="g" colors={["a", "b"]} style={{ height: 64, borderRadius: 32 }}>
        <Text>inside</Text>
      </WebGradient>,
    );
    expect(getByText("inside")).toBeTruthy();
    const flat = StyleSheet.flatten(getByTestId("g").props.style);
    expect(flat).toEqual(expect.objectContaining({ height: 64, borderRadius: 32 }));
    expect(flat.position).toBeUndefined();
  });
});

// Where along the ramp a pixel falls: the projection of the point on the
// start→end vector, in PIXELS (both native drivers draw in pixels, which is
// why a unit-square (0,0)→(1,1) is wrong on a wide box).
function rampAt(
  box: { width: number; height: number },
  points: { start: { x: number; y: number }; end: { x: number; y: number } },
  px: number,
  py: number,
): number {
  const sx = points.start.x * box.width;
  const sy = points.start.y * box.height;
  const ex = points.end.x * box.width;
  const ey = points.end.y * box.height;
  const ax = ex - sx;
  const ay = ey - sy;
  return ((px - sx) * ax + (py - sy) * ay) / (ax * ax + ay * ay);
}

describe("WebGradient corner directions on a non-square box (CSS `to bottom right`)", () => {
  const WIDE = { width: 350, height: 110 };

  it("k = (w² − h²) / (2(w² + h²)) puts TL at 0, BR at 1 and TR = BL = ½", () => {
    const k = (350 ** 2 - 110 ** 2) / (2 * (350 ** 2 + 110 ** 2));
    expect(k).toBeCloseTo(0.41, 2);
    const p = gradientPoints("br", WIDE);
    expect(p.start.x).toBeCloseTo(k, 10);
    expect(p.start.y).toBeCloseTo(-k, 10);
    expect(p.end.x).toBeCloseTo(1 - k, 10);
    expect(p.end.y).toBeCloseTo(1 + k, 10);

    expect(rampAt(WIDE, p, 0, 0)).toBeCloseTo(0, 6);
    expect(rampAt(WIDE, p, 350, 110)).toBeCloseTo(1, 6);
    expect(rampAt(WIDE, p, 350, 0)).toBeCloseTo(0.5, 6);
    expect(rampAt(WIDE, p, 0, 110)).toBeCloseTo(0.5, 6);
  });

  it("the plain corner points are what was wrong: TR lands at ~91%", () => {
    const naive = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
    expect(rampAt(WIDE, naive, 350, 0)).toBeCloseTo(350 ** 2 / (350 ** 2 + 110 ** 2), 6);
    expect(rampAt(WIDE, naive, 350, 0)).toBeGreaterThan(0.9);
  });

  it("every corner direction keeps its own pair of fixed corners and a ½ cross-corner", () => {
    const corners: Record<string, [number, number]> = {
      tl: [0, 0],
      br: [350, 110],
      tr: [350, 0],
      bl: [0, 110],
    };
    const opposite: Record<string, string> = { tl: "br", br: "tl", tr: "bl", bl: "tr" };
    for (const d of ["br", "tl", "tr", "bl"] as const) {
      const p = gradientPoints(d, WIDE);
      // `to-<d>` starts at the corner opposite the named one and ends at it.
      const [sx, sy] = corners[opposite[d]!]!;
      const [ex, ey] = corners[d]!;
      expect(rampAt(WIDE, p, sx, sy)).toBeCloseTo(0, 6);
      expect(rampAt(WIDE, p, ex, ey)).toBeCloseTo(1, 6);
      // …and the two other corners both sit at exactly half.
      const others = Object.keys(corners).filter((c) => c !== d && c !== opposite[d]);
      for (const c of others) {
        const [cx, cy] = corners[c]!;
        expect(rampAt(WIDE, p, cx, cy)).toBeCloseTo(0.5, 6);
      }
    }
  });

  it("a tall box skews the other way (k < 0) and still holds TR = BL = ½", () => {
    const tall = { width: 110, height: 350 };
    const p = gradientPoints("br", tall);
    expect(rampAt(tall, p, 110, 0)).toBeCloseTo(0.5, 6);
    expect(rampAt(tall, p, 0, 350)).toBeCloseTo(0.5, 6);
  });

  it("a square box is exactly the plain corner points (no −0)", () => {
    expect(gradientPoints("br", { width: 64, height: 64 })).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    });
    expect(gradientPoints("tl", { width: 36, height: 36 })).toEqual({
      start: { x: 1, y: 1 },
      end: { x: 0, y: 0 },
    });
  });

  it("axis directions ignore the box", () => {
    expect(gradientPoints("r", WIDE)).toEqual(gradientPoints("r"));
    expect(gradientPoints("t", WIDE)).toEqual(gradientPoints("t"));
  });

  it("falls back to the corner points before layout, then measures", () => {
    const { getByTestId } = render(
      <WebGradient testID="g" colors={["a", "b"]} style={{ width: 350, height: 110 }} />,
    );
    expect(getByTestId("g").props.start).toEqual({ x: 0, y: 0 });
    expect(getByTestId("g").props.end).toEqual({ x: 1, y: 1 });

    act(() => {
      fireEvent(getByTestId("g"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 110 } },
      });
    });
    const { start, end } = getByTestId("g").props;
    expect({ start, end }).toEqual(gradientPoints("br", WIDE));
    expect(start.x).toBeGreaterThan(0.4);
  });

  it("an axis gradient never subscribes to layout", () => {
    const { getByTestId } = render(
      <WebGradient testID="g" direction="r" colors={["a", "b"]} />,
    );
    expect(getByTestId("g").props.onLayout).toBeUndefined();
  });

  it("passes accessibility props through", () => {
    const { getByLabelText } = render(
      <WebGradient colors={["a", "b"]} accessibilityRole="image" accessibilityLabel="tile" />,
    );
    expect(getByLabelText("tile").props.accessibilityRole).toBe("image");
  });
});
