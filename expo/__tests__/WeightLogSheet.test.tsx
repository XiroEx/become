import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { WeightLogSheet } from "@/components/WeightLogSheet";

describe("WeightLogSheet", () => {
  it("does not render sheet content when visible is false", () => {
    const { queryByTestId } = render(
      <WeightLogSheet visible={false} onClose={() => {}} />,
    );
    expect(queryByTestId("weight-log-sheet-input")).toBeNull();
  });

  it("renders input with unit and submit button when open", () => {
    const { getByTestId, getByText } = render(
      <WeightLogSheet visible={true} onClose={() => {}} weightUnit="lbs" />,
    );
    expect(getByTestId("weight-log-sheet-title")).toBeTruthy();
    expect(getByTestId("weight-log-sheet-input")).toBeTruthy();
    expect(getByText("Weight (lbs)")).toBeTruthy();
    expect(getByTestId("weight-log-sheet-submit")).toBeTruthy();
  });

  it("pre-fills input with lastWeight when provided", () => {
    const { getByTestId } = render(
      <WeightLogSheet
        visible={true}
        onClose={() => {}}
        lastWeight={182.5}
        weightUnit="lbs"
      />,
    );
    expect(getByTestId("weight-log-sheet-input").props.value).toBe("182.5");
  });

  it("shows goal line live as weight is typed", () => {
    const { getByTestId } = render(
      <WeightLogSheet
        visible={true}
        onClose={() => {}}
        targetWeight={175}
        weightUnit="lbs"
      />,
    );
    expect(getByTestId("weight-log-sheet-goal-line").props.children).toBe(
      "Goal: 175 lbs",
    );

    fireEvent.changeText(getByTestId("weight-log-sheet-input"), "178");
    expect(getByTestId("weight-log-sheet-goal-line").props.children).toBe(
      "Goal: 175 lbs — 3 lbs to go",
    );
  });

  it("renders correctly in kg for a kg member", () => {
    const { getByTestId, getByText } = render(
      <WeightLogSheet
        visible={true}
        onClose={() => {}}
        targetWeight={80}
        weightUnit="kg"
      />,
    );
    expect(getByText("Weight (kg)")).toBeTruthy();
    expect(getByTestId("weight-log-sheet-goal-line").props.children).toBe(
      "Goal: 80 kg",
    );

    fireEvent.changeText(getByTestId("weight-log-sheet-input"), "82.5");
    expect(getByTestId("weight-log-sheet-goal-line").props.children).toBe(
      "Goal: 80 kg — 2.5 kg to go",
    );
  });

  it("submits weight and triggers onLogged and onClose", async () => {
    const onSubmit = jest.fn();
    const onLogged = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <WeightLogSheet
        visible={true}
        onClose={onClose}
        onLogged={onLogged}
        onSubmit={onSubmit}
        weightUnit="lbs"
      />,
    );

    fireEvent.changeText(getByTestId("weight-log-sheet-input"), "185");
    fireEvent.press(getByTestId("weight-log-sheet-submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(185);
      expect(onLogged).toHaveBeenCalledWith(185);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
