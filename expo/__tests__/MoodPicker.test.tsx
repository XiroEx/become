import { render, fireEvent } from "@testing-library/react-native";
import { MoodPicker } from "@/components/mind/MoodPicker";
import { MoodHistoryStrip } from "@/components/mind/MoodHistoryStrip";
import type { ProgressMoodPoint } from "@become/api-client";

describe("MoodPicker", () => {
  it("renders 5 mood options and fires onSelect with the value", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(<MoodPicker onSelect={onSelect} />);
    for (let v = 1; v <= 5; v++) {
      expect(getByTestId(`mood-picker-${v}`)).toBeTruthy();
    }
    fireEvent.press(getByTestId("mood-picker-4"));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("does not fire when disabled", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MoodPicker onSelect={onSelect} disabled />,
    );
    fireEvent.press(getByTestId("mood-picker-2"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("MoodHistoryStrip", () => {
  const points: ProgressMoodPoint[] = Array.from({ length: 9 }, (_, i) => ({
    date: `Jun ${i + 1}`,
    value: ((i % 5) + 1) as ProgressMoodPoint["value"],
  }));

  it("shows only the last 7 points", () => {
    const { getByTestId, queryByTestId } = render(
      <MoodHistoryStrip points={points} />,
    );
    expect(getByTestId("mood-history-point-0")).toBeTruthy();
    expect(getByTestId("mood-history-point-6")).toBeTruthy();
    expect(queryByTestId("mood-history-point-7")).toBeNull();
  });

  it("renders an empty state when there are no points", () => {
    const { getByTestId } = render(<MoodHistoryStrip points={[]} />);
    expect(getByTestId("mood-history-empty")).toBeTruthy();
  });
});
