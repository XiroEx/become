import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { WeightLogSheet } from "@/components/dashboard/WeightLogSheet";

describe("WeightLogSheet (NP-105 parity)", () => {
  it("renders when visible and pre-fills lastWeight", () => {
    const { getByTestId, getByText, getAllByText } = render(
      <WeightLogSheet
        visible
        onClose={() => {}}
        lastWeight={182.5}
        targetWeight={175}
        weightUnit="lbs"
      />,
    );
    expect(getAllByText("Log Weight").length).toBeGreaterThanOrEqual(1);
    expect(getByText("Goal: 175 lbs")).toBeTruthy();
    expect(getByText("Weight (lbs)")).toBeTruthy();
    const input = getByTestId("weight-log-sheet-input");
    expect(input.props.value).toBe("182.5");
    expect(getByTestId("weight-log-sheet-goal-line")).toBeTruthy();
  });

  it("updates live goalLine as user types", () => {
    const { getByTestId } = render(
      <WeightLogSheet
        visible
        onClose={() => {}}
        targetWeight={70}
        weightUnit="kg"
      />,
    );
    const input = getByTestId("weight-log-sheet-input");
    fireEvent.changeText(input, "75");
    const goalLineText = getByTestId("weight-log-sheet-goal-line");
    expect(goalLineText.props.children).toBe("Goal: 70 kg — 5 kg to go");
  });

  it("disables submit button when input is empty", () => {
    const { getByTestId } = render(
      <WeightLogSheet visible onClose={() => {}} lastWeight={null} />,
    );
    const submit = getByTestId("weight-log-sheet-submit");
    expect(submit.props.accessibilityState?.disabled).toBe(true);
  });

  it("calls onSubmit and onLogged when submit is pressed", async () => {
    const onSubmit = jest.fn();
    const onLogged = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <WeightLogSheet
        visible
        onClose={onClose}
        onSubmit={onSubmit}
        onLogged={onLogged}
        lastWeight={180}
      />,
    );
    const submit = getByTestId("weight-log-sheet-submit");
    fireEvent.press(submit);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(180);
      expect(onLogged).toHaveBeenCalledWith(180);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("renders close button that calls onClose", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <WeightLogSheet visible onClose={onClose} />,
    );
    fireEvent.press(getByTestId("weight-log-sheet-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error if onSubmit throws", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("Network failure"));
    const { getByTestId, findByTestId } = render(
      <WeightLogSheet
        visible
        onClose={() => {}}
        onSubmit={onSubmit}
        lastWeight={180}
      />,
    );
    fireEvent.press(getByTestId("weight-log-sheet-submit"));

    expect(await findByTestId("weight-log-sheet-error")).toBeTruthy();
  });
});
