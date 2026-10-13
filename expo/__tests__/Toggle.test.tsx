import { render, fireEvent } from "@testing-library/react-native";
import { Toggle } from "@/components/Toggle";
import { MIN_TOUCH_TARGET } from "@/lib/a11y/touchTarget";

describe("Toggle", () => {
  it("renders with accessibilityRole=switch and a11y label", () => {
    const { getByTestId } = render(
      <Toggle
        testID="t"
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="Enable feature"
      />,
    );
    const toggle = getByTestId("t");
    expect(toggle.props.accessibilityRole).toBe("switch");
    expect(toggle.props.accessibilityLabel).toBe("Enable feature");
  });

  it("fires onValueChange with the negated value", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <Toggle
        testID="t"
        value={false}
        onValueChange={onChange}
        accessibilityLabel="Enable feature"
      />,
    );
    fireEvent.press(getByTestId("t"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports accessibilityState.checked matching value", () => {
    const { getByTestId, rerender } = render(
      <Toggle
        testID="t"
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="Enable feature"
      />,
    );
    expect(getByTestId("t").props.accessibilityState?.checked).toBe(false);
    rerender(
      <Toggle
        testID="t"
        value
        onValueChange={() => {}}
        accessibilityLabel="Enable feature"
      />,
    );
    expect(getByTestId("t").props.accessibilityState?.checked).toBe(true);
  });

  it("disabled blocks press", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <Toggle
        testID="t"
        value={false}
        disabled
        onValueChange={onChange}
        accessibilityLabel="Enable feature"
      />,
    );
    fireEvent.press(getByTestId("t"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("takes slop instead of growing: the 48 x 28 track answers 48 x 44", () => {
    // NP-124: a switch that grows to 44 points tall is not a switch any more,
    // so the TOUCHABLE area grows and the track keeps the design's size.
    const { getByTestId } = render(
      <Toggle
        testID="t"
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="Enable feature"
      />,
    );
    const slop = getByTestId("t").props.hitSlop as {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    expect(28 + slop.top + slop.bottom).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );
    expect(48 + slop.left + slop.right).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );
  });

  // NP-303: the web's Settings notification/email switches are blue-600,
  // never the brand red — `color="info"` draws `bg-info` when on.
  it('color="info" draws bg-info when on, not the brand red', () => {
    const { getByTestId } = render(
      <Toggle
        testID="t"
        value
        color="info"
        onValueChange={() => {}}
        accessibilityLabel="Enable feature"
      />,
    );
    expect(getByTestId("t").props.className).toContain("bg-info");
    expect(getByTestId("t").props.className).not.toContain("bg-primary");
  });

  it('defaults to the brand red (color="primary") when on', () => {
    const { getByTestId } = render(
      <Toggle
        testID="t"
        value
        onValueChange={() => {}}
        accessibilityLabel="Enable feature"
      />,
    );
    expect(getByTestId("t").props.className).toContain("bg-primary");
  });
});
