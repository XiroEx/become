import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { CheckInModal } from "@/components/CheckInModal";

describe("CheckInModal", () => {
  it("does not render content when visible=false", () => {
    const { queryByTestId } = render(
      <CheckInModal visible={false} onClose={() => {}} onSubmit={() => {}} />,
    );
    expect(queryByTestId("check-in-modal-mood-row")).toBeNull();
  });

  it("renders 5 mood buttons + weight input when visible", () => {
    const { getByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={() => {}} />,
    );
    for (let level = 1; level <= 5; level++) {
      expect(getByTestId(`check-in-modal-mood-${level}`)).toBeTruthy();
    }
    expect(getByTestId("check-in-modal-weight")).toBeTruthy();
    expect(getByTestId("check-in-modal-submit")).toBeTruthy();
  });

  it("shows an error when submit is pressed with no mood selected", async () => {
    const onSubmit = jest.fn();
    const { getByTestId, findByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("check-in-modal-submit"));
    expect(await findByTestId("check-in-modal-error")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits mood + weight when both are valid", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("check-in-modal-mood-4"));
    fireEvent.changeText(getByTestId("check-in-modal-weight"), "182.5");
    fireEvent.press(getByTestId("check-in-modal-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ mood: 4, weightLbs: 182.5 });
    });
  });

  it("submits with null weight when the input is left blank", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("check-in-modal-mood-3"));
    fireEvent.press(getByTestId("check-in-modal-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ mood: 3, weightLbs: null });
    });
  });

  it("rejects a non-positive weight value", async () => {
    const onSubmit = jest.fn();
    const { getByTestId, findByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("check-in-modal-mood-3"));
    fireEvent.changeText(getByTestId("check-in-modal-weight"), "-5");
    fireEvent.press(getByTestId("check-in-modal-submit"));
    expect(await findByTestId("check-in-modal-error")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
