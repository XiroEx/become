import { render } from "@testing-library/react-native";
import { StreakBanner, streakMessage } from "@/components/StreakBanner";

describe("StreakBanner", () => {
  it("renders 0 days message when streak is inactive", () => {
    const { getByTestId } = render(<StreakBanner streakDays={0} />);
    expect(getByTestId("streak-banner-days").props.children).toEqual([
      "0",
      " day",
      "s",
    ]);
    expect(getByTestId("streak-banner-message").props.children).toBe(
      "Start a streak today",
    );
  });

  it("renders singular 'day' for streak of 1", () => {
    const { getByTestId } = render(<StreakBanner streakDays={1} />);
    expect(getByTestId("streak-banner-days").props.children).toEqual([
      "1",
      " day",
      "",
    ]);
  });

  it("renders freeze indicator when freezeAvailable", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <StreakBanner streakDays={5} freezeAvailable />,
    );
    expect(getByTestId("streak-banner-freeze")).toBeTruthy();
    rerender(<StreakBanner streakDays={5} freezeAvailable={false} />);
    expect(queryByTestId("streak-banner-freeze")).toBeNull();
  });

  it("sets an a11y label that reflects active streak", () => {
    const { getByTestId } = render(<StreakBanner streakDays={12} />);
    expect(getByTestId("streak-banner").props.accessibilityLabel).toBe(
      "Streak: 12 consecutive days",
    );
  });

  it("sets a11y label for no active streak", () => {
    const { getByTestId } = render(<StreakBanner streakDays={0} />);
    expect(getByTestId("streak-banner").props.accessibilityLabel).toBe(
      "No active streak",
    );
  });

  it("streakMessage tiers correctly", () => {
    expect(streakMessage(0)).toMatch(/start/i);
    expect(streakMessage(1)).toMatch(/day 1/i);
    expect(streakMessage(3)).toMatch(/3 days/);
    expect(streakMessage(15)).toMatch(/15-day streak/);
    expect(streakMessage(50)).toMatch(/50 days/);
    expect(streakMessage(120)).toMatch(/legendary/);
  });
});
