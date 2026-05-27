import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ScheduleSettingsForm } from "@/components/schedule/ScheduleSettingsForm";

const initial = {
  trainingDays: [1, 3, 5],
  startDate: "2026-05-27",
  autoAdvance: true,
};

describe("ScheduleSettingsForm", () => {
  it("renders 7 day toggles + date input + auto-advance switch + submit", () => {
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    for (let d = 0; d <= 6; d++) {
      expect(getByTestId(`schedule-settings-day-${d}`)).toBeTruthy();
    }
    expect(getByTestId("schedule-settings-start-date")).toBeTruthy();
    expect(getByTestId("schedule-settings-auto-advance")).toBeTruthy();
    expect(getByTestId("schedule-settings-submit")).toBeTruthy();
  });

  it("initial trainingDays are marked checked", () => {
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    expect(
      getByTestId("schedule-settings-day-1").props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      getByTestId("schedule-settings-day-3").props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      getByTestId("schedule-settings-day-2").props.accessibilityState?.checked,
    ).toBe(false);
  });

  it("submits with the current settings", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("schedule-settings-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        trainingDays: [1, 3, 5],
        startDate: "2026-05-27",
        autoAdvance: true,
      });
    });
  });

  it("toggling a day adds it to trainingDays", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("schedule-settings-day-2"));
    fireEvent.press(getByTestId("schedule-settings-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ trainingDays: [1, 2, 3, 5] }),
      );
    });
  });

  it("rejects submit when settings are invalid + surfaces error", () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ScheduleSettingsForm
        initial={{ trainingDays: [1], startDate: "bad", autoAdvance: false }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId("schedule-settings-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(queryByTestId("schedule-settings-error")).toBeTruthy();
  });
});
