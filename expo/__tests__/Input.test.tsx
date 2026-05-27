import { render, fireEvent } from "@testing-library/react-native";
import { Input } from "@/components/Input";

describe("Input", () => {
  it("renders the label above the field", () => {
    const { getByTestId } = render(
      <Input testID="email" label="Email" value="" onChangeText={() => {}} />,
    );
    expect(getByTestId("email-label").props.children).toBe("Email");
  });

  it("fires onChangeText with the new value", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <Input testID="email" label="Email" value="" onChangeText={onChange} />,
    );
    fireEvent.changeText(getByTestId("email"), "jon@example.com");
    expect(onChange).toHaveBeenCalledWith("jon@example.com");
  });

  it("renders an error message when provided", () => {
    const { getByTestId } = render(
      <Input
        testID="email"
        label="Email"
        value="bad"
        onChangeText={() => {}}
        error="Enter a valid email"
      />,
    );
    expect(getByTestId("email-error").props.children).toBe("Enter a valid email");
  });

  it("falls back to label as accessibilityLabel when none provided", () => {
    const { getByTestId } = render(
      <Input testID="email" label="Email" value="" onChangeText={() => {}} />,
    );
    expect(getByTestId("email").props.accessibilityLabel).toBe("Email");
  });
});
