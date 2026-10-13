import { fireEvent, render } from "@testing-library/react-native";
import { PacePicker } from "@/components/goals/PacePicker";
import { unitToKg } from "@become/core";

describe("PacePicker component (NP-048)", () => {
  it("renders null when direction is maintain", () => {
    const { toJSON } = render(
      <PacePicker
        unit="lbs"
        direction="maintain"
        valueKgPerWeek={0.45}
        onChange={jest.fn()}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders 3 options for imperial lbs and calls onChange with kg", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <PacePicker
        unit="lbs"
        direction="lose"
        valueKgPerWeek={null}
        onChange={onChange}
        latestWeight={200}
        targetWeight={180}
      />,
    );

    expect(getByTestId("pace-0.5")).toBeTruthy();
    expect(getByTestId("pace-1")).toBeTruthy();
    expect(getByTestId("pace-1.5")).toBeTruthy();

    fireEvent.press(getByTestId("pace-1"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(unitToKg(1, "lbs"));
  });

  it("renders 3 options for metric kg and calls onChange with kg", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <PacePicker
        unit="kg"
        direction="lose"
        valueKgPerWeek={null}
        onChange={onChange}
        latestWeight={90}
        targetWeight={80}
      />,
    );

    expect(getByTestId("pace-0.25")).toBeTruthy();
    expect(getByTestId("pace-0.5")).toBeTruthy();
    expect(getByTestId("pace-0.75")).toBeTruthy();

    fireEvent.press(getByTestId("pace-0.5"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("shows prompt when no pace is selected", () => {
    const { getByTestId } = render(
      <PacePicker
        unit="lbs"
        direction="lose"
        valueKgPerWeek={null}
        onChange={jest.fn()}
        latestWeight={200}
        targetWeight={180}
      />,
    );
    const etaText = getByTestId("pace-eta").props.children;
    expect(etaText).toBe("Pick a pace to see when you get there.");
  });

  it("computes and renders ETA when pace and weights are provided", () => {
    const paceKg = unitToKg(1, "lbs");
    const { getByTestId } = render(
      <PacePicker
        unit="lbs"
        direction="lose"
        valueKgPerWeek={paceKg}
        onChange={jest.fn()}
        latestWeight={200}
        targetWeight={180}
      />,
    );
    const etaText = String(getByTestId("pace-eta").props.children);
    expect(etaText).toContain("At this pace:");
    expect(etaText).toContain("wks");
  });
});
