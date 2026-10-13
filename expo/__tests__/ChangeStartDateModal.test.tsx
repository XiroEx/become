import { fireEvent, render } from "@testing-library/react-native";
import { ChangeStartDateModal } from "@/components/programs/ChangeStartDateModal";

describe("ChangeStartDateModal", () => {
  it("renders with initialDate and confirms valid YYYY-MM-DD", () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText } = render(
      <ChangeStartDateModal
        visible={true}
        initialDate="2026-10-15"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(getByText("Change Start Date")).toBeTruthy();
    expect(getByTestId("change-start-date-date-picker")).toBeTruthy();

    const saveBtn = getByTestId("change-start-date-save");
    expect(saveBtn.props.accessibilityState?.disabled).toBeFalsy();

    fireEvent.press(saveBtn);
    expect(onConfirm).toHaveBeenCalledWith("2026-10-15");

    fireEvent.press(getByTestId("change-start-date-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
