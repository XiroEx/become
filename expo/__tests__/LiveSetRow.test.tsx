import { useState } from "react";
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
    // A keystroke is marked as typing: Track ticks on leaving the box.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 135 }),
      { typing: true },
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
    // A keystroke is marked as typing: Track ticks on leaving the box.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reps: 8 }),
      { typing: true },
    );
  });

  // Card: "Can't put decimal points when tracking in a workout" — typing
  // "72." parses to the number 72, and a naive `value={String(weight)}`
  // reformatted to "72" on the very next render, stripping the "." the
  // member had just typed before they could type a digit after it. A
  // wrapping component owns `state` here exactly like the Live view does
  // (one row reused across steps, `onChange` writes back into `state`), so
  // the fix has to survive a real state round-trip, not just a bare
  // `fireEvent.changeText` against a static prop.
  function ControlledWeightHarness({
    onCommit,
  }: {
    onCommit: (weight: number | null) => void;
  }) {
    const [state, setState] = useState({
      weight: null as number | null,
      reps: null as number | null,
      completed: false,
    });
    return (
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={state}
        onChange={(next) => {
          setState(next);
          onCommit(next.weight);
        }}
      />
    );
  }

  it("keeps a trailing decimal point on screen through a state round-trip", () => {
    const onCommit = jest.fn();
    const { getByTestId } = render(
      <ControlledWeightHarness onCommit={onCommit} />,
    );
    const field = getByTestId("live-set-0-weight");

    fireEvent.changeText(field, "7");
    fireEvent.changeText(field, "72");
    fireEvent.changeText(field, "72.");
    // The committed numeric value is unchanged (the "." alone is not a
    // digit), but the box must still show what was typed.
    expect(onCommit).toHaveBeenLastCalledWith(72);
    expect(getByTestId("live-set-0-weight").props.value).toBe("72.");

    fireEvent.changeText(field, "72.5");
    expect(onCommit).toHaveBeenLastCalledWith(72.5);
    expect(getByTestId("live-set-0-weight").props.value).toBe("72.5");
  });

  it("resets the weight draft when a quick-pick overwrites the typed value", () => {
    const onChange = jest.fn();
    const { getByTestId, rerender } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={{ weight: null, reps: null, completed: false }}
        onChange={onChange}
      />,
    );
    fireEvent.changeText(getByTestId("live-set-0-weight"), "72.");
    expect(getByTestId("live-set-0-weight").props.value).toBe("72.");

    // A quick-pick tap (or moving to the next set) overwrites `state.weight`
    // from OUTSIDE this input's own typing — the draft must follow it.
    rerender(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={{ weight: 95, reps: null, completed: false }}
        onChange={onChange}
      />,
    );
    expect(getByTestId("live-set-0-weight").props.value).toBe("95");
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

  it("reports leaving any number box, which is when Track ticks a filled set", () => {
    const onCommit = jest.fn();
    const { getByTestId } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        state={baseState}
        onChange={jest.fn()}
        onCommit={onCommit}
      />,
    );
    fireEvent(getByTestId("live-set-0-reps"), "endEditing");
    fireEvent(getByTestId("live-set-0-weight"), "endEditing");
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});
