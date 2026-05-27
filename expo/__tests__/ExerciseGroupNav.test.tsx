import { render, fireEvent } from "@testing-library/react-native";
import { ExerciseGroupNav } from "@/components/live/ExerciseGroupNav";

describe("ExerciseGroupNav", () => {
  it("renders nothing when groupType is null", () => {
    const { queryByTestId } = render(
      <ExerciseGroupNav
        groupType={null}
        currentRound={1}
        totalRounds={3}
      />,
    );
    expect(queryByTestId("group-nav")).toBeNull();
  });

  it("renders 'Superset' label + round indicator for superset", () => {
    const { getByTestId } = render(
      <ExerciseGroupNav
        groupType="superset"
        currentRound={2}
        totalRounds={4}
      />,
    );
    expect(getByTestId("group-nav-label").props.children).toBe("Superset");
    expect(getByTestId("group-nav-round").props.children).toEqual([
      "Round ",
      2,
      " of ",
      4,
    ]);
  });

  it("uses 'Tri-set' / 'Giant set' / 'EMOM' / 'AMRAP' / 'Circuit' labels", () => {
    const cases: ["superset" | "circuit" | "triset" | "giantset" | "emom" | "amrap", string][] = [
      ["circuit", "Circuit"],
      ["triset", "Tri-set"],
      ["giantset", "Giant set"],
      ["emom", "EMOM"],
      ["amrap", "AMRAP"],
    ];
    for (const [gt, label] of cases) {
      const { getByTestId, unmount } = render(
        <ExerciseGroupNav groupType={gt} currentRound={1} totalRounds={2} />,
      );
      expect(getByTestId("group-nav-label").props.children).toBe(label);
      unmount();
    }
  });

  it("Prev button is disabled on round 1", () => {
    const onPrev = jest.fn();
    const { getByTestId } = render(
      <ExerciseGroupNav
        groupType="circuit"
        currentRound={1}
        totalRounds={3}
        onPrev={onPrev}
      />,
    );
    const prev = getByTestId("group-nav-prev");
    expect(prev.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(prev);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("Next button is disabled on the last round", () => {
    const onNext = jest.fn();
    const { getByTestId } = render(
      <ExerciseGroupNav
        groupType="circuit"
        currentRound={3}
        totalRounds={3}
        onNext={onNext}
      />,
    );
    const next = getByTestId("group-nav-next");
    expect(next.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(next);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("fires onPrev / onNext when buttons are tapped mid-rounds", () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const { getByTestId } = render(
      <ExerciseGroupNav
        groupType="superset"
        currentRound={2}
        totalRounds={3}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    fireEvent.press(getByTestId("group-nav-prev"));
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("group-nav-next"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
