import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { CheckInModal, MOOD_LABELS } from "@/components/CheckInModal";

describe("CheckInModal (NP-105)", () => {
  it("does not render content when visible=false", () => {
    const { queryByTestId } = render(
      <CheckInModal visible={false} onClose={() => {}} onSubmit={() => {}} />,
    );
    expect(queryByTestId("check-in-modal-mood-row")).toBeNull();
  });

  it("renders 5 mood buttons with the web's words", () => {
    const { getByTestId, getByText } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={() => {}} />,
    );
    expect(MOOD_LABELS).toEqual({
      1: "Bad",
      2: "Not Great",
      3: "Okay",
      4: "Pretty Good",
      5: "Great",
    });

    for (let level = 1; level <= 5; level++) {
      expect(getByTestId(`check-in-modal-mood-${level}`)).toBeTruthy();
      expect(getByText(MOOD_LABELS[level as 1 | 2 | 3 | 4 | 5])).toBeTruthy();
    }
  });

  it("renders weight input and action buttons when visible", () => {
    const { getByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={() => {}} />,
    );
    expect(getByTestId("check-in-modal-weight")).toBeTruthy();
    expect(getByTestId("check-in-modal-submit")).toBeTruthy();
    expect(getByTestId("check-in-modal-skip")).toBeTruthy();
  });

  it("labels weight with the member's unit (lbs or kg)", () => {
    const { getByText, rerender } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={() => {}} unit="lbs" />,
    );
    expect(getByText("Current Weight (lbs)")).toBeTruthy();

    rerender(
      <CheckInModal visible onClose={() => {}} onSubmit={() => {}} unit="kg" />,
    );
    expect(getByText("Current Weight (kg)")).toBeTruthy();
  });

  it("shows goal line live as user types weight", () => {
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        targetWeight={150}
        unit="lbs"
      />,
    );
    fireEvent.changeText(getByTestId("check-in-modal-weight"), "155");
    expect(getByTestId("check-in-modal-goal-line").props.children).toBe(
      "Goal: 150 lbs — 5 lbs to go",
    );
  });

  it("renders 'First log' when daysSince >= 999", () => {
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        daysSinceMood={999}
        daysSinceWeight={999}
      />,
    );
    expect(getByTestId("check-in-modal-mood-warning").props.children).toBe(
      "First log",
    );
    expect(getByTestId("check-in-modal-weight-warning").props.children).toBe(
      "First log",
    );
  });

  it("renders days warning when days >= 1", () => {
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        daysSinceMood={3}
        daysSinceWeight={7}
      />,
    );
    expect(getByTestId("check-in-modal-mood-warning").props.children).toBe(
      "3 days since last log",
    );
    expect(getByTestId("check-in-modal-weight-warning").props.children).toBe(
      "7 days since last log",
    );
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
      expect(onSubmit).toHaveBeenCalledWith({
        mood: 4,
        weight: 182.5,
        weightLbs: 182.5,
      });
    });
  });

  it("submits with null weight when weight is left blank and no warning", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("check-in-modal-mood-3"));
    fireEvent.press(getByTestId("check-in-modal-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        mood: 3,
        weight: null,
        weightLbs: null,
      });
    });
  });

  it("rejects non-positive weight value", async () => {
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

  it("shows confirmation modal before skip when warnings exist, and proceeds on Continue Anyway", async () => {
    const onSkip = jest.fn();
    const { getByTestId, getByText } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        onSkip={onSkip}
        daysSinceMood={3}
      />,
    );

    fireEvent.press(getByTestId("check-in-modal-skip"));
    expect(getByText("Skip Check-in?")).toBeTruthy();
    expect(getByText("Last logged: 3 days ago")).toBeTruthy();

    fireEvent.press(getByTestId("check-in-modal-confirm-continue"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalled();
    });
  });

  it("shows confirmation modal before submit when missing a warned field", async () => {
    const onSubmit = jest.fn();
    const { getByTestId, getByText } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={onSubmit}
        daysSinceWeight={5}
      />,
    );

    // Pick mood only, weight is missing while having 5-day warning
    fireEvent.press(getByTestId("check-in-modal-mood-4"));
    fireEvent.press(getByTestId("check-in-modal-submit"));

    expect(getByText("Missing Data")).toBeTruthy();
    expect(getByText("Weight")).toBeTruthy();

    fireEvent.press(getByTestId("check-in-modal-confirm-continue"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        mood: 4,
        weight: null,
        weightLbs: null,
      });
    });
  });
});
