import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { WeightLogSheet } from "@/components/WeightLogSheet";

describe("WeightLogSheet (NP-105)", () => {
  it("does not render content when visible=false", () => {
    const { queryByTestId } = render(
      <WeightLogSheet visible={false} onClose={() => {}} />,
    );
    expect(queryByTestId("weight-log-sheet-input")).toBeNull();
  });

  it("renders weight input and submit button when visible", () => {
    const { getByTestId, getByText } = render(
      <WeightLogSheet visible onClose={() => {}} unit="lbs" />,
    );
    expect(getByTestId("weight-log-sheet-input")).toBeTruthy();
    expect(getByTestId("weight-log-sheet-submit")).toBeTruthy();
    expect(getByText("Weight (lbs)")).toBeTruthy();
  });

  it("renders kg label when unit is kg", () => {
    const { getByText, getByTestId } = render(
      <WeightLogSheet visible onClose={() => {}} unit="kg" />,
    );
    expect(getByText("Weight (kg)")).toBeTruthy();
    expect(getByTestId("weight-log-sheet-input").props.placeholder).toBe("e.g., 84.2");
  });

  it("shows goal line when targetWeight is provided", () => {
    const { getByTestId, getAllByText } = render(
      <WeightLogSheet visible onClose={() => {}} targetWeight={165} unit="lbs" />,
    );
    expect(getAllByText("Goal: 165 lbs").length).toBeGreaterThan(0);
    fireEvent.changeText(getByTestId("weight-log-sheet-input"), "170");
    expect(getByTestId("weight-log-sheet-goal-line").props.children).toBe(
      "Goal: 165 lbs — 5 lbs to go",
    );
  });

  it("submits valid weight when submit button is pressed", async () => {
    const onSubmit = jest.fn();
    const onLogged = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <WeightLogSheet
        visible
        onClose={onClose}
        onSubmit={onSubmit}
        onLogged={onLogged}
        unit="lbs"
      />,
    );

    fireEvent.changeText(getByTestId("weight-log-sheet-input"), "182.5");
    fireEvent.press(getByTestId("weight-log-sheet-submit"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(182.5);
      expect(onLogged).toHaveBeenCalledWith(182.5);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables submit button when input is empty or invalid", () => {
    const { getByTestId } = render(
      <WeightLogSheet visible onClose={() => {}} />,
    );
    expect(getByTestId("weight-log-sheet-submit").props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(getByTestId("weight-log-sheet-input"), "-5");
    expect(getByTestId("weight-log-sheet-submit").props.accessibilityState?.disabled).toBe(true);
  });
});
