import { render, fireEvent } from "@testing-library/react-native";
import { Toggle } from "@/components/Toggle";

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
      <Toggle testID="t" value={false} onValueChange={onChange} />,
    );
    fireEvent.press(getByTestId("t"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports accessibilityState.checked matching value", () => {
    const { getByTestId, rerender } = render(
      <Toggle testID="t" value={false} onValueChange={() => {}} />,
    );
    expect(getByTestId("t").props.accessibilityState?.checked).toBe(false);
    rerender(<Toggle testID="t" value onValueChange={() => {}} />);
    expect(getByTestId("t").props.accessibilityState?.checked).toBe(true);
  });

  it("disabled blocks press", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <Toggle testID="t" value={false} disabled onValueChange={onChange} />,
    );
    fireEvent.press(getByTestId("t"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
