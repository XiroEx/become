import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { CheckInModal, MOOD_LABELS } from "@/components/CheckInModal";

describe("CheckInModal (NP-105 parity)", () => {
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
    expect(MOOD_LABELS[1]).toBe("Bad");
    expect(MOOD_LABELS[2]).toBe("Not Great");
    expect(MOOD_LABELS[3]).toBe("Okay");
    expect(MOOD_LABELS[4]).toBe("Pretty Good");
    expect(MOOD_LABELS[5]).toBe("Great");

    for (let level = 1; level <= 5; level++) {
      expect(getByTestId(`check-in-modal-mood-${level}`)).toBeTruthy();
    }
    expect(getByText("Bad")).toBeTruthy();
    expect(getByText("Not Great")).toBeTruthy();
    expect(getByText("Okay")).toBeTruthy();
    expect(getByText("Pretty Good")).toBeTruthy();
    expect(getByText("Great")).toBeTruthy();
  });

  it("renders weight input with member unit (kg)", () => {
    const { getByText } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        weightUnit="kg"
      />,
    );
    expect(getByText("Current Weight (kg)")).toBeTruthy();
  });

  it("pre-fills last weight and renders live goal line", () => {
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        lastWeight={75}
        targetWeight={70}
        weightUnit="kg"
      />,
    );
    const input = getByTestId("check-in-modal-weight");
    expect(input.props.value).toBe("75");
    const goalLineText = getByTestId("checkin-goal-line");
    expect(goalLineText.props.children).toBe("Goal: 70 kg — 5 kg to go");
  });

  it("shows 'First log' for brand new member with 999 days sentinel", () => {
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

  it("shows lapse warning for days since last log", () => {
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

  it("submits mood and weight directly when no lapse warning", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={onSubmit}
        daysSinceMood={0}
        daysSinceWeight={0}
      />,
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

  it("shows warning confirmation before skipping when lapse exists", async () => {
    const onSkip = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        onSkip={onSkip}
        daysSinceMood={5}
        daysSinceWeight={0}
      />,
    );
    fireEvent.press(getByTestId("check-in-modal-skip"));

    // Confirmation appears
    expect(getByTestId("check-in-warning-confirm")).toBeTruthy();
    expect(onSkip).not.toHaveBeenCalled();

    // Cancel warning
    fireEvent.press(getByTestId("check-in-warning-cancel"));
    expect(queryByTestId("check-in-warning-confirm")).toBeNull();
    expect(onSkip).not.toHaveBeenCalled();

    // Skip again and continue
    fireEvent.press(getByTestId("check-in-modal-skip"));
    fireEvent.press(getByTestId("check-in-warning-continue"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalled();
    });
  });

  it("shows warning confirmation when saving with a half missing and lapse exists", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={onSubmit}
        daysSinceMood={0}
        daysSinceWeight={4}
      />,
    );
    // Select mood only (weight missing, and weight has a 4-day lapse)
    fireEvent.press(getByTestId("check-in-modal-mood-3"));
    fireEvent.press(getByTestId("check-in-modal-submit"));

    expect(getByTestId("check-in-warning-confirm")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    // Confirm anyway
    fireEvent.press(getByTestId("check-in-warning-continue"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        mood: 3,
        weight: null,
        weightLbs: null,
      });
    });
  });

  it("skips directly without confirmation if there is no lapse", async () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        onSkip={onSkip}
        daysSinceMood={0}
        daysSinceWeight={0}
      />,
    );
    fireEvent.press(getByTestId("check-in-modal-skip"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalled();
    });
  });

  it("shows an error when entering an invalid negative weight", async () => {
    const onSubmit = jest.fn();
    const { getByTestId, findByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={onSubmit}
        daysSinceMood={0}
        daysSinceWeight={0}
      />,
    );
    fireEvent.press(getByTestId("check-in-modal-mood-3"));
    fireEvent.changeText(getByTestId("check-in-modal-weight"), "-10");
    fireEvent.press(getByTestId("check-in-modal-submit"));

    expect(await findByTestId("check-in-modal-error")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("supports dashboard-checkin-modal testID prefix for accessibility and dashboard integration", () => {
    const { getByTestId } = render(
      <CheckInModal
        testID="dashboard-checkin-modal"
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        submitting
      />,
    );
    const submit = getByTestId("dashboard-checkin-modal-submit");
    expect(submit.props.accessibilityLabel).toBe("Save check-in");
    expect(submit.props.accessibilityState?.busy).toBe(true);
    expect(getByTestId("dashboard-checkin-modal-skip")).toBeTruthy();
  });
});
