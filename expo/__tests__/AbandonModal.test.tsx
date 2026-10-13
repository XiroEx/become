import { fireEvent, render } from "@testing-library/react-native";
import { AbandonModal } from "@/components/programs/AbandonModal";

describe("AbandonModal", () => {
  it("when member has no progress, enables confirm immediately without typing", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, queryByTestId, getByText } = render(
      <AbandonModal
        visible={true}
        hasProgress={false}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(getByText("Abandon Program?")).toBeTruthy();
    expect(queryByTestId("abandon-confirm-input")).toBeNull();

    const confirmBtn = getByTestId("abandon-confirm");
    expect(confirmBtn.props.accessibilityState?.disabled).toBeFalsy();

    fireEvent.press(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancelBtn = getByTestId("abandon-cancel");
    fireEvent.press(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("when member has progress, requires typing 'abandon' before confirm is enabled", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText } = render(
      <AbandonModal
        visible={true}
        hasProgress={true}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(
      getByText(/Warning: You have completed workouts in this program/i),
    ).toBeTruthy();

    const input = getByTestId("abandon-confirm-input");
    expect(input).toBeTruthy();

    const confirmBtn = getByTestId("abandon-confirm");
    // Initially disabled
    expect(confirmBtn.props.accessibilityState?.disabled).toBeTruthy();

    // Type something else
    fireEvent.changeText(input, "nope");
    expect(confirmBtn.props.accessibilityState?.disabled).toBeTruthy();
    fireEvent.press(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    // Type "abandon" case-insensitively
    fireEvent.changeText(input, "Abandon");
    expect(confirmBtn.props.accessibilityState?.disabled).toBeFalsy();

    fireEvent.press(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
