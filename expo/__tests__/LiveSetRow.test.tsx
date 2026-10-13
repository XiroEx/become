import { render, fireEvent } from "@testing-library/react-native";
import { LiveSetRow } from "@/components/live/LiveSetRow";

// `bell` is what `getBellWeightInfo` (@become/core ← webapp/lib/workout/
// dumbbellWeight.ts) returns: the implement, and whether it is one of a
// loaded PAIR. It replaces the old `bellStyle` string, which came from a
// name regex the web retired on 2026-09-09.

describe("LiveSetRow", () => {
  const baseState = { weight: null, reps: null, completed: false };

  it("renders weight input with dumbbell label", () => {
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: "dumbbell", showTotal: true }}
        state={baseState}
        onChange={() => {}}
      />,
    );
    expect(
      getByTestId("live-set-0-weight-label").props.children,
    ).toBe("Weight per DB (lbs)");
  });

  it("renders Last-performance prefill text when provided", () => {
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={1}
        bell={{ style: null, showTotal: false }}
        state={baseState}
        prefill={{ weight: 185, reps: 5, completed: true }}
        onChange={() => {}}
      />,
    );
    const prefillText = getByTestId("live-set-1-prefill").props.children;
    expect(JSON.stringify(prefillText)).toContain("185");
    expect(JSON.stringify(prefillText)).toContain("5");
  });

  it("shows the '= X lbs total' helper only when the bell is a loaded pair", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: "dumbbell", showTotal: true }}
        state={{ weight: 50, reps: null, completed: false }}
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-helper").props.children).toBe(
      "= 100 lbs total",
    );
    rerender(
      <LiveSetRow
        setIndex={0}
        bell={{ style: "kettlebell", showTotal: false }}
        state={{ weight: 50, reps: null, completed: false }}
        onChange={() => {}}
      />,
    );
    expect(queryByTestId("live-set-0-helper")).toBeNull();
  });

  it("fires onChange with parsed weight numeric value", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={baseState}
        onChange={onChange}
      />,
    );
    fireEvent.changeText(getByTestId("live-set-0-weight"), "135");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 135 }),
    );
  });

  it("fires onChange with parsed reps numeric value", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={baseState}
        onChange={onChange}
      />,
    );
    fireEvent.changeText(getByTestId("live-set-0-reps"), "8");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reps: 8 }),
    );
  });

  it("toggles the completed state when the check is pressed", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={baseState}
        onChange={onChange}
      />,
    );
    fireEvent.press(getByTestId("live-set-0-complete"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true }),
    );
  });
});
