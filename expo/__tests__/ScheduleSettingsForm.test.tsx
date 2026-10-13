import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ScheduleSettingsForm } from "@/components/schedule/ScheduleSettingsForm";

const initial = {
  trainingDays: [1, 3, 5],
};

describe("ScheduleSettingsForm", () => {
  it("renders read-only day chips + Edit Days, no toggle mode controls", () => {
    const { getByTestId, queryByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    for (let d = 0; d <= 6; d++) {
      expect(getByTestId(`schedule-settings-day-${d}`)).toBeTruthy();
    }
    expect(getByTestId("schedule-settings-edit-days")).toBeTruthy();
    expect(queryByTestId("schedule-settings-hint")).toBeNull();
    expect(queryByTestId("schedule-settings-submit")).toBeNull();
    expect(queryByTestId("schedule-settings-cancel")).toBeNull();
  });

  it("read-only chips reflect the initial trainingDays via accessibilityLabel", () => {
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    expect(getByTestId("schedule-settings-day-1").props.accessibilityLabel).toMatch(
      /selected$/,
    );
    expect(getByTestId("schedule-settings-day-1").props.accessibilityLabel).not.toMatch(
      /not selected$/,
    );
    expect(getByTestId("schedule-settings-day-2").props.accessibilityLabel).toMatch(
      /not selected$/,
    );
  });

  it("Edit Days enters toggle mode with the hint, Save & Regenerate and Cancel", () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    fireEvent.press(getByTestId("schedule-settings-edit-days"));

    expect(getByTestId("schedule-settings-hint")).toBeTruthy();
    expect(getByTestId("schedule-settings-hint").props.children).toBe(
      "Tap days to toggle. Future workouts will be regenerated.",
    );
    expect(getByTestId("schedule-settings-submit")).toBeTruthy();
    expect(getByText("Save & Regenerate")).toBeTruthy();
    expect(getByTestId("schedule-settings-cancel")).toBeTruthy();
    expect(getByText("Cancel")).toBeTruthy();
    expect(queryByTestId("schedule-settings-edit-days")).toBeNull();

    expect(
      getByTestId("schedule-settings-day-1").props.accessibilityState?.checked,
    ).toBe(true);
    expect(
      getByTestId("schedule-settings-day-2").props.accessibilityState?.checked,
    ).toBe(false);
  });

  it("submits with the current settings after Edit Days", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    fireEvent.press(getByTestId("schedule-settings-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        trainingDays: [1, 3, 5],
      });
    });
  });

  it("toggling a day in edit mode adds it to trainingDays", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    fireEvent.press(getByTestId("schedule-settings-day-2"));
    fireEvent.press(getByTestId("schedule-settings-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        trainingDays: [1, 2, 3, 5],
      });
    });
  });

  it("Cancel discards edits and returns to read-only mode", () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    fireEvent.press(getByTestId("schedule-settings-day-2"));
    fireEvent.press(getByTestId("schedule-settings-cancel"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(queryByTestId("schedule-settings-hint")).toBeNull();
    expect(getByTestId("schedule-settings-edit-days")).toBeTruthy();
    // Re-entering edit mode shows the original days, not the discarded toggle.
    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    expect(
      getByTestId("schedule-settings-day-2").props.accessibilityState?.checked,
    ).toBe(false);
  });

  it("rejects submit when settings are invalid + surfaces error", () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ScheduleSettingsForm
        initial={{ trainingDays: [] }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    fireEvent.press(getByTestId("schedule-settings-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(queryByTestId("schedule-settings-error")).toBeTruthy();
  });

  it("never uses the brand-red primary/destructive classes for chips or the submit button", () => {
    const { getByTestId } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    expect(getByTestId("schedule-settings-day-1").props.className).not.toMatch(
      /border-primary|bg-primary/,
    );
    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    expect(getByTestId("schedule-settings-day-1").props.className).not.toMatch(
      /border-primary|bg-primary/,
    );
  });

  // NP-368: web's card header is a 2-column `flex items-start
  // justify-between` row — program name + subtitle left, a bordered "Edit
  // Days" pill top-right — not the button stacked below the chips.
  it("renders the program name + subtitle beside a top-right Edit Days pill, and hides the pill while editing", () => {
    const { getByTestId, queryByTestId } = render(
      <ScheduleSettingsForm
        initial={initial}
        onSubmit={() => {}}
        programName="Strength A"
        subtitle="2/8 workouts completed · Started Jan 1, 2026"
      />,
    );
    expect(getByTestId("schedule-settings-title").props.children).toBe(
      "Strength A",
    );
    expect(getByTestId("schedule-settings-program-subtitle").props.children).toBe(
      "2/8 workouts completed · Started Jan 1, 2026",
    );
    expect(getByTestId("schedule-settings-edit-days")).toBeTruthy();

    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    // The title/subtitle stay visible while editing, the pill does not.
    expect(getByTestId("schedule-settings-title")).toBeTruthy();
    expect(queryByTestId("schedule-settings-edit-days")).toBeNull();
  });

  // NP-368: the read-only chips are a rectangular pill (`rounded-lg px-3
  // py-1.5 text-xs font-semibold`), not the fixed `w-9 h-9` square the
  // edit-mode chips still use.
  it("read-only day chips use the web's pill dimensions, distinct from the edit-mode square chips", () => {
    const { getByTestId, getByText } = render(
      <ScheduleSettingsForm initial={initial} onSubmit={() => {}} />,
    );
    const readOnlyClassName = getByTestId("schedule-settings-day-1").props.className;
    expect(readOnlyClassName).toMatch(/px-3 py-1\.5/);
    expect(readOnlyClassName).not.toMatch(/w-9|h-9/);
    expect(getByText("Mon").props.className).toMatch(/font-semibold/);

    fireEvent.press(getByTestId("schedule-settings-edit-days"));
    const editingClassName = getByTestId("schedule-settings-day-1").props.className;
    expect(editingClassName).toMatch(/w-9/);
    expect(editingClassName).toMatch(/h-9/);
  });
});
