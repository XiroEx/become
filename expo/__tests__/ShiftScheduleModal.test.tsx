import { fireEvent, render } from "@testing-library/react-native";
import { ShiftScheduleModal } from "@/components/programs/ShiftScheduleModal";

describe("ShiftScheduleModal", () => {
  it("defaults to 3 days and adjusts with steppers", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText } = render(
      <ShiftScheduleModal
        visible={true}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(getByText("Delay Schedule")).toBeTruthy();
    const input = getByTestId("shift-days-input");
    expect(input.props.value).toBe("3");

    // Increment
    fireEvent.press(getByTestId("shift-days-plus"));
    expect(input.props.value).toBe("4");

    // Decrement
    fireEvent.press(getByTestId("shift-days-minus"));
    expect(input.props.value).toBe("3");

    // Confirm
    fireEvent.press(getByTestId("shift-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(3);

    // Cancel
    fireEvent.press(getByTestId("shift-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows typing custom days", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <ShiftScheduleModal
        visible={true}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const input = getByTestId("shift-days-input");
    fireEvent.changeText(input, "7");
    expect(input.props.value).toBe("7");

    fireEvent.press(getByTestId("shift-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(7);
  });
});
