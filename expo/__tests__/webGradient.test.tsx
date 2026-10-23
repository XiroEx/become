// `WebGradient` is the one place a Tailwind `bg-gradient-to-*` class becomes
// `expo-linear-gradient` points. Tests assert on the PROPS the gradient is
// handed (the mock renders a View), not on pixels.

import * as React from "react";
import { StyleSheet, Text } from "react-native";
import { render } from "@testing-library/react-native";
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
