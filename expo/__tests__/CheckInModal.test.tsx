import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { CheckInModal, MOOD_LABELS } from "@/components/CheckInModal";

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

  it("renders mood buttons with the web's words (id: e015c90c)", () => {
    const { getByText } = render(
      <CheckInModal visible onClose={() => {}} onSubmit={() => {}} />,
    );
    expect(MOOD_LABELS[1]).toBe("Bad");
    expect(MOOD_LABELS[2]).toBe("Not Great");
    expect(MOOD_LABELS[3]).toBe("Okay");
    expect(MOOD_LABELS[4]).toBe("Pretty Good");
    expect(MOOD_LABELS[5]).toBe("Great");

    expect(getByText("Bad")).toBeTruthy();
    expect(getByText("Not Great")).toBeTruthy();
    expect(getByText("Okay")).toBeTruthy();
    expect(getByText("Pretty Good")).toBeTruthy();
    expect(getByText("Great")).toBeTruthy();
  });

  it("labels weight in kg and shows live goal line in kg for a kg member (id: e015c90b)", () => {
    const { getByTestId, getByText } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        weightUnit="kg"
        targetWeight={75}
      />,
    );
    expect(getByText("Weight (kg) — optional")).toBeTruthy();
    expect(getByTestId("check-in-modal-goal-line").props.children).toBe(
      "Goal: 75 kg",
    );

    fireEvent.changeText(getByTestId("check-in-modal-weight"), "77");
    expect(getByTestId("check-in-modal-goal-line").props.children).toBe(
      "Goal: 75 kg — 2 kg to go",
    );
  });

  it("pre-fills weight with lastWeight when provided", () => {
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={() => {}}
        onSubmit={() => {}}
        lastWeight={180.5}
      />,
    );
    expect(getByTestId("check-in-modal-weight").props.value).toBe("180.5");
  });

  it("shows 'First log' instead of 999 days when daysSince is 999", () => {
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

  it("shows days-since lapse warnings when daysSince >= 1", () => {
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

  it("Skip for Today calls onSkip and onClose when there is no lapse (id: e015c90a)", async () => {
    const onSkip = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <CheckInModal
        visible
        onClose={onClose}
        onSubmit={() => {}}
        onSkip={onSkip}
        daysSinceMood={0}
        daysSinceWeight={0}
      />,
    );

    fireEvent.press(getByTestId("check-in-modal-skip"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("prompts warning confirmation when skipping with a lapse and skips after continuing", async () => {
    const onSkip = jest.fn();
    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CheckInModal
        visible
        onClose={onClose}
        onSubmit={() => {}}
        onSkip={onSkip}
        daysSinceMood={3}
      />,
    );

    fireEvent.press(getByTestId("check-in-modal-skip"));
    expect(getByTestId("check-in-modal-warning-confirm")).toBeTruthy();
    expect(onSkip).not.toHaveBeenCalled();

    fireEvent.press(getByTestId("check-in-modal-warning-continue"));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(queryByTestId("check-in-modal-warning-confirm")).toBeNull();
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
